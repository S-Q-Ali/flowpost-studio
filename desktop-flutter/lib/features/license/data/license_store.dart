import '../../../core/security/secret_vault.dart';
import 'license_models.dart';

/// The license records the secure vault keeps, and nothing else.
abstract interface class LicenseStore {
  Future<LicenseRecord?> read();
  Future<void> write(LicenseRecord record);
  Future<void> clear();
}

/// Stores the license in the native secure vault, never a file.
class SecureLicenseStore implements LicenseStore {
  SecureLicenseStore({SecretVault? vault})
    : _vault = vault ?? const CredentialVault();

  static const String tokenKey = 'flowpost.license.token';
  static const String expiresAtKey = 'flowpost.license.expires_at';
  static const String keyKey = 'flowpost.license.key';

  final SecretVault _vault;

  @override
  Future<LicenseRecord?> read() => _guard(() async {
    final token = await _vault.read(tokenKey);
    final expiresAt = DateTime.tryParse(await _vault.read(expiresAtKey) ?? '');
    if (token == null || token.isEmpty || expiresAt == null) {
      return null;
    }
    return LicenseRecord(
      token: token,
      expiresAt: expiresAt.toUtc(),
      key: await _vault.read(keyKey),
    );
  });

  @override
  Future<void> write(LicenseRecord record) => _guard(() async {
    await _vault.write(tokenKey, record.token);
    await _vault.write(
      expiresAtKey,
      record.expiresAt.toUtc().toIso8601String(),
    );
    final key = record.key;
    if (key == null) {
      await _vault.delete(keyKey);
    } else {
      await _vault.write(keyKey, key);
    }
  });

  /// Removes the license records only; identity records from an older build
  /// are not this module's to touch. Every record is attempted before the
  /// failure is reported: a leftover token keeps the app signed in.
  @override
  Future<void> clear() async {
    var failed = false;
    for (final name in [tokenKey, expiresAtKey, keyKey]) {
      try {
        await _vault.delete(name);
      } on Object {
        failed = true;
      }
    }
    if (failed) {
      throw const LicenseException(LicenseError.storageUnavailable);
    }
  }

  Future<T> _guard<T>(Future<T> Function() run) async {
    try {
      return await run();
    } on Object {
      throw const LicenseException(LicenseError.storageUnavailable);
    }
  }
}
