import 'package:flowpost_desktop/app.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/config/config_controller.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/features/setup/data/setup_client.dart';
import 'package:flowpost_desktop/features/setup/data/wizard_resume_store.dart';
import 'package:flowpost_desktop/features/setup/domain/setup_steps.dart';
import 'package:flowpost_desktop/features/setup/setup_controller.dart';
import 'package:flowpost_desktop/features/settings/settings_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show LogicalKeyboardKey;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';

import '../../support/config_overrides.dart';
import '../../support/fake_credentials_store.dart';
import '../../support/fake_wizard_resume_store.dart';

const _saved = AppConfig(
  supabaseUrl: 'https://saved.supabase.co',
  supabaseAnonKey: 'saved-key',
  updateManifestUrl: '',
);

/// The two server calls, answered from memory: the wizard never touches the
/// network in a test, and a stored name is all it ever learns back.
class _FakeApi implements SetupApi {
  _FakeApi({Set<String> present = const {}}) : present = {...present};

  final Set<String> present;
  Object? storeFailure;
  final List<Map<String, String>> stored = [];
  final List<String> statusTokens = [];

  @override
  Future<ServerConfig> status(String token) async {
    statusTokens.add(token);
    return ServerConfig(present);
  }

  @override
  Future<List<String>> store(Map<String, String> values, String token) async {
    final failure = storeFailure;
    if (failure != null) throw failure;
    stored.add(values);
    present.addAll(values.keys);
    return values.keys.toList();
  }
}

