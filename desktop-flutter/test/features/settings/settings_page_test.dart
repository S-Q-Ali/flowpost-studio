import 'dart:io';

import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/diagnostics/diagnostics_report.dart';
import 'package:flowpost_desktop/core/config/config_controller.dart';
import 'package:flowpost_desktop/core/config/credentials_store.dart';
import 'package:flowpost_desktop/core/router/app_router.dart';
import 'package:flowpost_desktop/core/session/session.dart';
import 'package:flowpost_desktop/core/theme/theme_controller.dart';
import 'package:flowpost_desktop/core/update/app_version.dart';
import 'package:flowpost_desktop/core/update/update_checker.dart';
import 'package:flowpost_desktop/features/license/data/license_models.dart';
import 'package:flowpost_desktop/features/license/license_providers.dart';
import 'package:flowpost_desktop/features/offline/offline_providers.dart';
import 'package:flowpost_desktop/features/settings/presentation/settings_page.dart';
import 'package:flowpost_desktop/features/settings/settings_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../../support/config_overrides.dart';
import '../../support/fake_credentials_store.dart';
import '../../support/fake_drafts.dart';
import '../../support/fake_license.dart';
import '../../support/fake_posts_cache.dart';
import '../../support/fake_theme_store.dart';

const AppVersionInfo _version = AppVersionInfo(
  version: '1.2.3',
  buildNumber: '7',
);

LicenseRecord activeGrant({DateTime? expiresAt}) => LicenseRecord(
  token: 'token-1',
  expiresAt: expiresAt ?? DateTime.utc(2099, 1, 1),
  key: 'license-key-1',
);

DiagnosticsFacts testFacts({
  bool draftsAvailable = true,
  List<LocalFileFact> broken = const [],
}) => DiagnosticsFacts(
  generatedAt: DateTime.utc(2026, 10, 29, 14, 30, 12),
  version: _version,
  osVersion: 'Windows 10.0.26300',
  locale: 'en-US',
  zoneName: 'Asia/Karachi',
  utcOffset: const Duration(hours: 5),
  licensed: false,
  files: [
    LocalFileFact(
      name: 'cache.db',
      state: LocalFileState.ok,
      bytes: 421888,
      modifiedAt: DateTime.utc(2026, 10, 29, 14, 12),
    ),
    LocalFileFact(
      name: 'drafts.db',
      state: draftsAvailable ? LocalFileState.ok : LocalFileState.unreadable,
      bytes: 16384,
      modifiedAt: DateTime.utc(2026, 10, 29, 13, 58),
    ),
  ],
  brokenFiles: broken,
  logLines: const ['a line'],
  logsRead: true,
);

TextField _field(WidgetTester tester, String key) =>
    tester.widget<TextField>(find.byKey(Key(key)));

SegmentedButton<ThemeMode> _segments(WidgetTester tester) => tester
    .widget<SegmentedButton<ThemeMode>>(find.byKey(const Key('theme-mode')));

