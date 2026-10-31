import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'identity_models.dart';

/// The four records the identity module keeps, and nothing else.
abstract interface class IdentityStore {
  Future<String?> readSession();
  Future<void> writeSession(String sessionJson);
  Future<void> deleteSession();

  Future<AdminToken?> readAdminToken();
  Future<void> writeAdminToken(AdminToken token);
  Future<void> deleteAdminToken();

  Future<ProfileCache?> readProfile();
  Future<void> writeProfile(ProfileCache profile);

  /// Removes every identity record: session, token, profile and PKCE verifiers.
  Future<void> clear();
}

/// A key-value secret store; Windows Credential Manager in production.
abstract interface class SecretVault {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
  Future<Map<String, String>> readAll();
}

class CredentialVault implements SecretVault {
  const CredentialVault([this.storage = const FlutterSecureStorage()]);

  final FlutterSecureStorage storage;

  @override
  Future<String?> read(String key) => storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => storage.delete(key: key);

  @override
  Future<Map<String, String>> readAll() => storage.readAll();
}

/// The one place tokens are written: the native secure vault, never a file.
///
/// It also serves Supabase's two storage contracts, so the SDK writes the
/// session and the PKCE verifier through the same adapter.
class SecureIdentityStore
    implements IdentityStore, LocalStorage, GotrueAsyncStorage {
  SecureIdentityStore({SecretVault? vault})
    : _vault = vault ?? const CredentialVault();

  static const String namespace = 'flowpost.identity.';
  static const String sessionKey = '${namespace}supabase_session';
  static const String adminTokenKey = '${namespace}admin_token';
  static const String profileKey = '${namespace}profile';
  static const String _pkcePrefix = '${namespace}pkce.';

  final SecretVault _vault;

  @override
  Future<String?> readSession() => _vault.read(sessionKey);

  @override
  Future<void> writeSession(String sessionJson) =>
      _vault.write(sessionKey, sessionJson);

  @override
  Future<void> deleteSession() => _vault.delete(sessionKey);

  @override
  Future<AdminToken?> readAdminToken() async {
    final json = _decode(await _vault.read(adminTokenKey));
    final token = json?['token'];
    final issuedAt = json?['issuedAt'];
    if (token is! String || token.isEmpty || issuedAt is! String) return null;
    final parsed = DateTime.tryParse(issuedAt);
    if (parsed == null) return null;
    return AdminToken(token: token, issuedAt: parsed);
  }

  @override
  Future<void> writeAdminToken(AdminToken token) => _vault.write(
    adminTokenKey,
    jsonEncode({
      'token': token.token,
      'issuedAt': token.issuedAt.toUtc().toIso8601String(),
    }),
  );

  @override
  Future<void> deleteAdminToken() => _vault.delete(adminTokenKey);

  @override
  Future<ProfileCache?> readProfile() async {
    final json = _decode(await _vault.read(profileKey));
    final userId = json?['userId'];
    final isAdmin = json?['isAdmin'];
    final email = json?['email'];
    if (userId is! String || isAdmin is! bool) return null;
    return ProfileCache(
      userId: userId,
      email: email is String ? email : null,
      isAdmin: isAdmin,
    );
  }

  @override
  Future<void> writeProfile(ProfileCache profile) => _vault.write(
    profileKey,
    jsonEncode({
      'userId': profile.userId,
      'email': profile.email,
      'isAdmin': profile.isAdmin,
    }),
  );

  @override
  Future<void> clear() async {
    final all = await _vault.readAll();
    for (final key in all.keys.where((key) => key.startsWith(namespace))) {
      await _vault.delete(key);
    }
  }

  // LocalStorage: the Supabase session.

  @override
  Future<void> initialize() async {}

  @override
  Future<bool> hasAccessToken() async => await readSession() != null;

  @override
  Future<String?> accessToken() async {
    final token = _decode(await readSession())?['access_token'];
    return token is String ? token : null;
  }

  @override
  Future<void> persistSession(String persistSessionString) =>
      writeSession(persistSessionString);

  @override
  Future<void> removePersistedSession() => deleteSession();

  // GotrueAsyncStorage: the PKCE verifier.

  @override
  Future<String?> getItem({required String key}) =>
      _vault.read('$_pkcePrefix$key');

  @override
  Future<void> setItem({required String key, required String value}) =>
      _vault.write('$_pkcePrefix$key', value);

  @override
  Future<void> removeItem({required String key}) =>
      _vault.delete('$_pkcePrefix$key');
}

Map<String, Object?>? _decode(String? raw) {
  if (raw == null) return null;
  try {
    final value = jsonDecode(raw);
    return value is Map<String, Object?> ? value : null;
  } on FormatException {
    return null;
  }
}
