import 'package:flowpost_desktop/features/license/data/license_client.dart';
import 'package:flowpost_desktop/features/license/data/license_models.dart';
import 'package:flowpost_desktop/features/license/data/license_service.dart';
import 'package:flowpost_desktop/features/license/data/license_store.dart';
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
  int clears = 0;

  @override
  Future<LicenseRecord?> read() async => record;

  @override
  Future<void> write(LicenseRecord record) async => this.record = record;

  @override
  Future<void> clear() async {
    clears++;
    record = null;
  }
}

void main() {
  late _FakeApi api;
  late _MemoryStore store;
  late DateTime now;

  LicenseService service() =>
      LicenseService(api: api, store: store, clock: () => now);

  setUp(() {
    api = _FakeApi()
      ..grant = LicenseGrant(
        token: 'token-1',
        expiresAt: DateTime.utc(2026, 11, 7, 12),
      );
    store = _MemoryStore();
    now = DateTime.utc(2026, 10, 31, 12);
  });

  test('activation stores the grant and returns Active', () async {
    final state = await service().activate(' flowpost-license-key-0001 ');

    expect(state, isA<Active>());
    final active = state as Active;
    expect(active.expiresAt, DateTime.utc(2026, 11, 7, 12));
    expect(active.offline, isFalse);
    expect(api.keys.single, 'flowpost-license-key-0001');
    expect(store.record?.token, 'token-1');
    expect(store.record?.key, 'flowpost-license-key-0001');
  });

  test('an empty key is refused before any call', () async {
    final state = await service().activate('   ');

    expect(state, isA<Locked>());
    expect((state as Locked).reason, LicenseError.missing);
    expect(api.keys, isEmpty);
    expect(store.record, isNull);
  });

  test('an invalid key is Locked and nothing is stored', () async {
    api.failure = const LicenseException(LicenseError.invalidKey);

    final state = await service().activate('key-1');

    expect(state, isA<Locked>());
    expect((state as Locked).reason, LicenseError.invalidKey);
    expect(store.record, isNull);
  });

  test('a locked-out activation keeps the server countdown', () async {
    api.failure = const LicenseException(
      LicenseError.rateLimited,
      serverMessage: 'Too many attempts. Try again in 14 minutes.',
    );

    final state = await service().activate('key-1');

    expect((state as Locked).reason, LicenseError.rateLimited);
    expect(state.text, 'Too many attempts. Try again in 14 minutes.');
  });

  test('the stored token is readable after activation', () async {
    final license = service();
    await license.activate('key-1');

    expect(await license.token(), 'token-1');
  });

  test('restore without a record asks for a key', () async {
    final state = await service().restore();

    expect((state as Locked).reason, LicenseError.missing);
    expect(api.keys, isEmpty);
  });

  test('restore with a future expiry opens the app offline', () async {
    store.record = LicenseRecord(
      token: 'token-1',
      expiresAt: DateTime.utc(2026, 11, 7, 12),
      key: 'key-1',
    );

    final state = await service().restore();

    expect(state, isA<Active>());
    expect((state as Active).offline, isTrue);
    expect(api.keys, isEmpty);
  });

  test(
    'a grant the backend refused is renewed even while it looks valid',
    () async {
      store.record = LicenseRecord(
        token: 'token-1',
        expiresAt: DateTime.utc(2026, 11, 7, 12),
        key: 'key-1',
      );

      final state = await service().restore(renew: true);

      expect(state, isA<Active>());
      expect(api.keys.single, 'key-1');
      expect(store.record?.token, 'token-1');
    },
  );

  test('an expired record renews silently with the stored key', () async {
    store.record = LicenseRecord(
      token: 'old-token',
      expiresAt: DateTime.utc(2026, 10, 30, 12),
      key: 'key-1',
    );

    final state = await service().restore();

    expect(state, isA<Active>());
    expect(api.keys.single, 'key-1');
    expect(store.record?.token, 'token-1');
  });

  test('an expired record with no key asks for a new key', () async {
    store.record = LicenseRecord(
      token: 'old-token',
      expiresAt: DateTime.utc(2026, 10, 30, 12),
    );

    final state = await service().restore();

    expect((state as Locked).reason, LicenseError.expired);
    expect(api.keys, isEmpty);
    expect(store.record, isNull);
  });

  test('a revoked license is cleared and reported as invalid', () async {
    store.record = LicenseRecord(
      token: 'old-token',
      expiresAt: DateTime.utc(2026, 10, 30, 12),
      key: 'revoked-key',
    );
    api.failure = const LicenseException(LicenseError.invalidKey);

    final state = await service().restore();

    expect((state as Locked).reason, LicenseError.invalidKey);
    expect(store.record, isNull);
  });

  test('renewal while offline keeps the record for the next try', () async {
    store.record = LicenseRecord(
      token: 'old-token',
      expiresAt: DateTime.utc(2026, 10, 30, 12),
      key: 'key-1',
    );
    api.failure = const LicenseException(LicenseError.offline);

    final state = await service().restore();

    expect((state as Locked).reason, LicenseError.offline);
    expect(store.record?.key, 'key-1');
  });

  test('clear removes the record and the cached token', () async {
    final license = service();
    await license.activate('key-1');

    await license.clear();

    expect(store.record, isNull);
    expect(await license.token(), isNull);
  });
}
