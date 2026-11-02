import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/app_config.dart';
import '../../../core/config/config_controller.dart';
import '../../../core/providers/app_providers.dart';
import '../../../core/router/app_router.dart';
import '../../settings/settings_providers.dart';
import '../data/wizard_resume_store.dart';
import '../domain/setup_steps.dart';
import '../setup_controller.dart';

/// The guided set-up: two tracks, one step at a time, with the reason for each.
///
/// The wizard is the only place a new machine learns what it needs, so it sits
/// outside the app shell (SPEC-setup). It never shows a value it stored on the
/// server: `config-status` answers with names, and the fields stay empty.
class SetupWizardPage extends ConsumerStatefulWidget {
  const SetupWizardPage({super.key});

  @override
  ConsumerState<SetupWizardPage> createState() => _SetupWizardPageState();
}

class _SetupWizardPageState extends ConsumerState<SetupWizardPage> {
  final Map<String, TextEditingController> _fields = {};
  final Set<String> _revealed = {};

  SetupTrack? _track;
  String? _stepId;
  bool _busy = false;
  String? _message;
  bool _messageIsProblem = false;

  @override
  void initState() {
    super.initState();
    _resume();
  }

  @override
  void dispose() {
    for (final controller in _fields.values) {
      controller.dispose();
    }
    super.dispose();
  }

  /// Where the last run stopped, so a restart does not start the walk again.
  Future<void> _resume() async {
    final stored = await ref.read(wizardResumeStoreProvider).read();
    if (!mounted || stored == null) return;
    setState(() {
      _track = stored.track;
      _stepId = stored.stepId;
    });
    _refresh();
  }

  List<SetupStep> get _steps =>
      _track == null ? const [] : setupStepsFor(_track!);

  SetupStep? get _step {
    final id = _stepId;
    if (id == null) return null;
    for (final step in _steps) {
      if (step.id == id) return step;
    }
    return null;
  }

  int get _index {
    final steps = _steps;
    final at = steps.indexWhere((step) => step.id == _stepId);
    return at < 0 ? 0 : at;
  }

  bool get _isLastStep => _index >= _steps.length - 1;

  void _choose(SetupTrack track) {
    setState(() {
      _track = track;
      _stepId = setupStepsFor(track).first.id;
      _message = null;
    });
    _remember();
    _refresh();
  }

  /// Back to the two tracks; the values already saved stay where they are.
  void _changeTrack() => setState(() {
    _track = null;
    _stepId = null;
    _message = null;
  });

  void _showStep(String id) {
    setState(() {
      _stepId = id;
      _message = null;
    });
    _remember();
  }

  void _advance() {
    final steps = _steps;
    if (_isLastStep) {
      _finish();
      return;
    }
    _showStep(steps[_index + 1].id);
  }

  void _back() {
    if (_index == 0) return;
    _showStep(_steps[_index - 1].id);
  }

  void _finish() => context.go(homeRoute);

  void _remember() {
    final track = _track;
    final id = _stepId;
    if (track == null || id == null) return;
    // Best effort: a resume the disk refused is only a lost place-mark.
    ref
        .read(wizardResumeStoreProvider)
        .write(WizardResume(track: track, stepId: id));
  }

  void _refresh() {
    final steps = _steps;
    if (steps.isEmpty) return;
    ref.read(setupControllerProvider.notifier).reload(steps);
  }

  Future<void> _save() async {
    final step = _step;
    if (step == null || _busy) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    final failure = await ref.read(setupControllerProvider.notifier).save(
      step,
      {for (final field in step.fields) field.name: _controller(field).text},
    );
    if (!mounted) return;
    if (failure != null) {
      setState(() {
        _busy = false;
        _message = failure;
        _messageIsProblem = true;
      });
      return;
    }
    setState(() => _busy = false);
    _advance();
  }

  Future<void> _test() async {
    final step = _step;
    if (step == null || _busy || step.check == SetupCheck.license) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    final answer = step.check == SetupCheck.connection
        ? await _probeConnection()
        : await _probeServer(step);
    if (!mounted) return;
    setState(() {
      _busy = false;
      // A test result is a report, not a refusal: the step's own icon carries
      // the verdict, so this line never paints as an error.
      _message = answer;
      _messageIsProblem = false;
    });
  }

  /// The typed values, before they are saved, against the server itself.
  Future<String> _probeConnection() async {
    final saved = ref.read(configControllerProvider).config;
    final AppConfig config;
    try {
      config = AppConfig.fromValues(
        supabaseUrl: _text('SUPABASE_URL', saved?.supabaseUrl ?? ''),
        supabaseAnonKey: _text(
          'SUPABASE_ANON_KEY',
          saved?.supabaseAnonKey ?? '',
        ),
        updateManifestUrl: _text(
          'UPDATE_MANIFEST_URL',
          saved?.updateManifestUrl ?? '',
        ),
      );
    } on ConfigException catch (error) {
      return error.message;
    }
    return ref.read(connectionCheckProvider)(config);
  }

