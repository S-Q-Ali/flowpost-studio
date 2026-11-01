import 'dart:async';

import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/config/config_controller.dart';
import 'package:flowpost_desktop/core/config/credentials_store.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/features/setup/data/setup_client.dart';
import 'package:flowpost_desktop/features/setup/domain/setup_steps.dart';
import 'package:flowpost_desktop/features/setup/setup_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:logging/logging.dart';

import '../../support/fake_credentials_store.dart';

const AppConfig _config = AppConfig(
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'anon-key',
  updateManifestUrl: '',
);

class _FakeApi implements SetupApi {
  _FakeApi({this.present = const {}, this.failure});

  /// The names `config-status` says hold a value.
  Set<String> present;

  /// What the next call throws; null when the calls succeed.
  SetupException? failure;

  final List<String> statusTokens = [];
  final List<Map<String, String>> stored = [];

  @override
  Future<ServerConfig> status(String token) async {
    statusTokens.add(token);
    final failure = this.failure;
    if (failure != null) throw failure;
    return ServerConfig(present);
  }

  @override
  Future<List<String>> store(Map<String, String> values, String token) async {
    stored.add(values);
    final failure = this.failure;
    if (failure != null) throw failure;
    present = {...present, ...values.keys};
    return values.keys.toList();
  }
}

