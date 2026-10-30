import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_config.dart';
import 'credentials_store.dart';

/// Where the values in use came from.
enum ConfigSource { compiled, saved }

/// The values the app is running on, or the reason it has none.
class ConfigState {
  const ConfigState({this.config, this.source, this.problem});

  final AppConfig? config;
  final ConfigSource? source;

  /// A sentence for the setup screen when the saved file could not be used.
  final String? problem;

  bool get needsSetup => config == null;
}

/// The saved values, as a seam the tests answer.
final credentialsStoreProvider = Provider<CredentialsStore>(
  (ref) => CredentialsStore(),
);

/// What the build carries from `--dart-define-from-file`; null when it has
/// nothing usable.
final compiledConfigProvider = Provider<AppConfig?>((ref) => null);

/// The values the app is running on. Main seeds it from the file and the
/// build; saving replaces them and every watcher follows (SPEC-credentials
/// Decision 5).
final configControllerProvider =
    NotifierProvider<ConfigController, ConfigState>(ConfigController.new);

class ConfigController extends Notifier<ConfigState> {
  ConfigController({this.initial = const ConfigState()});

  final ConfigState initial;

  @override
  ConfigState build() => initial;

  /// Writes [config] and makes it live; false when the file could not be
  /// written, and nothing in memory changes.
  Future<bool> save(AppConfig config) async {
    final written = await ref.read(credentialsStoreProvider).write(config);
    if (!written) return false;
    state = ConfigState(config: config, source: ConfigSource.saved);
    return true;
  }

  /// Forgets the saved values: the build's defaults come back, or the setup
  /// screen when there are none.
  Future<bool> clear() async {
    final cleared = await ref.read(credentialsStoreProvider).clear();
    if (!cleared) return false;
    final compiled = ref.read(compiledConfigProvider);
    state = compiled == null
        ? const ConfigState()
        : ConfigState(config: compiled, source: ConfigSource.compiled);
    return true;
  }
}

/// What startup makes of the file and the build: saved wins, an unusable file
/// stops at setup, no file falls back to the build (SPEC-credentials
/// "Precedence").
ConfigState resolveConfig({
  required CredentialsRead saved,
  required AppConfig? compiled,
}) {
  switch (saved) {
    case CredentialsFound(:final config):
      return ConfigState(config: config, source: ConfigSource.saved);
    case CredentialsInvalid(:final reason):
      // Never fall back: the requests would go to a backend the user did not
      // ask for.
      return ConfigState(
        problem: 'The saved credentials could not be used: $reason',
      );
    case CredentialsAbsent():
      return compiled == null
          ? const ConfigState()
          : ConfigState(config: compiled, source: ConfigSource.compiled);
  }
}
