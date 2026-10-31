import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../data/identity_models.dart';
import '../identity_controller.dart';

/// The landing screen for `flowpost://auth-callback`.
///
/// The code is exchanged once, here; a rejected or failed callback explains
/// itself and offers the way back to sign in (SPEC-identity Flows).
class AuthCallbackPage extends ConsumerStatefulWidget {
  const AuthCallbackPage({super.key, required this.uri});

  final Uri uri;

  @override
  ConsumerState<AuthCallbackPage> createState() => _AuthCallbackPageState();
}

class _AuthCallbackPageState extends ConsumerState<AuthCallbackPage> {
  bool _busy = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_exchange());
  }

  Future<void> _exchange() async {
    final raw = widget.uri.hasQuery
        ? 'flowpost://auth-callback?${widget.uri.query}'
        : 'flowpost://auth-callback';
    try {
      await ref
          .read(identityControllerProvider.notifier)
          .completeGoogleSignIn(raw);
    } on IdentityException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message;
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_busy) ...[
                    const SizedBox(
                      width: 28,
                      height: 28,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    const SizedBox(height: 16),
                    const Text('Signing you in…'),
                  ] else ...[
                    Semantics(
                      liveRegion: true,
                      child: Text(
                        _error ?? IdentityError.oauthExchangeFailed.message,
                        key: const Key('callback-error'),
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.error,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextButton(
                      key: const Key('callback-back'),
                      onPressed: () => context.go(loginRoute),
                      child: const Text('Back to sign in'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