void main() {
  late _FakeApi api;
  late FakeCredentialsStore store;
  late ProviderContainer container;
  late List<LogRecord> records;
  late StreamSubscription<LogRecord> subscription;

  /// The step the captions wizard walks, looked up from the model.
  final SetupStep captionsStep = setupSteps[setupIdCaptions]!;
  final SetupStep serverStep = setupSteps[setupIdServer]!;
  final SetupStep mediaStep = setupSteps[setupIdMedia]!;

  setUp(() {
    api = _FakeApi();
    store = FakeCredentialsStore();
    records = [];
    Logger.root.level = Level.ALL;
    subscription = Logger.root.onRecord.listen(records.add);
  });

  tearDown(() => subscription.cancel());

  void build({
    String? token = 'session-token',
    bool configured = true,
    List<Override> extra = const [],
  }) {
    store.stored = configured
        ? const CredentialsFound(_config)
        : const CredentialsAbsent();
    container = ProviderContainer(
      overrides: [
        credentialsStoreProvider.overrideWithValue(store),
        if (configured)
          configControllerProvider.overrideWith(
            () => ConfigController(
              initial: const ConfigState(
                config: _config,
                source: ConfigSource.saved,
              ),
            ),
          ),
        sessionTokenProvider.overrideWithValue(token),
        setupApiProvider.overrideWithValue(api),
        ...extra,
      ],
    );
  }

  SetupProgress progress() => container.read(setupControllerProvider);

  test(
    'a step is ready only when the server holds every name it asks for',
    () async {
      api = _FakeApi(present: {'GROQ_API_KEY'});
      build();

      await container.read(setupControllerProvider.notifier).reload([
        captionsStep,
        mediaStep,
      ]);

      expect(progress().stateOf(captionsStep), SetupStepState.ready);
      // The media step needs five names and the server has none of them.
      expect(progress().stateOf(mediaStep), SetupStepState.unknown);
      expect(api.statusTokens, ['session-token']);
    },
  );

  test('with no session nothing is asked and nothing is claimed', () async {
    build(token: null);

    await container.read(setupControllerProvider.notifier).reload([
      captionsStep,
    ]);

    expect(api.statusTokens, isEmpty);
    expect(progress().stateOf(captionsStep), SetupStepState.unknown);
  });

  test(
    'a saved key is stored on the server and the step turns ready',
    () async {
      build();

      final problem = await container
          .read(setupControllerProvider.notifier)
          .save(captionsStep, {'GROQ_API_KEY': 'gsk_saved_value'});

      expect(problem, isNull);
      expect(api.stored, [
        {'GROQ_API_KEY': 'gsk_saved_value'},
      ]);
      expect(progress().stateOf(captionsStep), SetupStepState.ready);
    },
  );

  test('a value that fails its own rule never leaves the app', () async {
    build();

    final problem = await container.read(setupControllerProvider.notifier).save(
      captionsStep,
      {'GROQ_API_KEY': ''},
    );

    expect(problem, contains('Groq API key is required'));
    expect(api.stored, isEmpty);
    expect(progress().stateOf(captionsStep), SetupStepState.unknown);
  });

  test('a refused session fails the step with the sign-in sentence', () async {
    api = _FakeApi(
      failure: const SetupException(
        SetupError.signRequired,
        serverMessage: 'Sign in with the license key of this server first.',
      ),
    );
    build();

    final problem = await container.read(setupControllerProvider.notifier).save(
      captionsStep,
      {'GROQ_API_KEY': 'gsk_saved_value'},
    );

    expect(problem, 'Sign in with the license key of this server first.');
    expect(progress().stateOf(captionsStep), SetupStepState.failed);
    expect(progress().problemOf(captionsStep), problem);
  });

  test('a network failure is the offline sentence, not a stack', () async {
    api = _FakeApi(failure: const SetupException(SetupError.offline));
    build();

    final problem = await container.read(setupControllerProvider.notifier).save(
      mediaStep,
      {
        'R2_ENDPOINT': 'https://abc123.r2.cloudflarestorage.com',
        'R2_ACCESS_KEY': 'access-key-value',
        'R2_SECRET_KEY': 'secret-key-value',
        'R2_BUCKET': 'flowpost-media',
        'R2_PUBLIC_URL': 'pub-abc123.r2.dev',
      },
    );

    expect(problem, SetupError.offline.message);
    expect(progress().stateOf(mediaStep), SetupStepState.failed);
  });

  test('a value appears in no log line and no state field', () async {
    api = _FakeApi(
      failure: const SetupException(
        SetupError.unexpected,
        serverMessage: 'The values could not be stored. Try again.',
      ),
    );
    build();

    await container.read(setupControllerProvider.notifier).save(captionsStep, {
      'GROQ_API_KEY': 'gsk_never_in_a_log',
    });
    // A log record reaches its listeners on the next turn of the queue.
    await Future<void>.delayed(Duration.zero);

    final written = [
      for (final record in records) '${record.message}${record.error}',
      ...progress().problems.values,
    ];
    expect(written, isNotEmpty);
    expect(written.any((line) => line.contains('gsk_never_in_a_log')), isFalse);
  });

  test(
    'the server address and key are written on this PC, not stored remotely',
    () async {
      build();

      final problem = await container
          .read(setupControllerProvider.notifier)
          .save(serverStep, {
            'SUPABASE_URL': 'https://other.supabase.co',
            'SUPABASE_ANON_KEY': 'other-anon-key',
          });

      expect(problem, isNull);
      expect(api.stored, isEmpty);
      expect(store.written?.supabaseUrl, 'https://other.supabase.co');
      expect(store.written?.supabaseAnonKey, 'other-anon-key');
    },
  );

  test('the first run writes the file there is none of yet', () async {
    build(configured: false);

    final problem = await container.read(setupControllerProvider.notifier).save(
      serverStep,
      {
        'SUPABASE_URL': 'https://first.supabase.co',
        'SUPABASE_ANON_KEY': 'first-anon-key',
      },
    );

    expect(problem, isNull);
    expect(store.written?.supabaseUrl, 'https://first.supabase.co');
    expect(progress().stateOf(serverStep), SetupStepState.ready);
  });

  test('a step with nothing to type is not saved, and says so', () async {
    build();

    final deploy = setupSteps[setupIdDeploy]!;
    final problem = await container
        .read(setupControllerProvider.notifier)
        .save(deploy, const {});

    expect(problem, 'There is nothing to save on this step.');
    expect(progress().stateOf(deploy), SetupStepState.failed);
  });
}