void main() {
  late FakeCredentialsStore credentials;
  late FakeWizardResumeStore resume;
  late _FakeApi api;
  late List<Uri> launched;
  late List<AppConfig> probed;

  setUp(() {
    credentials = FakeCredentialsStore();
    resume = FakeWizardResumeStore();
    api = _FakeApi();
    launched = [];
    probed = [];
  });

  Future<void> pump(
    WidgetTester tester, {
    bool configured = false,
    String? token,
    String? deepLink,
    List<Override> extra = const [],
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          credentialsStoreProvider.overrideWithValue(credentials),
          wizardResumeStoreProvider.overrideWithValue(resume),
          setupApiProvider.overrideWithValue(api),
          urlLauncherProvider.overrideWithValue((uri) async {
            launched.add(uri);
            return true;
          }),
          connectionCheckProvider.overrideWithValue((config) async {
            probed.add(config);
            return 'The server answered.';
          }),
          if (configured) seededConfig(_saved),
          if (token != null) sessionTokenProvider.overrideWithValue(token),
          ...extra,
        ],
        child: FlowPostApp(
          // A machine that already has values starts on the app, so a test
          // that wants the wizard has to ask for it by name.
          initialDeepLink: deepLink ?? (configured ? '/setup' : null),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> tapKey(WidgetTester tester, Key key) async {
    final finder = find.byKey(key);
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  Future<void> typeKey(WidgetTester tester, Key key, String text) async {
    final finder = find.byKey(key);
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.enterText(finder, text);
    await tester.pump();
  }

  Future<void> chooseTrack(WidgetTester tester, Key track) async {
    await tapKey(tester, track);
    expect(find.byKey(const Key('setup-track-end-user')), findsNothing);
  }

  Future<void> toCaptionsStep(WidgetTester tester) =>
      tapKey(tester, const Key('setup-step-$setupIdCaptions'));

  group('the walk', () {
    testWidgets('a build with no values opens the wizard on its two tracks', (
      tester,
    ) async {
      await pump(tester);

      expect(find.text('Set up FlowPost'), findsOneWidget);
      expect(find.byKey(const Key('setup-track-end-user')), findsOneWidget);
      expect(find.byKey(const Key('setup-track-operator')), findsOneWidget);
      expect(find.text('Home'), findsNothing);
    });

    testWidgets('an end user is asked for the server, then the key', (
      tester,
    ) async {
      await pump(tester);
      await chooseTrack(tester, const Key('setup-track-end-user'));

      expect(find.text('Your server'), findsOneWidget);
      expect(find.byKey(const Key('setup-field-SUPABASE_URL')), findsOneWidget);
      expect(
        find.byKey(const Key('setup-step-$setupIdLicense')),
        findsOneWidget,
      );
      // Nothing before the server can be left out.
      expect(find.byKey(const Key('setup-skip')), findsNothing);
    });

    testWidgets('the operator walks every step of the server', (tester) async {
      await pump(tester);
      await chooseTrack(tester, const Key('setup-track-operator'));

      expect(find.text('Step 1 of 9'), findsOneWidget);
      for (final id in [
        setupIdDeploy,
        setupIdCaptions,
        setupIdMedia,
        setupIdGoogle,
        setupIdMeta,
        setupIdTikTok,
        setupIdLinkedIn,
        setupIdLicense,
      ]) {
        expect(
          find.byKey(Key('setup-step-$id')),
          findsOneWidget,
          reason: 'the $id step belongs in the list',
        );
      }
    });

    testWidgets('a step can be left for later without storing anything', (
      tester,
    ) async {
      await pump(tester, configured: true, token: 'session-token');
      await chooseTrack(tester, const Key('setup-track-operator'));
      await toCaptionsStep(tester);
      await tapKey(tester, const Key('setup-skip'));

      expect(find.text('Where the media lives'), findsOneWidget);
      expect(api.stored, isEmpty);
    });

    testWidgets('the other track is one tap away', (tester) async {
      await pump(tester);
      await chooseTrack(tester, const Key('setup-track-operator'));
      await tapKey(tester, const Key('setup-change-track'));

      expect(find.byKey(const Key('setup-track-end-user')), findsOneWidget);
    });

    testWidgets('a step change is kept for the next start', (tester) async {
      await pump(tester);
      await chooseTrack(tester, const Key('setup-track-operator'));
      await toCaptionsStep(tester);

      expect(resume.saved?.track, SetupTrack.operator);
      expect(resume.saved?.stepId, setupIdCaptions);
    });

    testWidgets('the wizard starts where the last one stopped', (tester) async {
      resume.saved = const WizardResume(
        track: SetupTrack.operator,
        stepId: setupIdMedia,
      );
      await pump(tester);

      expect(find.text('Where the media lives'), findsOneWidget);
      expect(find.byKey(const Key('setup-field-R2_BUCKET')), findsOneWidget);
    });
  });

  group('the server step', () {
    testWidgets('saving its values writes this machine and moves on', (
      tester,
    ) async {
      await pump(tester);
      await chooseTrack(tester, const Key('setup-track-end-user'));
      await typeKey(
        tester,
        const Key('setup-field-SUPABASE_URL'),
        'https://saved.supabase.co',
      );
      await typeKey(
        tester,
        const Key('setup-field-SUPABASE_ANON_KEY'),
        'a-key',
      );
      await tapKey(tester, const Key('setup-save'));

      expect(credentials.written?.supabaseUrl, 'https://saved.supabase.co');
      expect(credentials.written?.supabaseAnonKey, 'a-key');
      // No session yet, so the server was never asked about its own keys.
      expect(api.stored, isEmpty);
      expect(find.text('Unlock this machine'), findsOneWidget);
    });

    testWidgets('finishing the last step opens the app', (tester) async {
      await pump(tester);
      await chooseTrack(tester, const Key('setup-track-end-user'));
      await typeKey(
        tester,
        const Key('setup-field-SUPABASE_URL'),
        'https://saved.supabase.co',
      );
      await typeKey(
        tester,
        const Key('setup-field-SUPABASE_ANON_KEY'),
        'a-key',
      );
      await tapKey(tester, const Key('setup-save'));
      await tapKey(tester, const Key('setup-save'));

      expect(find.text('Home'), findsOneWidget);
    });

    testWidgets('a bad address is named and nothing is written', (
      tester,
    ) async {
      await pump(tester);
      await chooseTrack(tester, const Key('setup-track-end-user'));
      await typeKey(
        tester,
        const Key('setup-field-SUPABASE_URL'),
        'http://saved.supabase.co',
      );
      await typeKey(
        tester,
        const Key('setup-field-SUPABASE_ANON_KEY'),
        'a-key',
      );
      await tapKey(tester, const Key('setup-save'));

      expect(find.textContaining('Use an https address'), findsOneWidget);
      expect(credentials.written, isNull);
      expect(find.text('Your server'), findsOneWidget);
    });

    testWidgets('a service-role key is refused with a reason', (tester) async {
      await pump(tester);
      await chooseTrack(tester, const Key('setup-track-end-user'));
      await typeKey(
        tester,
        const Key('setup-field-SUPABASE_URL'),
        'https://saved.supabase.co',
      );
      await typeKey(
        tester,
        const Key('setup-field-SUPABASE_ANON_KEY'),
        'sb_secret_123',
      );
      await tapKey(tester, const Key('setup-save'));

      expect(
        find.text(
          'Publishable key: This looks like a service-role key. The app only '
          'accepts the public anon/publishable key.',
        ),
        findsOneWidget,
      );
      expect(credentials.written, isNull);
    });
    testWidgets('Test asks the typed address, not the saved one', (
      tester,
    ) async {
      await pump(tester);
      await chooseTrack(tester, const Key('setup-track-end-user'));
      await typeKey(
        tester,
        const Key('setup-field-SUPABASE_URL'),
        'https://typed.supabase.co',
      );
      await typeKey(
        tester,
        const Key('setup-field-SUPABASE_ANON_KEY'),
        'a-key',
      );
      await tapKey(tester, const Key('setup-test'));

      expect(probed.single.supabaseUrl, 'https://typed.supabase.co');
      expect(find.text('The server answered.'), findsOneWidget);
    });

    testWidgets('the values that cannot be used are still shown why', (
      tester,
    ) async {
      await pump(
        tester,
        extra: [
          configControllerProvider.overrideWith(
            () => ConfigController(
              initial: const ConfigState(
                problem:
                    'The saved credentials could not be used: The file is not '
                    'valid JSON.',
              ),
            ),
          ),
        ],
      );

      expect(find.byKey(const Key('setup-problem')), findsOneWidget);
      expect(find.textContaining('not valid JSON'), findsOneWidget);
    });
  });

  group('a server key step', () {
    testWidgets('a secret stays obscured until it is shown', (tester) async {
      await pump(tester, configured: true, token: 'session-token');
      await chooseTrack(tester, const Key('setup-track-operator'));
      await toCaptionsStep(tester);

      final field = find.byKey(const Key('setup-field-GROQ_API_KEY'));
      expect(tester.widget<TextField>(field).obscureText, isTrue);
      await tapKey(tester, const Key('setup-reveal-GROQ_API_KEY'));
      expect(tester.widget<TextField>(field).obscureText, isFalse);
    });

    testWidgets('Test reports what the server holds and marks the step', (
      tester,
    ) async {
      api = _FakeApi(present: {'GROQ_API_KEY'});
      await pump(tester, configured: true, token: 'session-token');
      await chooseTrack(tester, const Key('setup-track-operator'));
      await toCaptionsStep(tester);
      await tapKey(tester, const Key('setup-test'));

      expect(
        find.text('The server has every value this step needs.'),
        findsOneWidget,
      );
      expect(api.statusTokens, contains('session-token'));
    });

    testWidgets('a key the server will not take keeps the step open', (
      tester,
    ) async {
      api.storeFailure = const SetupException(SetupError.notOperator);
      await pump(tester, configured: true, token: 'session-token');
      await chooseTrack(tester, const Key('setup-track-operator'));
      await toCaptionsStep(tester);
      await typeKey(
        tester,
        const Key('setup-field-GROQ_API_KEY'),
        'gsk_a_value_that_stays_put',
      );
      await tapKey(tester, const Key('setup-save'));

      expect(
        find.textContaining('not the account that runs the server'),
        findsOneWidget,
      );
      expect(find.text('AI captions'), findsOneWidget);
      expect(api.stored, isEmpty);
    });

    testWidgets('a saved key never comes back to the field', (tester) async {
      api = _FakeApi(present: {'GROQ_API_KEY'});
      await pump(tester, configured: true, token: 'session-token');
      await chooseTrack(tester, const Key('setup-track-operator'));
      await toCaptionsStep(tester);
      await tester.pumpAndSettle();

      final field = tester.widget<TextField>(
        find.byKey(const Key('setup-field-GROQ_API_KEY')),
      );
      expect(field.controller?.text, isEmpty);
    });

    testWidgets('the console opens in the browser', (tester) async {
      await pump(tester, configured: true, token: 'session-token');
      await chooseTrack(tester, const Key('setup-track-operator'));
      await toCaptionsStep(tester);
      await tapKey(
        tester,
        const Key('setup-link-https://console.groq.com/keys'),
      );

      expect(launched, [Uri.parse('https://console.groq.com/keys')]);
    });

    testWidgets('the redirect addresses come from the saved server', (
      tester,
    ) async {
      await pump(tester, configured: true, deepLink: '/setup');
      await chooseTrack(tester, const Key('setup-track-operator'));
      await tapKey(tester, const Key('setup-step-$setupIdGoogle'));

      expect(
        find.text(
          'https://saved.supabase.co/functions/v1/youtube-auth?action=callback',
        ),
        findsOneWidget,
      );
    });
  });

  group('the license step', () {
    testWidgets('it links to the screen that takes the key', (tester) async {
      resume.saved = const WizardResume(
        track: SetupTrack.endUser,
        stepId: setupIdLicense,
      );
      await pump(tester, configured: true, deepLink: '/setup');
      await tapKey(tester, const Key('setup-open-license'));

      expect(find.text('Unlock FlowPost'), findsOneWidget);
    });

    testWidgets('a machine with a session says it is unlocked', (tester) async {
      resume.saved = const WizardResume(
        track: SetupTrack.endUser,
        stepId: setupIdLicense,
      );
      await pump(tester, configured: true, token: 'session-token');

      expect(find.text('This machine is unlocked.'), findsOneWidget);
    });
  });

  group('the walk without a mouse', () {
    testWidgets('Tab reaches the tracks and Enter picks one', (tester) async {
      await pump(tester);
      final tile = const Key('setup-track-operator');

      var reached = false;
      for (var press = 0; press < 30 && !reached; press++) {
        final focus = FocusManager.instance.primaryFocus;
        final context = focus?.context;
        if (context != null) {
          context.visitAncestorElements((element) {
            if (element.widget.key == tile) {
              reached = true;
              return false;
            }
            return true;
          });
        }
        if (reached) break;
        await tester.sendKeyEvent(LogicalKeyboardKey.tab);
        await tester.pumpAndSettle();
      }
      expect(reached, isTrue, reason: 'the track choice is keyboard reachable');

      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(find.text('Step 1 of 9'), findsOneWidget);

      // And a step of the list is picked the same way, so the whole walk can
      // be done without the pointer.
      final stepKey = const Key('setup-step-$setupIdDeploy');
      var onStep = false;
      for (var press = 0; press < 30 && !onStep; press++) {
        final context = FocusManager.instance.primaryFocus?.context;
        if (context != null) {
          context.visitAncestorElements((element) {
            if (element.widget.key == stepKey) {
              onStep = true;
              return false;
            }
            return true;
          });
        }
        if (onStep) break;
        await tester.sendKeyEvent(LogicalKeyboardKey.tab);
        await tester.pumpAndSettle();
      }
      expect(onStep, isTrue, reason: 'the step list is keyboard reachable');

      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(find.text('Deploy the functions'), findsOneWidget);
    });
  });

  testWidgets('the walk stays usable at 200% text on the minimum window', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    tester.view.physicalSize = const Size(1024, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await pump(tester);
    expect(find.byKey(const Key('setup-track-operator')), findsOneWidget);

    await chooseTrack(tester, const Key('setup-track-operator'));
    await toCaptionsStep(tester);
    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('setup-save')), findsOneWidget);
  });
}
