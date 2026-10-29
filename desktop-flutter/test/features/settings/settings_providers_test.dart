import 'dart:io';

import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/core/session/session.dart';
import 'package:flowpost_desktop/core/update/app_version.dart';
import 'package:flowpost_desktop/core/update/update_checker.dart';
import 'package:flowpost_desktop/features/offline/offline_providers.dart';
import 'package:flowpost_desktop/features/settings/settings_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

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

void main() {
  group('the update check', () {
    test('an unconfigured build never calls the manifest', () async {
      var calls = 0;
      final container = ProviderContainer(
        overrides: [
          appConfigProvider.overrideWithValue(config(manifest: '')),
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
          appConfigProvider.overrideWithValue(config()),
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
          appConfigProvider.overrideWithValue(config()),
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

    test('a failed check says so and leaves the button usable', () async {
      final container = ProviderContainer(
        overrides: [
          appConfigProvider.overrideWithValue(config()),
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
}

class _FailingWipe extends FakePostsCache {
  @override
  Future<void> wipe() async {
    throw const FileSystemException('locked');
  }
}
