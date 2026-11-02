import 'package:flowpost_desktop/core/security/secret_vault.dart';
import 'package:flowpost_desktop/features/license/data/license_models.dart';
import 'package:flowpost_desktop/features/license/data/license_store.dart';
import 'package:flutter_test/flutter_test.dart';

class _MemoryVault implements SecretVault {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);

  @override
  Future<Map<String, String>> readAll() async => Map.of(values);
}

class _StickyVault extends _MemoryVault {
  _StickyVault({required this.stuckOn});

  final String stuckOn;

  @override
  Future<void> delete(String key) async {
    if (key == stuckOn) throw StateError('locked');
    await super.delete(key);
  }
}

class _ThrowingVault implements SecretVault {
  @override
  Future<String?> read(String key) async => throw StateError('locked');

  @override
  Future<void> write(String key, String value) async =>
      throw StateError('locked');

  @override
  Future<void> delete(String key) async => throw StateError('locked');

  @override
  Future<Map<String, String>> readAll() async => throw StateError('locked');
}

void main() {
  late _MemoryVault vault;
  late SecureLicenseStore store;

  setUp(() {
    vault = _MemoryVault();
    store = SecureLicenseStore(vault: vault);
  });

  test('token, expiry and key round-trip', () async {
    expect(await store.read(), isNull);

    await store.write(
      LicenseRecord(
        token: 'token-1',
        expiresAt: DateTime.utc(2026, 11, 7, 12),
        key: 'flowpost-license-key-0001',
      ),
    );

    final record = await store.read();
    expect(record?.token, 'token-1');
    expect(record?.expiresAt, DateTime.utc(2026, 11, 7, 12));
    expect(record?.key, 'flowpost-license-key-0001');
  });

  test(
    'a key is optional; a record without token or expiry is ignored',
    () async {
      await store.write(
        LicenseRecord(token: 'token-1', expiresAt: DateTime.utc(2026, 11, 7)),
      );
      expect((await store.read())?.key, isNull);

      vault.values['flowpost.license.token'] = 'token-1';
      vault.values.remove('flowpost.license.expires_at');
      expect(await store.read(), isNull);

      vault.values['flowpost.license.expires_at'] = 'not a date';
      expect(await store.read(), isNull);
    },
  );

  test(
    'clear removes the license records and leaves other vault values',
    () async {
      vault.values['flowpost.identity.profile'] = '{"userId":"u1"}';
      await store.write(
        LicenseRecord(
          token: 'token-1',
          expiresAt: DateTime.utc(2026, 11, 7),
          key: 'key',
        ),
      );

      await store.clear();

      expect(await store.read(), isNull);
      expect(vault.values, {'flowpost.identity.profile': '{"userId":"u1"}'});
    },
  );

  test('one record that will not go does not stop the other two', () async {
    final vault = _StickyVault(stuckOn: SecureLicenseStore.tokenKey);
    final store = SecureLicenseStore(vault: vault);
    await store.write(
      LicenseRecord(
        token: 'token-1',
        expiresAt: DateTime.utc(2026, 11, 7),
        key: 'key',
      ),
    );

    await expectLater(
      store.clear(),
      throwsA(
        isA<LicenseException>().having(
          (e) => e.error,
          'error',
          LicenseError.storageUnavailable,
        ),
      ),
    );

    // Only the record the vault would not give up is left.
    expect(vault.values.keys, [SecureLicenseStore.tokenKey]);
  });

  test('a vault failure is the storage failure', () async {
    final broken = SecureLicenseStore(vault: _ThrowingVault());

    await expectLater(
      broken.read(),
      throwsA(
        isA<LicenseException>().having(
          (e) => e.error,
          'error',
          LicenseError.storageUnavailable,
        ),
      ),
    );
  });
}
