import 'package:flowpost_desktop/core/session/session.dart';
import 'package:flowpost_desktop/features/license/data/license_client.dart';
import 'package:flowpost_desktop/features/license/data/license_models.dart';
import 'package:flowpost_desktop/features/license/data/license_service.dart';
import 'package:flowpost_desktop/features/license/data/license_store.dart';
import 'package:flowpost_desktop/features/license/license_controller.dart';
import 'package:flowpost_desktop/features/license/license_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

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

  @override
  Future<LicenseRecord?> read() async => record;

  @override
  Future<void> write(LicenseRecord record) async => this.record = record;

  @override
  Future<void> clear() async => record = null;
}

void main() {
  late _FakeApi api;
  late _MemoryStore store;

  ProviderContainer container() {
    final created = ProviderContainer(
      overrides: [
        licenseServiceProvider.overrideWithValue(
          LicenseService(api: api, store: store),
        ),
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

    await scope.read(licenseControllerProvider.notifier).deactivate();

    final state = scope.read(licenseControllerProvider).value;
    expect((state as Locked).reason, LicenseError.missing);
    expect(store.record, isNull);
    expect(scope.read(sessionProvider), isNull);
  });
}
