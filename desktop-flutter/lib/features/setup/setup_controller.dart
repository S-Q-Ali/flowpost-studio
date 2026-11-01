import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/app_config.dart';
import '../../core/config/config_controller.dart';
import '../../core/providers/app_providers.dart';
import '../../core/logging/app_logger.dart';
import 'data/setup_client.dart';
import 'data/wizard_resume_store.dart';
import 'domain/setup_steps.dart';

/// Where one step stands.
enum SetupStepState {
  /// Nothing has been asked yet.
  unknown,

  /// A call for this step is in flight.
  testing,

  /// Every value this step needs is where it belongs.
  ready,

  /// The last call for this step failed; [SetupProgress.problem] says why.
  failed,
}

/// What the wizard shows: one state per step, and the sentence for a failure.
class SetupProgress {
  const SetupProgress({this.steps = const {}, this.problems = const {}});

  final Map<String, SetupStepState> steps;
  final Map<String, String> problems;

  SetupStepState stateOf(SetupStep step) =>
      steps[step.id] ?? SetupStepState.unknown;

  String? problemOf(SetupStep step) => problems[step.id];

  bool get isBusy => steps.values.any((s) => s == SetupStepState.testing);

  SetupProgress _with(String id, SetupStepState state, {String? problem}) {
    final nextProblems = Map<String, String>.from(problems);
    if (problem == null) {
      nextProblems.remove(id);
    } else {
      nextProblems[id] = problem;
    }
    return SetupProgress(steps: {...steps, id: state}, problems: nextProblems);
  }
}

/// The client the wizard talks through; null while no server is configured.
final setupApiProvider = Provider<SetupApi?>((ref) {
  final config = ref.watch(configControllerProvider).config;
  if (config == null) return null;
  return SetupClient(
    supabaseUrl: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
  );
});

final setupControllerProvider =
    NotifierProvider<SetupController, SetupProgress>(SetupController.new);

/// Where the wizard left off, as a file the tests answer.
final Provider<WizardResumeStore> wizardResumeStoreProvider =
    Provider<WizardResumeStore>((ref) => WizardResumeStore());

/// Opens an address in the browser, as a seam the tests answer.
final Provider<Future<bool> Function(Uri)> urlLauncherProvider =
    Provider<Future<bool> Function(Uri)>((ref) {
      return (url) => launchUrl(url, mode: LaunchMode.externalApplication);
    });

/// The state of each guided step, read from the server and updated by a save.
///
/// The wizard is the only writer of these values, and every write is followed
/// by a read: a step is marked ready by what the server says it holds, not by
/// the app hoping the call went through.
class SetupController extends Notifier<SetupProgress> {
  static final Logger _log = Logger('setup');

  @override
  SetupProgress build() => const SetupProgress();

  /// Asks the server which of its keys hold a value and marks the steps that
  /// are complete. A step whose values live on this PC is read from them.
  ///
  /// Only the steps passed in are re-read; the rest keep what the last answer
  /// said, so a Test on one step does not blank the whole list.
  Future<void> reload(List<SetupStep> steps) async {
    final server = await _read();
    final next = <String, SetupStepState>{};
    for (final step in steps) {
      next[step.id] = _stepState(step, server);
    }
    state = SetupProgress(
      steps: {...state.steps, ...next},
      problems: state.problems,
    );
  }

  /// The server's report, or null when it could not be read.
  ///
  /// A step cannot be marked ready without an answer, and one cannot be marked
  /// failed either: the wizard leaves it unknown and says why on the call.
  Future<ServerConfig?> _read() async {
    final api = ref.read(setupApiProvider);
    final token = ref.read(sessionTokenProvider);
    if (api == null || token == null || token.isEmpty) return null;
    try {
      return await api.status(token);
    } on SetupException catch (error) {
      _log.warning('config-status refused: ${error.message}');
      return null;
    }
  }

  SetupStepState _stepState(SetupStep step, ServerConfig? server) {
    if (step.check == SetupCheck.license) {
      final token = ref.read(sessionTokenProvider);
      return (token != null && token.isNotEmpty)
          ? SetupStepState.ready
          : SetupStepState.unknown;
    }
    if (step.check == SetupCheck.connection) {
      final config = ref.read(configControllerProvider).config;
      if (config == null) return SetupStepState.unknown;
      return _localValuesComplete(step, config)
          ? SetupStepState.ready
          : SetupStepState.unknown;
    }
    final names = serverNamesOf(step);
    if (names.isEmpty) return SetupStepState.unknown;
    if (server == null) return SetupStepState.unknown;
    return server.hasAll(names) ? SetupStepState.ready : SetupStepState.unknown;
  }

