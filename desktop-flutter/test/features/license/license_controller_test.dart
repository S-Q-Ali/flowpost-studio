import 'dart:io';

import 'package:flowpost_desktop/core/session/session.dart';
import 'package:flowpost_desktop/features/license/data/license_client.dart';
import 'package:flowpost_desktop/features/license/data/license_models.dart';
import 'package:flowpost_desktop/features/license/data/license_service.dart';
import 'package:flowpost_desktop/features/license/data/license_store.dart';
import 'package:flowpost_desktop/features/license/license_controller.dart';
import 'package:flowpost_desktop/features/license/license_providers.dart';
import 'package:flowpost_desktop/features/offline/offline_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_posts_cache.dart';

class _FakeApi implements LicenseApi {
  LicenseGrant? grant;
  LicenseException? failure;
  final List<String> keys = [];

  @override
  Future<LicenseGrant> activate(String key) async {
    keys.add(key);
    final failure = this.failure;
    if (failure != null) throw failure;
    return grant!;
  }
}

class _MemoryStore implements LicenseStore {
  LicenseRecord? record;
  bool failClear = false;

  @override
  Future<LicenseRecord?> read() async => record;

  @override
  Future<void> write(LicenseRecord record) async => this.record = record;

  @override
  Future<void> clear() async {
    if (failClear) {
      throw const LicenseException(LicenseError.storageUnavailable);
    }
    record = null;
  }
}

void main() {
  late _FakeApi api;
  late _MemoryStore store;

  ProviderContainer container({List<Override> overrides = const []}) {
    final created = ProviderContainer(
      overrides: [
        licenseServiceProvider.overrideWithValue(
          LicenseService(api: api, store: store),
        ),
        ...overrides,
      ],
    );
    addTearDown(created.dispose);
    return created;
  }

  setUp(() {
    api = _FakeApi()
      ..grant = LicenseGrant(
        token: 'token-1',
        expiresAt: DateTime.utc(2099, 1, 1),
      );
    store = _MemoryStore();
  });

  test('startup restores a stored grant and opens the session', () async {
    store.record = LicenseRecord(
      token: 'token-1',
      expiresAt: DateTime.utc(2099, 1, 1),
      key: 'key-1',
    );
    final scope = container();

    await scope.read(licenseControllerProvider.future);

    final state = scope.read(licenseControllerProvider).value;
    expect(state, isA<Active>());
    expect((state as Active).offline, isTrue);
    expect(scope.read(sessionProvider)?.sessionToken, 'token-1');
    expect(scope.read(sessionProvider)?.offline, isTrue);
  });

  test('startup with no grant locks the app and leaves no session', () async {
    final scope = container();

    await scope.read(licenseControllerProvider.future);

    final state = scope.read(licenseControllerProvider).value;
    expect((state as Locked).reason, LicenseError.missing);
    expect(scope.read(sessionProvider), isNull);
  });

  test('startup renews an expired grant with the stored key', () async {
    store.record = LicenseRecord(
      token: 'old-token',
      expiresAt: DateTime.utc(2020, 1, 1),
      key: 'key-1',
    );
    final scope = container();

    await scope.read(licenseControllerProvider.future);

    expect(api.keys, ['key-1']);
    expect(scope.read(licenseControllerProvider).value, isA<Active>());
    expect(scope.read(sessionProvider)?.sessionToken, 'token-1');
  });

  test('activation opens the session with the minted token', () async {
    final scope = container();
    await scope.read(licenseControllerProvider.future);

    await scope
        .read(licenseControllerProvider.notifier)
        .activate('flowpost-license-key-0001');

    expect(scope.read(licenseControllerProvider).value, isA<Active>());
    expect(store.record?.token, 'token-1');
    expect(scope.read(sessionProvider)?.sessionToken, 'token-1');
  });

  test('a refused activation keeps the app locked', () async {
    api.failure = const LicenseException(LicenseError.invalidKey);
    final scope = container();
    await scope.read(licenseControllerProvider.future);

    await scope.read(licenseControllerProvider.notifier).activate('bad-key');

    final state = scope.read(licenseControllerProvider).value;
    expect((state as Locked).reason, LicenseError.invalidKey);
    expect(scope.read(sessionProvider), isNull);
  });

  test('deactivation clears the session, the store and the state', () async {
    final scope = container();
    await scope.read(licenseControllerProvider.future);
    await scope.read(licenseControllerProvider.notifier).activate('key-1');

    final cleared = await scope
        .read(licenseControllerProvider.notifier)
        .deactivate();

    final state = scope.read(licenseControllerProvider).value;
    expect(cleared, isTrue);
    expect((state as Locked).reason, LicenseError.missing);
    expect(store.record, isNull);
    expect(scope.read(sessionProvider), isNull);
  });

  test('deactivation wipes the rows of the grant that ended', () async {
    final cache = FakePostsCache();
    final scope = container(
      overrides: [postsCacheProvider.overrideWithValue(cache)],
    );
    await scope.read(licenseControllerProvider.future);
    await scope.read(licenseControllerProvider.notifier).activate('key-1');

    await scope.read(licenseControllerProvider.notifier).deactivate();

    expect(cache.wipes, 1);
  });

  test(
    'a vault that will not clear still ends the session and the cache',
    () async {
      final cache = FakePostsCache();
      final scope = container(
        overrides: [postsCacheProvider.overrideWithValue(cache)],
      );
      await scope.read(licenseControllerProvider.future);
      await scope.read(licenseControllerProvider.notifier).activate('key-1');
      store.failClear = true;

      final cleared = await scope
          .read(licenseControllerProvider.notifier)
          .deactivate();

      final state = scope.read(licenseControllerProvider).value;
      expect(cleared, isFalse);
      expect((state as Locked).reason, LicenseError.storageUnavailable);
      expect(scope.read(sessionProvider), isNull);
      expect(cache.wipes, 1);
    },
  );

  test('a cache that will not wipe still ends the session', () async {
    final scope = container(
      overrides: [postsCacheProvider.overrideWithValue(_FailingWipe())],
    );
    await scope.read(licenseControllerProvider.future);
    await scope.read(licenseControllerProvider.notifier).activate('key-1');

    final cleared = await scope
        .read(licenseControllerProvider.notifier)
        .deactivate();

    expect(cleared, isTrue);
    expect(scope.read(sessionProvider), isNull);
    expect(store.record, isNull);
  });
}

class _FailingWipe extends FakePostsCache {
  @override
  Future<void> wipe() async {
    throw const FileSystemException('locked');
  }
}