  /// What the server's own report says about this step right now.
  Future<String> _probeServer(SetupStep step) async {
    await ref.read(setupControllerProvider.notifier).test(step);
    final progress = ref.read(setupControllerProvider);
    return switch (progress.stateOf(step)) {
      SetupStepState.ready => 'The server has every value this step needs.',
      SetupStepState.failed =>
        progress.problemOf(step) ?? 'The server refused the check.',
      _ => 'The server does not report these values yet.',
    };
  }

  Future<void> _open(String url) async {
    final opened = await ref.read(urlLauncherProvider)(Uri.parse(url));
    if (!mounted || opened) return;
    setState(() {
      _message = 'The browser did not open. Select the address and copy it.';
      _messageIsProblem = true;
    });
  }

  String _buttonLabel(SetupStep step) {
    if (_isLastStep) return 'Finish';
    // A step with nothing to type is proven, not saved: the commands are run
    // elsewhere and the server is asked again.
    return step.fields.isEmpty ? 'Continue' : 'Save and continue';
  }

  String _text(String name, String fallback) => _fields[name]?.text ?? fallback;

  TextEditingController _controller(SetupField field) =>
      _fields.putIfAbsent(field.name, () {
        // A value the server holds is never read back, so only this PC's own
        // fields can start from what is already saved.
        final saved = ref.read(configControllerProvider).config;
        final initial = field.store == SetupFieldStore.onThisMachine
            ? switch (field.name) {
                'SUPABASE_URL' => saved?.supabaseUrl ?? '',
                'SUPABASE_ANON_KEY' => saved?.supabaseAnonKey ?? '',
                'UPDATE_MANIFEST_URL' => saved?.updateManifestUrl ?? '',
                _ => '',
              }
            : '';
        return TextEditingController(text: initial);
      });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final problem = ref.watch(configControllerProvider).problem;
    final track = _track;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 980),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Set up FlowPost', style: theme.textTheme.headlineSmall),
                  const SizedBox(height: 8),
                  if (problem != null)
                    Text(
                      problem,
                      key: const Key('setup-problem'),
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.error,
                      ),
                    ),
                  Expanded(
                    child: track == null
                        ? _chooser(theme)
                        : _wizard(track, theme),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _chooser(ThemeData theme) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Who is setting this app up?',
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              key: const Key('setup-track-end-user'),
              leading: const Icon(Icons.person_outline),
              title: const Text('Just me'),
              subtitle: const Text(
                'Point the app at the server you were given and unlock this '
                'PC with your license key. Two steps.',
              ),
              onTap: () => _choose(SetupTrack.endUser),
            ),
          ),
          Card(
            child: ListTile(
              key: const Key('setup-track-operator'),
              leading: const Icon(Icons.dns_outlined),
              title: const Text('I run the server'),
              subtitle: const Text(
                'The server itself: the functions on it and the keys it reads '
                'for captions, media and each platform. Longer, and the free '
                'tiers cover it.',
              ),
              onTap: () => _choose(SetupTrack.operator),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'A step can be left for later. The wizard remembers where you '
            'stopped.',
            style: theme.textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  Widget _wizard(SetupTrack track, ThemeData theme) {
    final progress = ref.watch(setupControllerProvider);
    final steps = _steps;
    final step = _step;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 250,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  track == SetupTrack.operator ? 'The server' : 'This PC',
                  style: theme.textTheme.titleSmall,
                ),
                const SizedBox(height: 8),
                for (var i = 0; i < steps.length; i++)
                  _stepRow(steps[i], i, progress.stateOf(steps[i]), theme),
                const SizedBox(height: 8),
                TextButton(
                  key: const Key('setup-change-track'),
                  onPressed: _changeTrack,
                  child: const Text('Set up the other track'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 24),
        Expanded(
          child: step == null
              ? const SizedBox.shrink()
              : SingleChildScrollView(child: _panel(step, progress, theme)),
        ),
      ],
    );
  }

  Widget _stepRow(
    SetupStep step,
    int index,
    SetupStepState state,
    ThemeData theme,
  ) {
    final selected = step.id == _stepId;
    return ListTile(
      key: Key('setup-step-${step.id}'),
      selected: selected,
      dense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 8),
      leading: _stateIcon(state),
      title: Text('${index + 1}. ${step.title}'),
      subtitle: Text(switch (state) {
        SetupStepState.ready => 'Done',
        SetupStepState.failed => 'Needs attention',
        SetupStepState.testing => 'Checking…',
        SetupStepState.unknown => step.skippable ? 'Optional' : 'Needed',
      }, style: theme.textTheme.bodySmall),
      onTap: () => _showStep(step.id),
    );
  }

  Widget _stateIcon(SetupStepState state) => switch (state) {
    SetupStepState.ready => Icon(
      Icons.check_circle,
      color: Theme.of(context).colorScheme.primary,
    ),
    SetupStepState.testing => const SizedBox(
      width: 18,
      height: 18,
      child: CircularProgressIndicator(strokeWidth: 2),
    ),
    SetupStepState.failed => Icon(
      Icons.error_outline,
      color: Theme.of(context).colorScheme.error,
    ),
    SetupStepState.unknown => Icon(
      Icons.radio_button_unchecked,
      color: Theme.of(context).colorScheme.onSurfaceVariant,
    ),
  };

  Widget _panel(SetupStep step, SetupProgress progress, ThemeData theme) {
    final config = ref.watch(configControllerProvider).config;
    final callbacks = config == null
        ? const <String>[]
        : callbackUrisOf(step, config.supabaseUrl);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Step ${_index + 1} of ${_steps.length}',
          style: theme.textTheme.bodySmall,
        ),
        Text(
          step.title,
          key: const Key('setup-step-title'),
          style: theme.textTheme.titleLarge,
        ),
        const SizedBox(height: 8),
        Text(
          step.why,
          key: const Key('setup-step-why'),
          style: theme.textTheme.bodyMedium,
        ),
        const SizedBox(height: 8),
        Text(
          step.cost,
          key: const Key('setup-step-cost'),
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        if (step.links.isNotEmpty) ...[
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              for (final link in step.links)
                TextButton.icon(
                  key: Key('setup-link-${link.url}'),
                  onPressed: _busy ? null : () => _open(link.url),
                  icon: const Icon(Icons.open_in_new, size: 16),
                  label: Text(link.label),
                ),
            ],
          ),
        ],
        if (callbacks.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('Redirect URIs to register', style: theme.textTheme.titleSmall),
          for (final uri in callbacks)
            SelectableText(
              uri,
              key: Key('setup-callback-${step.id}-$uri'),
              style: theme.textTheme.bodySmall,
            ),
          Text(
            'Add each one exactly as it appears.',
            style: theme.textTheme.bodySmall,
          ),
        ] else if (step.callbacks.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(
            'Save the server address first; the redirect addresses are built '
            'from it.',
            style: theme.textTheme.bodySmall,
          ),
        ],
        if (step.instructions.isNotEmpty) ...[
          const SizedBox(height: 16),
          for (final line in step.instructions)
            SelectableText(
              line,
              style: theme.textTheme.bodySmall?.copyWith(
                fontFamily: 'Consolas',
              ),
            ),
        ],
        if (step.check == SetupCheck.license) ...[
          const SizedBox(height: 16),
          Text(
            progress.stateOf(step) == SetupStepState.ready
                ? 'This machine is unlocked.'
                : 'This machine is not unlocked yet.',
            key: const Key('setup-license-state'),
            style: theme.textTheme.bodyMedium,
          ),
        ],
        if (step.fields.isNotEmpty) ...[
          const SizedBox(height: 16),
          for (final field in step.fields) _field(field, step, theme),
        ],
        const SizedBox(height: 20),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            FilledButton(
              key: const Key('setup-save'),
              onPressed: _busy
                  ? null
                  : (step.fields.isEmpty ? _advance : _save),
              child: Text(_buttonLabel(step)),
            ),
            if (step.check != SetupCheck.license)
              OutlinedButton(
                key: const Key('setup-test'),
                onPressed: _busy ? null : _test,
                child: const Text('Test'),
              ),
            if (step.check == SetupCheck.license && config != null)
              FilledButton.tonal(
                key: const Key('setup-open-license'),
                onPressed: () => context.go(licenseRoute),
                child: const Text('Open the license screen'),
              ),
            if (step.skippable && !_isLastStep)
              TextButton(
                key: const Key('setup-skip'),
                onPressed: _busy ? null : _advance,
                child: const Text('Skip for now'),
              ),
            if (_index > 0)
              TextButton(
                key: const Key('setup-back'),
                onPressed: _busy ? null : _back,
                child: const Text('Back'),
              ),
          ],
        ),
        if (_message case final text?) ...[
          const SizedBox(height: 12),
          Semantics(
            liveRegion: true,
            child: Text(
              text,
              key: const Key('setup-message'),
              style: theme.textTheme.bodyMedium?.copyWith(
                color: _messageIsProblem ? theme.colorScheme.error : null,
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _field(SetupField field, SetupStep step, ThemeData theme) {
    final isSecret = field.style == SetupFieldStyle.secret;
    final revealed = _revealed.contains(field.name);
    final storedOnServer =
        field.store == SetupFieldStore.onServer &&
        ref.watch(setupControllerProvider).stateOf(step) ==
            SetupStepState.ready;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        key: Key('setup-field-${field.name}'),
        controller: _controller(field),
        obscureText: isSecret && !revealed,
        autocorrect: false,
        enableSuggestions: false,
        decoration: InputDecoration(
          labelText: field.optional ? '${field.label} (optional)' : field.label,
          helperText:
              field.help ??
              (storedOnServer
                  ? 'Already on the server — typing here replaces it.'
                  : null),
          helperMaxLines: 3,
          suffixIcon: isSecret
              ? IconButton(
                  key: Key('setup-reveal-${field.name}'),
                  tooltip: revealed ? 'Hide' : 'Show',
                  onPressed: () => setState(
                    () => revealed
                        ? _revealed.remove(field.name)
                        : _revealed.add(field.name),
                  ),
                  icon: Icon(
                    revealed ? Icons.visibility_off : Icons.visibility,
                  ),
                )
              : null,
        ),
      ),
    );
  }
}
