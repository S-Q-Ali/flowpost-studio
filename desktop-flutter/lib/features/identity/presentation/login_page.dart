import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/identity_models.dart';
import '../data/oauth_flow.dart';
import '../identity_controller.dart';
import '../identity_providers.dart';

/// The only door into the app: the administrator's email/password or Google
/// (SPEC-identity Flows). Every failure is readable text, never only a toast.
class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();
  final FocusNode _passwordFocus = FocusNode();

  bool _busy = false;
  bool _googleWaiting = false;
  String? _error;
  Timer? _googleTimeout;

  @override
  void dispose() {
    _googleTimeout?.cancel();
    _email.dispose();
    _password.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Enter your email address and password.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(identityControllerProvider.notifier)
          .signInWithPassword(email, password);
    } on IdentityException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _google() async {
    if (_busy || _googleWaiting) return;
    setState(() {
      _googleWaiting = true;
      _error = null;
    });
    try {
      final url = await ref
          .read(identityControllerProvider.notifier)
          .startGoogleSignIn();
      final opened = await ref.read(browserLauncherProvider)(Uri.parse(url));
      if (!opened) {
        await _endGoogleWait();
        if (mounted) {
          setState(
            () => _error =
                'Could not open the browser. Try signing in with your email '
                'address instead.',
          );
        }
        return;
      }
      _googleTimeout = Timer(OAuthFlow.stateLifetime, _expireGoogleWait);
    } on IdentityException catch (error) {
      await _endGoogleWait();
      if (mounted) setState(() => _error = error.message);
    }
  }

  Future<void> _expireGoogleWait() async {
    await _endGoogleWait();
    if (mounted) {
      setState(() => _error = IdentityError.oauthStateInvalid.message);
    }
  }

  Future<void> _cancelGoogle() async {
    await _endGoogleWait();
    if (mounted) setState(() => _error = null);
  }

  /// Stops the wait and drops the pending state, so a late browser callback
  /// cannot sign anyone in after the user gave up.
  Future<void> _endGoogleWait() async {
    _googleTimeout?.cancel();
    _googleTimeout = null;
    try {
      await ref.read(identityControllerProvider.notifier).cancelGoogleSignIn();
    } on IdentityException {
      // The state expires on its own; the wait still ends.
    }
    if (mounted) setState(() => _googleWaiting = false);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Sign in to FlowPost',
                      style: theme.textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Use the administrator account for this desktop build.',
                      style: theme.textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 24),
                    TextField(
                      key: const Key('login-email'),
                      controller: _email,
                      enabled: !_busy,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(labelText: 'Email'),
                      onSubmitted: (_) => _passwordFocus.requestFocus(),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      key: const Key('login-password'),
                      controller: _password,
                      focusNode: _passwordFocus,
                      enabled: !_busy,
                      obscureText: true,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.password],
                      decoration: const InputDecoration(labelText: 'Password'),
                      onSubmitted: (_) => _submit(),
                    ),
                    if (_error case final message?) ...[
                      const SizedBox(height: 16),
                      Semantics(
                        liveRegion: true,
                        child: Text(
                          message,
                          key: const Key('login-error'),
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.error,
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                    FilledButton(
                      key: const Key('login-submit'),
                      onPressed: _busy ? null : _submit,
                      child: Text(_busy ? 'Signing in…' : 'Sign in'),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        const Expanded(child: Divider()),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: Text('or', style: theme.textTheme.bodySmall),
                        ),
                        const Expanded(child: Divider()),
                      ],
                    ),
                    const SizedBox(height: 16),
                    if (_googleWaiting)
                      Row(
                        key: const Key('login-waiting'),
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                          const SizedBox(width: 12),
                          const Flexible(child: Text('Waiting for Google…')),
                          TextButton(
                            key: const Key('login-cancel-google'),
                            onPressed: _cancelGoogle,
                            child: const Text('Cancel'),
                          ),
                        ],
                      )
                    else
                      OutlinedButton(
                        key: const Key('login-google'),
                        onPressed: _busy ? null : _google,
                        child: const Text('Continue with Google'),
                      ),
                    const SizedBox(height: 24),
                    Text(
                      'Sign-up is closed. Use the account the admin created.',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
