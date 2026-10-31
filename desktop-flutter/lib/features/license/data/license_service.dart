import 'license_client.dart';
import 'license_models.dart';
import 'license_store.dart';

/// Turns a key into an open app, and a stored grant back into one.
class LicenseService {
  LicenseService({
    required this.api,
    required this.store,
    DateTime Function()? clock,
  }) : _now = clock ?? DateTime.now;

  final LicenseApi api;
  final LicenseStore store;
  final DateTime Function() _now;
  String? _token;

  /// Exchanges [key] for a session. A refusal is a [Locked] state, not an
  /// exception, so the screen can show the reason it carries.
  Future<LicenseState> activate(String key) async {
    final trimmed = key.trim();
    if (trimmed.isEmpty) return const Locked(LicenseError.missing);
    try {
      final grant = await api.activate(trimmed);
      await store.write(
        LicenseRecord(
          token: grant.token,
          expiresAt: grant.expiresAt,
          key: trimmed,
        ),
      );
      _token = grant.token;
      return Active(expiresAt: grant.expiresAt);
    } on LicenseException catch (error) {
      return Locked(error.error);
    }
  }

  /// Opens the app from the vault without a network call while the grant is
  /// unexpired; an expired grant renews silently with the stored key.
  Future<LicenseState> restore() async {
    try {
      final record = await store.read();
      if (record == null) return const Locked(LicenseError.missing);
      if (record.expiresAt.isAfter(_now())) {
        _token = record.token;
        return Active(expiresAt: record.expiresAt, offline: true);
      }
      final key = record.key;
      if (key == null) {
        await store.clear();
        return const Locked(LicenseError.expired);
      }
      final renewed = await activate(key);
      if (renewed is Locked &&
          (renewed.reason == LicenseError.invalidKey ||
              renewed.reason == LicenseError.expired)) {
        await store.clear();
      }
      return renewed;
    } on LicenseException catch (error) {
      return Locked(error.error);
    }
  }

  /// The minted session token, for the app's outbound calls.
  Future<String?> token() async => _token ?? (await store.read())?.token;

  Future<void> clear() async {
    _token = null;
    await store.clear();
  }
}
