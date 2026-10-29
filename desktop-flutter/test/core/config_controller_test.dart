import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/config/config_controller.dart';
import 'package:flowpost_desktop/core/config/credentials_store.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';

void main() {
  const compiled = AppConfig(
    supabaseUrl: 'https://compiled.supabase.co',
    supabaseAnonKey: 'compiled-key',
    updateManifestUrl: '',
  );
  const saved = AppConfig(
    supabaseUrl: 'https://saved.supabase.co',
    supabaseAnonKey: 'saved-key',
    updateManifestUrl: '',
  );

  group('resolveConfig', () {
    test('a saved file wins over the build', () {
      final state = resolveConfig(
        saved: const CredentialsFound(saved),
        compiled: compiled,
      );
      expect(state.config?.supabaseUrl, saved.supabaseUrl);
      expect(state.source, ConfigSource.saved);
      expect(state.needsSetup, isFalse);
    });

    test('no file falls back to the build', () {
      final state = resolveConfig(
        saved: const CredentialsAbsent(),
        compiled: compiled,
      );
      expect(state.config?.supabaseUrl, compiled.supabaseUrl);
      expect(state.source, ConfigSource.compiled);
    });

    test('an unusable file stops at setup with the reason', () {
      final state = resolveConfig(
        saved: const CredentialsInvalid('The file is not valid JSON.'),
        compiled: compiled,
      );
      expect(state.needsSetup, isTrue);
      expect(state.problem, contains('not valid JSON'));
    });

    test('nothing anywhere needs setup without a complaint', () {
      final state = resolveConfig(
        saved: const CredentialsAbsent(),
        compiled: null,
      );
      expect(state.needsSetup, isTrue);
      expect(state.problem, isNull);
    });
  });

  group('ConfigController', () {
    late Directory folder;
    late CredentialsStore store;
    late ProviderContainer container;

    setUp(() async {
      folder = await Directory.systemTemp.createTemp('flowpost-config-');
      store = CredentialsStore(folder: () async => folder);
      container = ProviderContainer(
        overrides: [
          credentialsStoreProvider.overrideWithValue(store),
          compiledConfigProvider.overrideWithValue(compiled),
          configControllerProvider.overrideWith(
            () => ConfigController(
              initial: const ConfigState(
                config: compiled,
                source: ConfigSource.compiled,
              ),
            ),
          ),
        ],
      );
    });

    tearDown(() async {
      container.dispose();
      if (await folder.exists()) await folder.delete(recursive: true);
    });

    test('a save writes the file and makes the values live', () async {
      final saved = await container
          .read(configControllerProvider.notifier)
          .save(
            const AppConfig(
              supabaseUrl: 'https://saved.supabase.co',
              supabaseAnonKey: 'saved-key',
              updateManifestUrl: '',
            ),
          );

      expect(saved, isTrue);
      expect(
        container.read(configControllerProvider).source,
        ConfigSource.saved,
      );
      expect(
        container.read(appConfigProvider).supabaseUrl,
        'https://saved.supabase.co',
      );
      expect(await store.read(), isA<CredentialsFound>());
    });

    test('a failed write leaves the previous values live', () async {
      final blocked = CredentialsStore(
        folder: () async => Directory('${folder.path}\u0000bad'),
      );
      final blockedContainer = ProviderContainer(
        overrides: [
          credentialsStoreProvider.overrideWithValue(blocked),
          configControllerProvider.overrideWith(
            () => ConfigController(
              initial: const ConfigState(
                config: compiled,
                source: ConfigSource.compiled,
              ),
            ),
          ),
        ],
      );
      addTearDown(blockedContainer.dispose);

      final written = await blockedContainer
          .read(configControllerProvider.notifier)
          .save(saved);

      expect(written, isFalse);
      expect(
        blockedContainer.read(configControllerProvider).config?.supabaseUrl,
        compiled.supabaseUrl,
      );
    });

    test('clear brings the build defaults back', () async {
      final controller = container.read(configControllerProvider.notifier);
      await controller.save(saved);

      expect(await controller.clear(), isTrue);

      final state = container.read(configControllerProvider);
      expect(state.config?.supabaseUrl, compiled.supabaseUrl);
      expect(state.source, ConfigSource.compiled);
    });

    test('clear with no build defaults needs setup', () async {
      final bare = ProviderContainer(
        overrides: [
          credentialsStoreProvider.overrideWithValue(store),
          configControllerProvider.overrideWith(
            () => ConfigController(
              initial: const ConfigState(
                config: saved,
                source: ConfigSource.saved,
              ),
            ),
          ),
        ],
      );
      addTearDown(bare.dispose);

      expect(
        await bare.read(configControllerProvider.notifier).clear(),
        isTrue,
      );
      expect(bare.read(configControllerProvider).needsSetup, isTrue);
    });

    test('every watcher sees the new values after a save', () async {
      final read = <String>[];
      container.listen(
        appConfigProvider,
        (previous, next) => read.add(next.supabaseUrl),
        fireImmediately: true,
      );

      await container.read(configControllerProvider.notifier).save(saved);
      // Provider values update lazily; one turn lets the listener run.
      await Future<void>.delayed(Duration.zero);

      expect(read, [compiled.supabaseUrl, saved.supabaseUrl]);
    });

    test('reading the config with none is a wiring error', () {
      final bare = ProviderContainer();
      addTearDown(bare.dispose);
      expect(
        () => bare.read(appConfigProvider),
        throwsA(
          predicate<Object>(
            (error) => '$error'.contains('belongs on /setup'),
            'an error that names the setup screen',
          ),
        ),
      );
    });
  });
}