/// The Settings screen scrolls; a control low on the card must be brought
/// into the viewport before the tap lands on it.
Future<void> _tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<ProviderContainer> _pump(
  WidgetTester tester, {
  LicenseRecord? grant,
  MemoryLicenseStore? licenseStore,
  bool failLicenseClear = false,
  GoRouter? router,
  String manifest = 'https://flowpost.test/update.json',
  FakePostsCache? cache,
  FakeDraftsRepository? drafts,
  Directory? logs,
  bool logsMissing = false,
  List<Directory>? opened,
  UpdateFetcher? fetcher,
  Future<Directory?> Function()? folderPicker,
  Future<DiagnosticsExportOutcome> Function()? exporter,
  List<LocalFileFact> broken = const [],
  FakeCredentialsStore? store,
  FakeThemeStore? themeStore,
  Future<String> Function(AppConfig config)? connectionCheck,
  AppConfig? live,
  ConfigSource source = ConfigSource.compiled,
  AppConfig? compiled,
}) async {
  final draftsRepository = drafts ?? FakeDraftsRepository();
  final vault = licenseStore ?? MemoryLicenseStore(grant);
  vault.failClear = failLicenseClear;
  final overrides = [
    themeStoreProvider.overrideWithValue(themeStore ?? FakeThemeStore()),
    seededConfig(
      live ??
          AppConfig.fromValues(
            supabaseUrl: 'https://flowpost.test',
            supabaseAnonKey: 'anon-key',
            updateManifestUrl: manifest,
          ),
      source: source,
    ),
    if (compiled != null) compiledConfigProvider.overrideWithValue(compiled),
    credentialsStoreProvider.overrideWithValue(store ?? FakeCredentialsStore()),
    connectionCheckProvider.overrideWithValue(
      connectionCheck ?? (config) async => 'The server answered.',
    ),
    appVersionProvider.overrideWith((ref) async => _version),
    postsCacheProvider.overrideWithValue(cache ?? FakePostsCache()),
    draftsRepositoryProvider.overrideWithValue(draftsRepository),
    diagnosticsFactsProvider.overrideWith(
      (ref) async => testFacts(
        draftsAvailable: draftsRepository.availableNow,
        broken: broken,
      ),
    ),
    exportFolderPickerProvider.overrideWithValue(
      folderPicker ?? () async => null,
    ),
    if (exporter != null)
      diagnosticsExporterProvider.overrideWithValue(exporter),
    logsFolderProvider.overrideWith(
      (ref) async => logsMissing ? null : logs ?? Directory.systemTemp,
    ),
    openFolderProvider.overrideWithValue((folder) async {
      opened?.add(folder);
      return true;
    }),
    updateFetcherProvider.overrideWithValue(
      fetcher ??
          ({required Uri manifestUrl, required String currentVersion}) async =>
              UpdateResult(
                currentVersion: currentVersion,
                latestVersion: currentVersion,
              ),
    ),
    licenseServiceProvider.overrideWithValue(licenseServiceOver(vault)),
  ];
  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: router == null
          ? const MaterialApp(home: SettingsPage())
          : MaterialApp.router(routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
  return ProviderScope.containerOf(tester.element(find.byType(SettingsPage)));
}

void main() {
  testWidgets(
    'the screen shows the license, the version, diagnostics and about',
    (tester) async {
      await _pump(tester);

      expect(find.text('Settings'), findsOneWidget);
      expect(find.text('No active license.'), findsOneWidget);
      expect(
        find.byKey(const Key('settings-activate-license')),
        findsOneWidget,
      );
      expect(find.text('Version 1.2.3 (7)'), findsOneWidget);
      expect(find.text('Diagnostics'), findsOneWidget);
      expect(find.text('Log file'), findsOneWidget);
      expect(find.text(Directory.systemTemp.path), findsOneWidget);
      expect(find.text('cache.db: 412 KB, ok'), findsOneWidget);
      expect(find.text('drafts.db: 16 KB, ok'), findsOneWidget);
      expect(find.text('FlowPost Studio'), findsOneWidget);
      expect(find.textContaining('sign in'), findsNothing);
      expect(find.textContaining('signed in'), findsNothing);
    },
  );

  testWidgets(
    'an active license shows its expiry and deactivates after asking',
    (tester) async {
      final cache = FakePostsCache();
      final vault = MemoryLicenseStore(activeGrant());
      final container = await _pump(tester, licenseStore: vault, cache: cache);

      expect(find.text('Active license'), findsOneWidget);
      expect(find.textContaining('Expires 2099-01-01'), findsOneWidget);

      await _tapVisible(tester, find.byKey(const Key('settings-deactivate')));
      expect(
        find.text(
          'Deactivating removes the license from this machine. '
          'Your drafts are kept.',
        ),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('confirm-deactivate')));
      await tester.pumpAndSettle();

      expect(vault.record, isNull);
      expect(container.read(sessionProvider), isNull);
      expect(cache.wipes, 1);
      expect(find.text('No active license.'), findsOneWidget);
      expect(find.text('License deactivated.'), findsOneWidget);
    },
  );

  testWidgets('an offline license says so', (tester) async {
    await _pump(tester, grant: activeGrant());

    expect(find.text('Active license'), findsOneWidget);
    expect(find.text('Expires 2099-01-01 · offline'), findsOneWidget);
  });

  testWidgets('an expired license says what to do', (tester) async {
    await _pump(
      tester,
      grant: LicenseRecord(
        token: 'old-token',
        expiresAt: DateTime.utc(2020, 1, 1),
      ),
    );

    expect(find.text('No active license.'), findsNothing);
    expect(
      find.text('Your license has expired. Activate a new key to continue.'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('settings-activate-license')), findsOneWidget);
  });

  testWidgets('keeping the license changes nothing', (tester) async {
    final cache = FakePostsCache();
    final vault = MemoryLicenseStore(activeGrant());
    final container = await _pump(tester, licenseStore: vault, cache: cache);

    await _tapVisible(tester, find.byKey(const Key('settings-deactivate')));
    await tester.tap(find.byKey(const Key('confirm-deactivate-keep')));
    await tester.pumpAndSettle();

    expect(vault.record, isNotNull);
    expect(container.read(sessionProvider), isNotNull);
    expect(cache.wipes, 0);
  });

  testWidgets('a license that cannot be removed still ends the session', (
    tester,
  ) async {
    final cache = FakePostsCache();
    final vault = MemoryLicenseStore(activeGrant());
    final container = await _pump(
      tester,
      licenseStore: vault,
      failLicenseClear: true,
      cache: cache,
    );

    await _tapVisible(tester, find.byKey(const Key('settings-deactivate')));
    await tester.tap(find.byKey(const Key('confirm-deactivate')));
    await tester.pumpAndSettle();

    expect(container.read(sessionProvider), isNull);
    expect(cache.wipes, 1);
    expect(
      find.text('The license could not be removed from this machine.'),
      findsOneWidget,
    );
  });

  testWidgets('Change license opens the license screen', (tester) async {
    final router = GoRouter(
      routes: [
        GoRoute(path: '/', builder: (context, state) => const SettingsPage()),
        GoRoute(
          path: licenseRoute,
          builder: (context, state) =>
              const Scaffold(body: Text('License screen')),
        ),
      ],
    );
    await _pump(tester, grant: activeGrant(), router: router);

    await _tapVisible(tester, find.byKey(const Key('settings-change-license')));

    expect(find.text('License screen'), findsOneWidget);
  });

  testWidgets('a build with no update source says so and the button is off', (
    tester,
  ) async {
    await _pump(tester, manifest: '');

    expect(find.text('This build has no update source.'), findsOneWidget);
    final button = tester.widget<FilledButton>(
      find.byKey(const Key('settings-check-updates')),
    );
    expect(button.onPressed, isNull);
  });

  testWidgets('a check that finds nothing says the app is up to date', (
    tester,
  ) async {
    await _pump(tester);

    await _tapVisible(tester, find.byKey(const Key('settings-check-updates')));
    await tester.pumpAndSettle();

    expect(find.text("You're up to date (v1.2.3)."), findsOneWidget);
    expect(find.byKey(const Key('settings-download')), findsNothing);
  });

  testWidgets('a check that finds a version offers the download', (
    tester,
  ) async {
    await _pump(
      tester,
      fetcher:
          ({required Uri manifestUrl, required String currentVersion}) async =>
              UpdateResult(
                currentVersion: currentVersion,
                latestVersion: '1.3.0',
                downloadUrl: Uri.parse('https://flowpost.test/setup.exe'),
              ),
    );

    await _tapVisible(tester, find.byKey(const Key('settings-check-updates')));
    await tester.pumpAndSettle();

    expect(find.text('Version 1.3.0 is available.'), findsOneWidget);
    expect(find.byKey(const Key('settings-download')), findsOneWidget);
  });

  testWidgets('a failed check says so and the button comes back', (
    tester,
  ) async {
    await _pump(
      tester,
      fetcher:
          ({required Uri manifestUrl, required String currentVersion}) async =>
              UpdateResult(
                currentVersion: currentVersion,
                error: 'Update check failed',
              ),
    );

    await _tapVisible(tester, find.byKey(const Key('settings-check-updates')));
    await tester.pumpAndSettle();

    expect(find.text('Update check failed'), findsOneWidget);
    final button = tester.widget<FilledButton>(
      find.byKey(const Key('settings-check-updates')),
    );
    expect(button.onPressed, isNotNull);
  });

  testWidgets('Open folder reveals the log folder', (tester) async {
    final logs = Directory.systemTemp.createTempSync('flowpost_logs_test');
    addTearDown(() => logs.deleteSync(recursive: true));
    final opened = <Directory>[];
    await _pump(tester, logs: logs, opened: opened);

    await _tapVisible(tester, find.byKey(const Key('settings-open-logs')));
    await tester.pumpAndSettle();

    expect(opened.single.path, logs.path);
  });

  testWidgets('a log folder that cannot be resolved says so', (tester) async {
    await _pump(tester, logsMissing: true);

    expect(find.text('The log folder is not available yet.'), findsOneWidget);
    expect(find.byKey(const Key('settings-open-logs')), findsNothing);
  });

  testWidgets('files kept aside are named with their size', (tester) async {
    await _pump(
      tester,
      broken: [
        LocalFileFact(
          name: 'cache.corrupt-20261029-1432.db',
          state: LocalFileState.unreadable,
          bytes: 421888,
          modifiedAt: DateTime.utc(2026, 10, 29, 14, 32),
        ),
      ],
    );

    expect(find.text('Files kept aside'), findsOneWidget);
    expect(
      find.text('cache.corrupt-20261029-1432.db (412 KB)'),
      findsOneWidget,
    );
  });

  testWidgets('a save names the file it wrote', (tester) async {
    await _pump(
      tester,
      exporter: () async => DiagnosticsExportOutcome.saved(
        File(
          '${Directory.systemTemp.path}${Platform.pathSeparator}'
          'flowpost-diagnostics-20261029-1430.txt',
        ),
      ),
    );

    await _tapVisible(
      tester,
      find.byKey(const Key('settings-save-diagnostics')),
    );

    expect(
      find.textContaining('Saved flowpost-diagnostics-20261029-1430.txt at '),
      findsOneWidget,
    );
  });

  testWidgets('a cancelled picker leaves the last save alone', (tester) async {
    await _pump(tester);

    await _tapVisible(
      tester,
      find.byKey(const Key('settings-save-diagnostics')),
    );

    expect(find.text('No diagnostics file saved yet.'), findsOneWidget);
    expect(find.text('The diagnostics file could not be saved.'), findsNothing);
  });

  testWidgets('a save that cannot be written says so', (tester) async {
    await _pump(
      tester,
      exporter: () async => const DiagnosticsExportOutcome.failed(),
    );

    await _tapVisible(
      tester,
      find.byKey(const Key('settings-save-diagnostics')),
    );

    expect(
      find.text('The diagnostics file could not be saved.'),
      findsOneWidget,
    );
    expect(find.text('No diagnostics file saved yet.'), findsOneWidget);
  });

  testWidgets('a drafts file that will not open offers the salvage', (
    tester,
  ) async {
    final drafts = FakeDraftsRepository()..availableNow = false;
    await _pump(tester, drafts: drafts);

    expect(find.text('drafts.db: 16 KB, cannot be opened'), findsOneWidget);
    expect(
      find.text(
        'The saved drafts could not be opened. The old file stays on '
        'this machine.',
      ),
      findsOneWidget,
    );

    await _tapVisible(tester, find.byKey(const Key('settings-salvage-drafts')));
    await tester.tap(find.byKey(const Key('confirm-salvage-drafts-cancel')));
    await tester.pumpAndSettle();

    expect(drafts.salvageRuns, 0);

    await _tapVisible(tester, find.byKey(const Key('settings-salvage-drafts')));
    await tester.tap(find.byKey(const Key('confirm-salvage-drafts')));
    await tester.pumpAndSettle();

    expect(drafts.salvageRuns, 1);
    expect(find.text('drafts.db: 16 KB, ok'), findsOneWidget);
    expect(
      find.text('The old drafts file was kept and a new one is ready.'),
      findsOneWidget,
    );
  });

  testWidgets('a drafts file that opens offers no salvage', (tester) async {
    await _pump(tester);

    expect(find.byKey(const Key('settings-salvage-drafts')), findsNothing);
  });

  testWidgets('the credentials section starts from the build defaults', (
    tester,
  ) async {
    await _pump(tester);

    expect(find.text('Credentials'), findsOneWidget);
    expect(find.text("Using the build's defaults."), findsOneWidget);
    expect(
      _field(tester, 'credentials-url').controller!.text,
      'https://flowpost.test',
    );
    expect(_field(tester, 'credentials-key').obscureText, isTrue);
    expect(find.byKey(const Key('credentials-clear')), findsNothing);
  });

  testWidgets('Show reveals the key', (tester) async {
    await _pump(tester);

    expect(_field(tester, 'credentials-key').obscureText, isTrue);
    await _tapVisible(tester, find.byKey(const Key('credentials-show-key')));
    expect(_field(tester, 'credentials-key').obscureText, isFalse);
  });

  testWidgets('saving values writes them and makes them live', (tester) async {
    final store = FakeCredentialsStore();
    final container = await _pump(tester, store: store);

    await tester.enterText(
      find.byKey(const Key('credentials-url')),
      'https://new.supabase.co',
    );
    await tester.enterText(find.byKey(const Key('credentials-key')), 'new-key');
    await _tapVisible(tester, find.byKey(const Key('credentials-submit')));

    expect(store.written?.supabaseUrl, 'https://new.supabase.co');
    expect(store.written?.supabaseAnonKey, 'new-key');
    expect(find.text('Saved.'), findsOneWidget);
    expect(
      find.text('Using the values saved on this machine.'),
      findsOneWidget,
    );
    expect(
      container.read(configControllerProvider).config?.supabaseUrl,
      'https://new.supabase.co',
    );
  });

  testWidgets('a service-role key is named and nothing is written', (
    tester,
  ) async {
    final store = FakeCredentialsStore();
    final container = await _pump(tester, store: store);

    await tester.enterText(
      find.byKey(const Key('credentials-key')),
      'sb_secret_123',
    );
    await _tapVisible(tester, find.byKey(const Key('credentials-submit')));

    expect(
      find.text(
        'This looks like a service-role key. The app only accepts the public '
        'anon/publishable key.',
      ),
      findsOneWidget,
    );
    expect(store.written, isNull);
    expect(
      container.read(configControllerProvider).config?.supabaseAnonKey,
      'anon-key',
    );
  });

  testWidgets('a write that fails keeps the old values live', (tester) async {
    final store = FakeCredentialsStore()..failWrites = true;
    final container = await _pump(tester, store: store);

    await tester.enterText(
      find.byKey(const Key('credentials-url')),
      'https://new.supabase.co',
    );
    await _tapVisible(tester, find.byKey(const Key('credentials-submit')));

    expect(
      find.textContaining('could not be saved on this machine'),
      findsOneWidget,
    );
    expect(find.text("Using the build's defaults."), findsOneWidget);
    expect(
      container.read(configControllerProvider).config?.supabaseUrl,
      'https://flowpost.test',
    );
  });

  testWidgets('Test connection answers through the seam', (tester) async {
    final asked = <AppConfig>[];
    await _pump(
      tester,
      connectionCheck: (config) async {
        asked.add(config);
        return 'The server answered but refused this key.';
      },
    );

    await _tapVisible(tester, find.byKey(const Key('credentials-test')));

    expect(
      find.text('The server answered but refused this key.'),
      findsOneWidget,
    );
    expect(asked.single.supabaseUrl, 'https://flowpost.test');
  });

  testWidgets('a changed backend deactivates the license and wipes the cache', (
    tester,
  ) async {
    final cache = FakePostsCache();
    final vault = MemoryLicenseStore(activeGrant());
    final container = await _pump(tester, licenseStore: vault, cache: cache);

    await tester.enterText(
      find.byKey(const Key('credentials-url')),
      'https://other.supabase.co',
    );
    await _tapVisible(tester, find.byKey(const Key('credentials-submit')));

    expect(vault.record, isNull);
    expect(container.read(sessionProvider), isNull);
    expect(cache.wipes, 1);
  });

  testWidgets('saving the same backend keeps the license', (tester) async {
    final cache = FakePostsCache();
    final vault = MemoryLicenseStore(activeGrant());
    final container = await _pump(tester, licenseStore: vault, cache: cache);

    await _tapVisible(tester, find.byKey(const Key('credentials-submit')));

    expect(vault.record, isNotNull);
    expect(container.read(sessionProvider), isNotNull);
    expect(cache.wipes, 0);
  });

  testWidgets('clearing asks first and shows the defaults again', (
    tester,
  ) async {
    const saved = AppConfig(
      supabaseUrl: 'https://saved.supabase.co',
      supabaseAnonKey: 'saved-key',
      updateManifestUrl: '',
    );
    final compiled = AppConfig.fromValues(
      supabaseUrl: 'https://flowpost.test',
      supabaseAnonKey: 'anon-key',
      updateManifestUrl: 'https://flowpost.test/update.json',
    );
    final store = FakeCredentialsStore()
      ..stored = const CredentialsFound(saved);
    final cache = FakePostsCache();
    final vault = MemoryLicenseStore(activeGrant());
    final container = await _pump(
      tester,
      live: saved,
      source: ConfigSource.saved,
      compiled: compiled,
      store: store,
      licenseStore: vault,
      cache: cache,
    );

    expect(
      find.text('Using the values saved on this machine.'),
      findsOneWidget,
    );

    await _tapVisible(tester, find.byKey(const Key('credentials-clear')));
    await tester.tap(find.byKey(const Key('credentials-keep')));
    await tester.pumpAndSettle();

    expect(
      find.text('Using the values saved on this machine.'),
      findsOneWidget,
    );
    expect(store.stored, isA<CredentialsFound>());

    await _tapVisible(tester, find.byKey(const Key('credentials-clear')));
    await tester.tap(find.byKey(const Key('credentials-clear-confirm')));
    await tester.pumpAndSettle();

    expect(store.stored, isA<CredentialsAbsent>());
    expect(find.text("Using the build's defaults."), findsOneWidget);
    expect(
      _field(tester, 'credentials-url').controller!.text,
      'https://flowpost.test',
    );
    expect(vault.record, isNull);
    expect(container.read(sessionProvider), isNull);
    expect(cache.wipes, 1);
  });

  testWidgets('the looks are offered with the current one picked', (
    tester,
  ) async {
    await _pump(tester);

    expect(find.text('Appearance'), findsOneWidget);
    expect(_segments(tester).selected, {ThemeMode.system});
  });

  testWidgets('choosing a look keeps it and shows it at once', (tester) async {
    final store = FakeThemeStore();
    final container = await _pump(tester, themeStore: store);

    await _tapVisible(tester, find.text('Dark'));

    expect(container.read(themeControllerProvider), ThemeMode.dark);
    expect(store.saved, ThemeMode.dark);
    expect(_segments(tester).selected, {ThemeMode.dark});
  });

  testWidgets('a look that will not save says so and stays put', (
    tester,
  ) async {
    final store = FakeThemeStore()..refusesWrite = true;
    final container = await _pump(tester, themeStore: store);

    await _tapVisible(tester, find.text('Dark'));

    expect(
      find.text('The look could not be saved on this machine.'),
      findsOneWidget,
    );
    expect(container.read(themeControllerProvider), ThemeMode.system);
    expect(_segments(tester).selected, {ThemeMode.system});
    expect(store.writes, isEmpty);
  });

  testWidgets('grows with large text at the minimum window size', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    tester.view.physicalSize = const Size(1024, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await _pump(tester);

    expect(tester.takeException(), isNull);
    expect(find.text('Settings'), findsOneWidget);
  });
}
