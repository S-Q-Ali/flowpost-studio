import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/license_models.dart';
import '../license_controller.dart';

/// The only door into the app: a license key issued by the owner.
///
/// FlowPost is open source; the key unlocks the hosted backend, not the
/// source. Every failure is readable text, never only a toast.
class LicenseGatePage extends ConsumerStatefulWidget {
  const LicenseGatePage({super.key});

  @override
  ConsumerState<LicenseGatePage> createState() => _LicenseGatePageState();
}

class _LicenseGatePageState extends ConsumerState<LicenseGatePage> {
  final TextEditingController _key = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _key.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    final key = _key.text.trim();
    if (key.isEmpty) {
      setState(() => _error = LicenseError.missing.message);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    await ref.read(licenseControllerProvider.notifier).activate(key);
    if (!mounted) return;
    final next = ref.read(licenseControllerProvider).value;
    setState(() {
      _busy = false;
      if (next is Locked) {
        _error = next.text;
        _key.clear();
      }
    });
  }

  Future<void> _deactivate() async {
    if (_busy) return;
    await ref.read(licenseControllerProvider.notifier).deactivate();
    if (!mounted) return;
    _key.clear();
    setState(() => _error = null);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = ref.watch(licenseControllerProvider).value;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Unlock FlowPost', style: theme.textTheme.headlineSmall),
                  const SizedBox(height: 8),
                  Text(
                    'Enter the license key the owner issued for you. '
                    'FlowPost is open source; the key unlocks the hosted '
                    'backend, not the source.',
                    style: theme.textTheme.bodyMedium,
                  ),
                  if (state case Active(:final expiresAt, :final offline)) ...[
                    const SizedBox(height: 16),
                    Text(
                      'Active license · expires ${_date(expiresAt)}'
                      '${offline ? ' · offline' : ''}',
                      key: const Key('license-active'),
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.primary,
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  TextField(
                    key: const Key('license-key'),
                    controller: _key,
                    enabled: !_busy,
                    autocorrect: false,
                    enableSuggestions: false,
                    textInputAction: TextInputAction.done,
                    decoration: const InputDecoration(labelText: 'License key'),
                    onSubmitted: (_) => _submit(),
                  ),
                  if (_error case final message?) ...[
                    const SizedBox(height: 16),
                    Semantics(
                      liveRegion: true,
                      child: Text(
                        message,
                        key: const Key('license-error'),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.error,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  FilledButton(
                    key: const Key('license-submit'),
                    onPressed: _busy ? null : _submit,
                    child: Text(_busy ? 'Checking…' : 'Unlock'),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    key: const Key('license-deactivate'),
                    onPressed: _busy ? null : _deactivate,
                    child: const Text('Deactivate this PC'),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'No key yet? Ask the owner to issue one for your name. '
                    'A key works on the PCs you use.',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

String _date(DateTime value) {
  final local = value.toLocal();
  return '${local.year}-${_two(local.month)}-${_two(local.day)}';
}

String _two(int value) => value.toString().padLeft(2, '0');
