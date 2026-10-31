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

    expect(await store.readAdminToken(), isNull);
    expect(await store.readProfile(), isNull);
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
