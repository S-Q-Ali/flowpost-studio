import 'dart:convert';
import 'dart:io';

import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/core/session/session.dart';
import 'package:flowpost_desktop/core/update/app_version.dart';
import 'package:flowpost_desktop/core/update/update_checker.dart';
import 'package:flowpost_desktop/features/offline/offline_providers.dart';
import 'package:flowpost_desktop/features/settings/presentation/settings_page.dart';
import 'package:flowpost_desktop/features/settings/settings_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_posts_cache.dart';

const AppVersionInfo _version = AppVersionInfo(
  version: '1.2.3',
  buildNumber: '7',
);

/// A token shaped like a JWT, carrying [claims] as its payload.
String token(Map<String, Object?> claims) {
  String part(Object value) =>
      base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  return '${part({'alg': 'none'})}.${part(claims)}.signature';
}

class _SignedIn extends SessionController {
  _SignedIn(this.session);

  final Session session;

  @override
  Session? build() => session;
}

Future<ProviderContainer> _pump(
  WidgetTester tester, {
  Session? session,
  String manifest = 'https://flowpost.test/update.json',
  FakePostsCache? cache,
  Directory? logs,
  bool logsMissing = false,
  List<Directory>? opened,
  UpdateFetcher? fetcher,
}) async {
  final overrides = [
    appConfigProvider.overrideWithValue(
      AppConfig.fromValues(
        supabaseUrl: 'https://flowpost.test',
        supabaseAnonKey: 'anon-key',
        updateManifestUrl: manifest,
      ),
    ),
    appVersionProvider.overrideWith((ref) async => _version),
    postsCacheProvider.overrideWithValue(cache ?? FakePostsCache()),
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
    if (session != null) sessionProvider.overrideWith(() => _SignedIn(session)),
  ];
  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: const MaterialApp(home: SettingsPage()),
    ),
  );
  await tester.pumpAndSettle();
  return ProviderScope.containerOf(tester.element(find.byType(SettingsPage)));
}

void main() {
  testWidgets('the screen shows the account, the version, the log and about', (
    tester,
  ) async {
    await _pump(tester);

    expect(find.text('Settings'), findsOneWidget);
    expect(find.text('Not signed in'), findsOneWidget);
    expect(
      find.text('Sign-in arrives with the production build.'),
      findsOneWidget,
    );
    expect(find.text('Version 1.2.3 (7)'), findsOneWidget);
    expect(find.text('Log file'), findsOneWidget);
    expect(find.text(Directory.systemTemp.path), findsOneWidget);
    expect(find.text('FlowPost Studio'), findsOneWidget);
    expect(find.byKey(const Key('settings-sign-out')), findsNothing);
  });

  testWidgets('a session shows the email and signs out after asking', (
    tester,
  ) async {
    final cache = FakePostsCache();
    final container = await _pump(
      tester,
      session: Session(
        sessionToken: 'session',
        accessToken: token({'email': 'admin@flowpost.test'}),
      ),
      cache: cache,
    );

    expect(find.text('admin@flowpost.test'), findsOneWidget);

    await tester.tap(find.byKey(const Key('settings-sign-out')));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'Signing out removes the saved posts from this machine. '
        'Your drafts are kept.',
      ),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('confirm-sign-out')));
    await tester.pumpAndSettle();

    expect(container.read(sessionProvider), isNull);
    expect(cache.wipes, 1);
    expect(find.text('Not signed in'), findsOneWidget);
  });

  testWidgets('keeping the session changes nothing', (tester) async {
    final cache = FakePostsCache();
    final container = await _pump(
      tester,
      session: const Session(sessionToken: 's', accessToken: 'a'),
      cache: cache,
    );

    await tester.tap(find.byKey(const Key('settings-sign-out')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('confirm-sign-out-keep')));
    await tester.pumpAndSettle();

    expect(container.read(sessionProvider), isNotNull);
    expect(cache.wipes, 0);
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

    await tester.tap(find.byKey(const Key('settings-check-updates')));
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

    await tester.tap(find.byKey(const Key('settings-check-updates')));
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

    await tester.tap(find.byKey(const Key('settings-check-updates')));
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

    await tester.tap(find.byKey(const Key('settings-open-logs')));
    await tester.pumpAndSettle();

    expect(opened.single.path, logs.path);
  });

  testWidgets('a log folder that cannot be resolved says so', (tester) async {
    await _pump(tester, logsMissing: true);

    expect(find.text('The log folder is not available yet.'), findsOneWidget);
    expect(find.byKey(const Key('settings-open-logs')), findsNothing);
  });
}
