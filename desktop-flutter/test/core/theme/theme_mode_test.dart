import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/app.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/theme/app_theme.dart';
import 'package:flowpost_desktop/core/theme/theme_controller.dart';

import '../../support/config_overrides.dart';
import '../../support/fake_theme_store.dart';

const testConfig = AppConfig(
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-anon',
  updateManifestUrl: '',
);

ProviderContainer _boot(FakeThemeStore store, ThemeMode initial) =>
    ProviderContainer(
      overrides: [
        seededConfig(testConfig),
        themeStoreProvider.overrideWithValue(store),
        themeControllerProvider.overrideWith(
          () => ThemeController(initial: initial),
        ),
      ],
    );

void main() {
  testWidgets('the saved look is on screen from the first frame', (
    tester,
  ) async {
    final container = _boot(FakeThemeStore(), ThemeMode.dark);
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const FlowPostApp(),
      ),
    );

    final theme = Theme.of(tester.element(find.text('FlowPost Studio')));
    expect(theme.brightness, Brightness.dark);
    expect(theme.scaffoldBackgroundColor, FlowPostDarkColors.background);
  });

  testWidgets('the other look paints and is kept, with no restart', (
    tester,
  ) async {
    final store = FakeThemeStore();
    final container = _boot(store, ThemeMode.system);
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const FlowPostApp(),
      ),
    );

    await container
        .read(themeControllerProvider.notifier)
        .setMode(ThemeMode.dark);
    await tester.pumpAndSettle();

    expect(
      Theme.of(tester.element(find.text('FlowPost Studio'))).brightness,
      Brightness.dark,
    );
    expect(store.writes, [ThemeMode.dark]);
  });

  testWidgets('the dark shell holds at 200% text in the smallest window', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    tester.view.physicalSize = const Size(1024, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final container = _boot(FakeThemeStore(), ThemeMode.dark);
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const FlowPostApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Settings'), findsOneWidget);
  });
}
