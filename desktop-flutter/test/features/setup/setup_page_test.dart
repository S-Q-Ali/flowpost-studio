import 'package:flowpost_desktop/app.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/config/config_controller.dart';
import 'package:flowpost_desktop/core/config/credentials_store.dart';
import 'package:flowpost_desktop/core/update/app_version.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_credentials_store.dart';

const _saved = AppConfig(
  supabaseUrl: 'https://saved.supabase.co',
  supabaseAnonKey: 'saved-key',
  updateManifestUrl: '',
);

void main() {
  testWidgets('a build with no values starts on setup', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          credentialsStoreProvider.overrideWithValue(FakeCredentialsStore()),
        ],
        child: const FlowPostApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Set up FlowPost'), findsOneWidget);
    expect(find.byKey(const Key('setup-form')), findsOneWidget);
    expect(find.text('Home'), findsNothing);
  });

  testWidgets('a saved file that cannot be used says why', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          credentialsStoreProvider.overrideWithValue(FakeCredentialsStore()),
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
        child: const FlowPostApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('setup-problem')), findsOneWidget);
    expect(find.textContaining('not valid JSON'), findsOneWidget);
  });

  testWidgets('a bad address is named and nothing is written', (tester) async {
    final store = FakeCredentialsStore();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [credentialsStoreProvider.overrideWithValue(store)],
        child: const FlowPostApp(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('credentials-url')),
      'http://saved.supabase.co',
    );
    await tester.enterText(find.byKey(const Key('credentials-key')), 'a-key');
    await tester.tap(find.byKey(const Key('credentials-submit')));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'Use an https address, for example https://project.supabase.co',
      ),
      findsOneWidget,
    );
    expect(store.written, isNull);
    expect(find.text('Set up FlowPost'), findsOneWidget);
  });

  testWidgets('saving usable values opens the app', (tester) async {
    final store = FakeCredentialsStore();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [credentialsStoreProvider.overrideWithValue(store)],
        child: const FlowPostApp(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('credentials-url')),
      'https://saved.supabase.co',
    );
    await tester.enterText(find.byKey(const Key('credentials-key')), 'a-key');
    await tester.tap(find.byKey(const Key('credentials-submit')));
    await tester.pumpAndSettle();

    expect(store.written?.supabaseUrl, 'https://saved.supabase.co');
    expect(store.written?.supabaseAnonKey, 'a-key');
    expect(find.text('Set up FlowPost'), findsNothing);
    expect(find.text('Home'), findsOneWidget);
  });

  testWidgets('a service-role key is refused with a reason', (tester) async {
    final store = FakeCredentialsStore();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [credentialsStoreProvider.overrideWithValue(store)],
        child: const FlowPostApp(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('credentials-url')),
      'https://saved.supabase.co',
    );
    await tester.enterText(
      find.byKey(const Key('credentials-key')),
      'sb_secret_123',
    );
    await tester.tap(find.byKey(const Key('credentials-submit')));
    await tester.pumpAndSettle();

    expect(find.textContaining('service-role'), findsOneWidget);
    expect(store.written, isNull);
  });

  testWidgets('keeps its fields usable at 200% text on the minimum window', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    tester.view.physicalSize = const Size(1024, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          credentialsStoreProvider.overrideWithValue(FakeCredentialsStore()),
        ],
        child: const FlowPostApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Set up FlowPost'), findsOneWidget);
    expect(find.byKey(const Key('credentials-submit')), findsOneWidget);
  });

  testWidgets('clearing the saved values from Settings returns to setup', (
    tester,
  ) async {
    final store = FakeCredentialsStore()
      ..stored = const CredentialsFound(_saved);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          credentialsStoreProvider.overrideWithValue(store),
          configControllerProvider.overrideWith(
            () => ConfigController(
              initial: const ConfigState(
                config: _saved,
                source: ConfigSource.saved,
              ),
            ),
          ),
          appVersionProvider.overrideWith(
            (ref) async =>
                const AppVersionInfo(version: '1.2.3', buildNumber: '7'),
          ),
        ],
        child: const FlowPostApp(initialDeepLink: '/settings'),
      ),
    );
    await tester.pumpAndSettle();

    final clear = find.byKey(const Key('credentials-clear'));
    await tester.ensureVisible(clear);
    await tester.pumpAndSettle();
    await tester.tap(clear);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('credentials-clear-confirm')));
    await tester.pumpAndSettle();

    expect(find.text('Set up FlowPost'), findsOneWidget);
  });
}
