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

  /// Lets a test look at the app while the call is in flight.
  void Function()? onCall;

  @override
  Future<LicenseGrant> activate(String key) async {
    keys.add(key);
    onCall?.call();
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
  late DateTime clock;
  ProviderContainer? alive;

  ProviderContainer container({List<Override> overrides = const []}) {
    final created = ProviderContainer(
      overrides: [
        licenseServiceProvider.overrideWithValue(
          LicenseService(api: api, store: store, clock: () => clock),
        ),
        ...overrides,
      ],
    );
    alive = created;
    return created;
  }

  /// An active license holds a timer until its session expires. A test that
  /// gets that far gives it back before the binding looks for leaks.
  void close(ProviderContainer created) {
    alive = null;
    created.dispose();
  }

  tearDown(() => alive?.dispose());

  setUp(() {
    api = _FakeApi()
      ..grant = LicenseGrant(
        token: 'token-1',
        expiresAt: DateTime.utc(2099, 1, 1),
      );
    store = _MemoryStore();
    clock = DateTime.utc(2026, 11, 1, 12);
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
  testWidgets('the expiry of a session is reached, not slept through', (
    tester,
  ) async {
    store.record = LicenseRecord(
      token: 'token-1',
      expiresAt: clock.add(const Duration(hours: 2)),
      key: 'key-1',
    );
    api.grant = LicenseGrant(
      token: 'token-2',
      expiresAt: DateTime.utc(2099, 1, 1),
    );
    final scope = container();
    await scope.read(licenseControllerProvider.future);
    var tokenDuringRenewal = 'nothing asked';
    api.onCall = () =>
        tokenDuringRenewal = '${scope.read(sessionProvider)?.sessionToken}';

    // The machine's clock passes the expiry and the app's wait ends with it:
    // the app asks again instead of letting every later call fail with the
    // dead token.
    clock = clock.add(const Duration(hours: 2, minutes: 1));
    await tester.pump(const Duration(hours: 3));
    await tester.pump();

    expect(api.keys, ['key-1']);
    expect(tokenDuringRenewal, 'null');
    expect(scope.read(sessionProvider)?.sessionToken, 'token-2');
    expect(scope.read(licenseControllerProvider).value, isA<Active>());
    close(scope);
  });

  test(
    'a session the backend refused is renewed even while it looks valid',
    () async {
      store.record = LicenseRecord(
        token: 'token-1',
        expiresAt: DateTime.utc(2099, 1, 1),
        key: 'key-1',
      );
      api.grant = LicenseGrant(
        token: 'token-2',
        expiresAt: DateTime.utc(2099, 6, 1),
      );
      final scope = container();
      await scope.read(licenseControllerProvider.future);

      await scope
          .read(licenseControllerProvider.notifier)
          .revalidate(refused: true);

      expect(api.keys, ['key-1']);
      expect(scope.read(sessionProvider)?.sessionToken, 'token-2');
    },
  );

  test(
    'a refused session with a key the backend will not take locks the app',
    () async {
      store.record = LicenseRecord(
        token: 'token-1',
        expiresAt: DateTime.utc(2099, 1, 1),
        key: 'revoked-key',
      );
      api.failure = const LicenseException(LicenseError.invalidKey);
      final scope = container();
      await scope.read(licenseControllerProvider.future);

      await scope
          .read(licenseControllerProvider.notifier)
          .revalidate(refused: true);

      final state = scope.read(licenseControllerProvider).value;
      expect((state as Locked).reason, LicenseError.invalidKey);
      expect(scope.read(sessionProvider), isNull);
      expect(store.record, isNull);
    },
  );

  test('calls that are all refused ask for a new session once', () async {
    store.record = LicenseRecord(
      token: 'token-1',
      expiresAt: DateTime.utc(2099, 1, 1),
      key: 'key-1',
    );
    final scope = container();
    await scope.read(licenseControllerProvider.future);

    await Future.wait([
      scope.read(licenseControllerProvider.notifier).revalidate(refused: true),
      scope.read(licenseControllerProvider.notifier).revalidate(refused: true),
      scope.read(licenseControllerProvider.notifier).revalidate(refused: true),
    ]);

    expect(api.keys, ['key-1']);
    expect(scope.read(sessionProvider)?.sessionToken, 'token-1');
  });

  test(
    'a session that is not expired and never refused is left alone',
    () async {
      store.record = LicenseRecord(
        token: 'token-1',
        expiresAt: DateTime.utc(2099, 1, 1),
        key: 'key-1',
      );
      final scope = container();
      await scope.read(licenseControllerProvider.future);

      expect(api.keys, isEmpty);
      expect(scope.read(sessionProvider)?.sessionToken, 'token-1');
    },
  );
}

class _FailingWipe extends FakePostsCache {
  @override
  Future<void> wipe() async {
    throw const FileSystemException('locked');
  }
}
