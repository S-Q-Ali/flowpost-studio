import 'dart:io';

import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/config/config_controller.dart';
import 'package:flowpost_desktop/core/diagnostics/diagnostics_report.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/core/session/session.dart';
import 'package:flowpost_desktop/core/update/app_version.dart';
import 'package:flowpost_desktop/core/update/update_checker.dart';
import 'package:flowpost_desktop/features/offline/offline_providers.dart';
import 'package:flowpost_desktop/features/settings/settings_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/config_overrides.dart';
import '../../support/fake_drafts.dart';
import '../../support/fake_posts_cache.dart';

AppConfig config({String manifest = 'https://flowpost.test/update.json'}) {
  return AppConfig.fromValues(
    supabaseUrl: 'https://flowpost.test',
    supabaseAnonKey: 'anon-key',
    updateManifestUrl: manifest,
  );
}

UpdateResult upToDate() => const UpdateResult(
  currentVersion: '1.2.3',
  latestVersion: '1.2.3',
  downloadUrl: null,
);

class _MutableConfig extends ConfigController {
  _MutableConfig() : super(initial: ConfigState(config: config()));

  void replace(AppConfig next) =>
      state = ConfigState(config: next, source: ConfigSource.saved);
}

void main() {
  group('the update check', () {
    test('an unconfigured build never calls the manifest', () async {
      var calls = 0;
      final container = ProviderContainer(
        overrides: [
          seededConfig(config(manifest: '')),
          appVersionProvider.overrideWith(
            (ref) async =>
                const AppVersionInfo(version: '1.2.3', buildNumber: ''),
          ),
          updateFetcherProvider.overrideWithValue(({
            required manifestUrl,
            required currentVersion,
          }) async {
            calls++;
            return upToDate();
          }),
        ],
      );
      addTearDown(container.dispose);

      await container.read(updateCheckProvider.notifier).check();

      expect(calls, 0);
      expect(container.read(updateCheckProvider).checking, isFalse);
      expect(container.read(updateCheckProvider).result, isNull);
    });

    test('a check asks the manifest with the running version', () async {
      Uri? asked;
      String? askedVersion;
      final container = ProviderContainer(
        overrides: [
          seededConfig(config()),
          appVersionProvider.overrideWith(
            (ref) async =>
                const AppVersionInfo(version: '1.2.3', buildNumber: '7'),
          ),
          updateFetcherProvider.overrideWithValue(({
            required manifestUrl,
            required currentVersion,
          }) async {
            asked = manifestUrl;
            askedVersion = currentVersion;
            return upToDate();
          }),
        ],
      );
      addTearDown(container.dispose);

      await container.read(updateCheckProvider.notifier).check();

      expect(asked, Uri.parse('https://flowpost.test/update.json'));
      expect(askedVersion, '1.2.3');
      expect(container.read(updateCheckProvider).checking, isFalse);
      expect(container.read(updateCheckProvider).result!.hasUpdate, isFalse);
    });

    test('an available version is kept with its download link', () async {
      final container = ProviderContainer(
        overrides: [
          seededConfig(config()),
          appVersionProvider.overrideWith(
            (ref) async =>
                const AppVersionInfo(version: '1.2.3', buildNumber: ''),
          ),
          updateFetcherProvider.overrideWithValue(({
            required manifestUrl,
            required currentVersion,
          }) async {
            return UpdateResult(
              currentVersion: currentVersion,
              latestVersion: '1.3.0',
              downloadUrl: Uri.parse('https://flowpost.test/setup.exe'),
            );
          }),
        ],
      );
      addTearDown(container.dispose);

      await container.read(updateCheckProvider.notifier).check();

      final result = container.read(updateCheckProvider).result!;
      expect(result.hasUpdate, isTrue);
      expect(result.downloadUrl, Uri.parse('https://flowpost.test/setup.exe'));
    });

    test(
      'a result about another address is dropped when the address changes',
      () async {
        final container = ProviderContainer(
          overrides: [
            configControllerProvider.overrideWith(_MutableConfig.new),
            appVersionProvider.overrideWith(
              (ref) async =>
                  const AppVersionInfo(version: '1.2.3', buildNumber: ''),
            ),
            updateFetcherProvider.overrideWithValue(({
              required manifestUrl,
              required currentVersion,
            }) async {
              return UpdateResult(
                currentVersion: currentVersion,
                latestVersion: '1.3.0',
                downloadUrl: Uri.parse('https://flowpost.test/setup.exe'),
              );
            }),
          ],
        );
        addTearDown(container.dispose);

        await container.read(updateCheckProvider.notifier).check();
        expect(container.read(updateCheckProvider).result, isNotNull);

        (container.read(configControllerProvider.notifier) as _MutableConfig)
            .replace(config(manifest: 'https://flowpost.test/other.json'));

        expect(container.read(updateCheckProvider).result, isNull);
      },
    );

    test('a failed check says so and leaves the button usable', () async {
      final container = ProviderContainer(
        overrides: [
          seededConfig(config()),
          appVersionProvider.overrideWith(
            (ref) async =>
                const AppVersionInfo(version: '1.2.3', buildNumber: ''),
          ),
          updateFetcherProvider.overrideWithValue(({
            required manifestUrl,
            required currentVersion,
          }) async {
            return UpdateResult(
              currentVersion: currentVersion,
              error: 'Update check failed',
            );
          }),
        ],
      );
      addTearDown(container.dispose);

      await container.read(updateCheckProvider.notifier).check();

      final state = container.read(updateCheckProvider);
      expect(state.checking, isFalse);
      expect(state.result!.error, 'Update check failed');
    });
  });

  group('signing out', () {
    test('clears the session and wipes the cache', () async {
      final cache = FakePostsCache();
      final container = ProviderContainer(
        overrides: [postsCacheProvider.overrideWithValue(cache)],
      );
      addTearDown(container.dispose);
      container
          .read(sessionProvider.notifier)
          .signIn(const Session(sessionToken: 's', accessToken: 'a'));

      await container.read(signOutProvider).run();

      expect(container.read(sessionProvider), isNull);
      expect(container.read(sessionTokenProvider), isNull);
      expect(cache.wipes, 1);
    });

    test('a cache that cannot be wiped still signs the admin out', () async {
      final container = ProviderContainer(
        overrides: [postsCacheProvider.overrideWithValue(_FailingWipe())],
      );
      addTearDown(container.dispose);
      container
          .read(sessionProvider.notifier)
          .signIn(const Session(sessionToken: 's', accessToken: 'a'));

      await container.read(signOutProvider).run();

      expect(container.read(sessionProvider), isNull);
    });
  });

  group('saving diagnostics', () {
    late Directory folder;

    setUp(() async {
      folder = await Directory.systemTemp.createTemp(
        'flowpost_export_provider',
      );
    });

    tearDown(() async {
      if (await folder.exists()) await folder.delete(recursive: true);
    });

    test('the file is written into the folder the admin picked', () async {
      final container = ProviderContainer(
        overrides: [
          diagnosticsFactsProvider.overrideWith((ref) async => facts()),
          exportFolderPickerProvider.overrideWithValue(() async => folder),
        ],
      );
      addTearDown(container.dispose);

      final outcome = await container.read(diagnosticsExporterProvider)();

      expect(outcome.failed, isFalse);
      final file = outcome.file!;
      expect(file.parent.path, folder.path);
      expect(file.path, endsWith('.txt'));
      final text = file.readAsStringSync();
      expect(text, contains('FlowPost Studio diagnostics'));
      expect(text, contains('1.2.3 (7)'));
      expect(folder.listSync(), hasLength(1));
    });

    test('a cancelled picker writes nothing and is not a failure', () async {
      final container = ProviderContainer(
        overrides: [
          diagnosticsFactsProvider.overrideWith((ref) async => facts()),
          exportFolderPickerProvider.overrideWithValue(() async => null),
        ],
      );
      addTearDown(container.dispose);

      final outcome = await container.read(diagnosticsExporterProvider)();

      expect(outcome.file, isNull);
      expect(outcome.failed, isFalse);
      expect(folder.listSync(), isEmpty);
    });

    test('a report that cannot be built is a failed save', () async {
      final outcome = await runDiagnosticsExport(
        pick: () async => folder,
        report: () async => throw StateError('no facts'),
      );

      expect(outcome.failed, isTrue);
      expect(folder.listSync(), isEmpty);
    });

    test('the row keeps the last save when the dialog is cancelled', () async {
      Directory? picked = folder;
      final container = ProviderContainer(
        overrides: [
          diagnosticsFactsProvider.overrideWith((ref) async => facts()),
          exportFolderPickerProvider.overrideWithValue(() async => picked),
        ],
      );
      addTearDown(container.dispose);

      await container.read(diagnosticsExportProvider.notifier).save();
      final first = container.read(diagnosticsExportProvider).savedName;
      expect(first, isNotNull);

      picked = null;
      await container.read(diagnosticsExportProvider.notifier).save();

      final state = container.read(diagnosticsExportProvider);
      expect(state.savedName, first);
      expect(state.failed, isFalse);
      expect(folder.listSync(), hasLength(1));
    });
  });

  group('the drafts salvage', () {
    test('the repository starts fresh and the facts are read again', () async {
      final drafts = FakeDraftsRepository()..availableNow = false;
      var reads = 0;
      final container = ProviderContainer(
        overrides: [
          draftsRepositoryProvider.overrideWithValue(drafts),
          diagnosticsFactsProvider.overrideWith((ref) async {
            reads++;
            return facts();
          }),
        ],
      );
      addTearDown(container.dispose);
      container.listen(diagnosticsFactsProvider, (_, _) {});
      await container.read(diagnosticsFactsProvider.future);

      final done = await container.read(draftsSalvageProvider)();

      expect(done, isTrue);
      expect(drafts.salvageRuns, 1);
      await container.read(diagnosticsFactsProvider.future);
      expect(reads, 2);
    });
  });
}

DiagnosticsFacts facts() => DiagnosticsFacts(
  generatedAt: DateTime.utc(2026, 10, 29, 14, 30, 12),
  version: const AppVersionInfo(version: '1.2.3', buildNumber: '7'),
  osVersion: 'Windows 10.0.26300',
  locale: 'en-US',
  zoneName: 'Asia/Karachi',
  utcOffset: const Duration(hours: 5),
  signedIn: false,
  files: const [],
  brokenFiles: const [],
  logLines: const [],
  logsRead: true,
);

class _FailingWipe extends FakePostsCache {
  @override
  Future<void> wipe() async {
    throw const FileSystemException('locked');
  }
}