  bool _localValuesComplete(SetupStep step, AppConfig config) {
    for (final field in step.fields) {
      if (field.optional) continue;
      final value = switch (field.name) {
        'SUPABASE_URL' => config.supabaseUrl,
        'SUPABASE_ANON_KEY' => config.supabaseAnonKey,
        'UPDATE_MANIFEST_URL' => config.updateManifestUrl,
        _ => '',
      };
      if (value.isEmpty) return false;
    }
    return true;
  }

  /// Stores [values] for [step], then re-reads the server's report.
  ///
  /// Returns null when everything landed, or the one sentence the operator has
  /// to act on. A value never comes back: it is not in the message, the log
  /// line or the state.
  Future<String?> save(SetupStep step, Map<String, String> values) async {
    for (final field in step.fields) {
      final problem = setupFieldProblem(field, values[field.name] ?? '');
      if (problem != null) return '${field.label}: $problem';
    }

    state = state._with(step.id, SetupStepState.testing);
    final local = <String, String>{
      for (final field in step.fields)
        if (field.store == SetupFieldStore.onThisMachine &&
            (values[field.name] ?? '').trim().isNotEmpty)
          field.name: values[field.name]!.trim(),
    };
    final server = <String, String>{
      for (final field in step.fields)
        if (field.store == SetupFieldStore.onServer &&
            (values[field.name] ?? '').trim().isNotEmpty)
          field.name: values[field.name]!.trim(),
    };

    if (local.isNotEmpty) {
      final failure = await _saveLocal(local);
      if (failure != null) return _fail(step, failure);
    }
    if (server.isNotEmpty) {
      final failure = await _saveServer(server);
      if (failure != null) return _fail(step, failure);
    }
    if (local.isEmpty && server.isEmpty) {
      return _fail(step, 'There is nothing to save on this step.');
    }

    await reload([step]);
    final after = state.stateOf(step);
    if (after == SetupStepState.ready) return null;
    return _fail(step, 'The server took the values but does not report them.');
  }

  Future<String?> _saveLocal(Map<String, String> values) async {
    // The first run has no config to merge with: the wizard is what makes one.
    final current =
        ref.read(configControllerProvider).config ??
        ref.read(compiledConfigProvider);
    final AppConfig next;
    try {
      next = AppConfig.fromValues(
        supabaseUrl: values['SUPABASE_URL'] ?? current?.supabaseUrl ?? '',
        supabaseAnonKey:
            values['SUPABASE_ANON_KEY'] ?? current?.supabaseAnonKey ?? '',
        updateManifestUrl:
            values['UPDATE_MANIFEST_URL'] ?? current?.updateManifestUrl ?? '',
      );
    } on ConfigException catch (error) {
      return error.message;
    }
    final written = await ref
        .read(configControllerProvider.notifier)
        .save(next);
    return written ? null : 'The values could not be written on this PC.';
  }

  Future<String?> _saveServer(Map<String, String> values) async {
    final api = ref.read(setupApiProvider);
    final token = ref.read(sessionTokenProvider);
    if (api == null) return 'Set the server address on this PC first.';
    if (token == null || token.isEmpty) return SetupError.signRequired.message;
    try {
      await api.store(values, token);
      return null;
    } on SetupException catch (error) {
      // The exception carries no value, so this line cannot leak one.
      _log.warning('operator-config refused (${error.error.name})');
      return error.message;
    }
  }

  String _fail(SetupStep step, String problem) {
    // Only the sentence is kept; the values that produced it are not.
    final safe = cleanFailureText(problem);
    state = state._with(step.id, SetupStepState.failed, problem: safe);
    return safe;
  }

  /// The step's own state after asking the server again.
  Future<void> test(SetupStep step) => reload([step]);

  /// Forgets a failure the operator has since corrected by hand.
  void clearProblem(SetupStep step) =>
      state = state._with(step.id, SetupStepState.unknown);
}
