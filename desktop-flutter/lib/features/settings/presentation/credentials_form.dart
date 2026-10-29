import 'package:flutter/material.dart';

import '../../../core/config/app_config.dart';

/// The three values, in one form the setup screen and Settings share.
///
/// Validation is the same [configFieldProblem] the compiled path uses, so a
/// value that saves is a value the app can run on.
class CredentialsForm extends StatefulWidget {
  const CredentialsForm({
    super.key,
    required this.initial,
    required this.submitLabel,
    required this.onSubmit,
    this.sourceLine,
    this.onTest,
    this.onClear,
  });

  /// The values the form starts from; a rebuild with a new [key] re-reads
  /// them, which is how a clear or a save replaces the fields.
  final AppConfig? initial;
  final String submitLabel;

  /// Saves the values; null means saved, a sentence means what went wrong.
  final Future<String?> Function(AppConfig config) onSubmit;

  /// Which values are live, shown above the fields.
  final String? sourceLine;

  /// Tests the values as typed; null hides the action.
  final Future<String> Function(AppConfig config)? onTest;

  /// Clears the saved values; null hides the action.
  final Future<bool> Function()? onClear;

  @override
  State<CredentialsForm> createState() => _CredentialsFormState();
}

class _CredentialsFormState extends State<CredentialsForm> {
  late final TextEditingController _url = TextEditingController(
    text: widget.initial?.supabaseUrl ?? '',
  );
  late final TextEditingController _key = TextEditingController(
    text: widget.initial?.supabaseAnonKey ?? '',
  );
  late final TextEditingController _manifest = TextEditingController(
    text: widget.initial?.updateManifestUrl ?? '',
  );

  final Map<ConfigField, String?> _problems = {};
  bool _showKey = false;
  bool _busy = false;
  String? _message;

  @override
  void dispose() {
    _url.dispose();
    _key.dispose();
    _manifest.dispose();
    super.dispose();
  }

  AppConfig? _values() {
    final problem =
        configFieldProblem(ConfigField.supabaseUrl, _url.text) ??
        configFieldProblem(ConfigField.supabaseAnonKey, _key.text) ??
        configFieldProblem(ConfigField.updateManifestUrl, _manifest.text);
    if (problem != null) return null;
    return AppConfig.fromValues(
      supabaseUrl: _url.text,
      supabaseAnonKey: _key.text,
      updateManifestUrl: _manifest.text,
    );
  }

  void _validate() {
    _problems
      ..clear()
      ..[ConfigField.supabaseUrl] = configFieldProblem(
        ConfigField.supabaseUrl,
        _url.text,
      )
      ..[ConfigField.supabaseAnonKey] = configFieldProblem(
        ConfigField.supabaseAnonKey,
        _key.text,
      )
      ..[ConfigField.updateManifestUrl] = configFieldProblem(
        ConfigField.updateManifestUrl,
        _manifest.text,
      );
  }

  Future<void> _submit() async {
    setState(() {
      _validate();
      _message = null;
    });
    final config = _values();
    if (config == null) return;
    setState(() => _busy = true);
    try {
      final error = await widget.onSubmit(config);
      if (!mounted) return;
      setState(() => _message = error ?? 'Saved.');
    } on Object {
      if (!mounted) return;
      setState(() => _message = 'That did not work. Try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _test() async {
    setState(() {
      _validate();
      _message = null;
    });
    final config = _values();
    if (config == null) return;
    await _run(() async => _message = await widget.onTest!(config));
  }

  Future<void> _clear() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: const Text(
          'The saved values will be removed. The app goes back to the values '
          'it was built with, or to setup when there are none.',
        ),
        actions: [
          TextButton(
            key: const Key('credentials-keep'),
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep them'),
          ),
          FilledButton(
            key: const Key('credentials-clear-confirm'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Clear'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _run(() async {
      final cleared = await widget.onClear!();
      _message = cleared
          ? 'The saved values were removed.'
          : 'The saved values could not be removed.';
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
      if (!mounted) return;
    } on Object {
      if (!mounted) return;
      setState(() => _message = 'That did not work. Try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sourceLine = widget.sourceLine;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (sourceLine != null) ...[
          Text(
            sourceLine,
            key: const Key('credentials-source'),
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
        ],
        TextField(
          key: const Key('credentials-url'),
          controller: _url,
          keyboardType: TextInputType.url,
          autocorrect: false,
          decoration: InputDecoration(
            labelText: 'Supabase address',
            hintText: 'https://project.supabase.co',
            errorText: _problems[ConfigField.supabaseUrl],
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('credentials-key'),
          controller: _key,
          obscureText: !_showKey,
          autocorrect: false,
          enableSuggestions: false,
          decoration: InputDecoration(
            labelText: 'Anon key',
            errorText: _problems[ConfigField.supabaseAnonKey],
            suffixIcon: IconButton(
              key: const Key('credentials-show-key'),
              tooltip: _showKey ? 'Hide key' : 'Show key',
              onPressed: () => setState(() => _showKey = !_showKey),
              icon: Icon(_showKey ? Icons.visibility_off : Icons.visibility),
            ),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('credentials-manifest'),
          controller: _manifest,
          keyboardType: TextInputType.url,
          autocorrect: false,
          decoration: InputDecoration(
            labelText: 'Update manifest address (optional)',
            hintText: 'https://example.com/update.json',
            errorText: _problems[ConfigField.updateManifestUrl],
          ),
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            FilledButton(
              key: const Key('credentials-submit'),
              onPressed: _busy ? null : _submit,
              child: Text(widget.submitLabel),
            ),
            if (widget.onTest != null)
              OutlinedButton(
                key: const Key('credentials-test'),
                onPressed: _busy ? null : _test,
                child: const Text('Test connection'),
              ),
            if (widget.onClear != null)
              TextButton(
                key: const Key('credentials-clear'),
                onPressed: _busy ? null : _clear,
                child: const Text('Clear saved values'),
              ),
          ],
        ),
        if (_message != null) ...[
          const SizedBox(height: 12),
          Semantics(
            liveRegion: true,
            child: Text(
              _message!,
              key: const Key('credentials-message'),
              style: theme.textTheme.bodySmall,
            ),
          ),
        ],
      ],
    );
  }
}
