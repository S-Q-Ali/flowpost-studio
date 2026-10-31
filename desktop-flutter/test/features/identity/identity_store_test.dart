import 'package:flowpost_desktop/features/identity/data/identity_models.dart';
import 'package:flowpost_desktop/features/identity/data/identity_store.dart';
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
  late SecureIdentityStore store;

  setUp(() {
    vault = _MemoryVault();
    store = SecureIdentityStore(vault: vault);
  });

  test('the Supabase session round-trips and is removed', () async {
    expect(await store.readSession(), isNull);

    await store.writeSession('{"access_token":"abc"}');
    expect(await store.readSession(), '{"access_token":"abc"}');

    await store.deleteSession();
    expect(await store.readSession(), isNull);
  });

  test('LocalStorage reads the access token from the session record', () async {
    await store.writeSession(
      '{"access_token":"access-123","refresh_token":"r"}',
    );

    expect(await store.hasAccessToken(), isTrue);
    expect(await store.accessToken(), 'access-123');

    await store.writeSession('not json');
    expect(await store.hasAccessToken(), isTrue);
    expect(await store.accessToken(), isNull);
  });

  test('the PKCE verifier round-trips under its own keys', () async {
    await store.setItem(key: 'verifier-a', value: 'one');
    await store.setItem(key: 'verifier-b', value: 'two');

    expect(await store.getItem(key: 'verifier-a'), 'one');
    expect(await store.getItem(key: 'verifier-b'), 'two');

    await store.removeItem(key: 'verifier-a');
    expect(await store.getItem(key: 'verifier-a'), isNull);
    expect(await store.getItem(key: 'verifier-b'), 'two');
  });

  test('the admin token keeps its issue time and hides the token', () async {
    final issuedAt = DateTime.utc(2026, 10, 31, 12);
    await store.writeAdminToken(
      AdminToken(token: 'flowpost-token', issuedAt: issuedAt),
    );

    final stored = await store.readAdminToken();

    expect(stored?.token, 'flowpost-token');
    expect(stored?.issuedAt, issuedAt);
    expect(stored.toString(), isNot(contains('flowpost-token')));

    await store.deleteAdminToken();
    expect(await store.readAdminToken(), isNull);
  });

  test('the profile cache round-trips', () async {
    await store.writeProfile(
      const ProfileCache(
        userId: 'user-1',
        email: 'admin@example.com',
        isAdmin: true,
      ),
    );

    final stored = await store.readProfile();

    expect(stored?.userId, 'user-1');
    expect(stored?.email, 'admin@example.com');
    expect(stored?.isAdmin, isTrue);
  });

  test('malformed records are treated as absent', () async {
    vault.values[SecureIdentityStore.adminTokenKey] = 'not json';
    vault.values[SecureIdentityStore.profileKey] = '{"userId": 5}';
    vault.values[SecureIdentityStore.pendingOAuthKey] = '{"state": ""}';

    expect(await store.readAdminToken(), isNull);
    expect(await store.readProfile(), isNull);
    expect(await store.readPendingOAuth(), isNull);
  });

  test('the pending OAuth state round-trips and is deleted', () async {
    final createdAt = DateTime.utc(2026, 10, 31, 12);
    await store.writePendingOAuth(
      PendingOAuth(state: 'state-123', createdAt: createdAt),
    );

    final stored = await store.readPendingOAuth();
    expect(stored?.state, 'state-123');
    expect(stored?.createdAt, createdAt);

    await store.deletePendingOAuth();
    expect(await store.readPendingOAuth(), isNull);
  });

  test('clear removes a pending OAuth state too', () async {
    await store.writePendingOAuth(
      PendingOAuth(state: 'state-123', createdAt: DateTime.utc(2026)),
    );

    await store.clear();

    expect(await store.readPendingOAuth(), isNull);
  });

  test('a vault failure is reported as storage unavailable', () async {
    final broken = SecureIdentityStore(vault: _ThrowingVault());

    await expectLater(
      broken.readSession(),
      throwsA(
        isA<IdentityException>().having(
          (e) => e.error,
          'error',
          IdentityError.storageUnavailable,
        ),
      ),
    );
  });

  test('clear removes every identity record but nothing else', () async {
    await store.writeSession('{"access_token":"abc"}');
    await store.writeAdminToken(
      AdminToken(token: 'flowpost-token', issuedAt: DateTime.utc(2026)),
    );
    await store.writeProfile(
      const ProfileCache(userId: 'user-1', email: null, isAdmin: true),
    );
    await store.setItem(key: 'verifier', value: 'value');
    vault.values['unrelated.key'] = 'keep me';

    await store.clear();

    expect(await store.readSession(), isNull);
    expect(await store.readAdminToken(), isNull);
    expect(await store.readProfile(), isNull);
    expect(await store.getItem(key: 'verifier'), isNull);
    expect(vault.values['unrelated.key'], 'keep me');
  });
}
