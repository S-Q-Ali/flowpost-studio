/// Every user-facing failure the license gate can produce.
enum LicenseError {
  missing('Enter your license key.'),
  invalidKey('This license key is not valid.'),
  expired('Your license has expired. Activate a new key to continue.'),
  rateLimited('Too many attempts. Try again in a few minutes.'),
  offline("Can't reach FlowPost. Check your connection."),
  storageUnavailable(
    "FlowPost can't store your license securely. Restart the app.",
  ),
  unexpected('Something went wrong. Try again.');

  const LicenseError(this.message);

  final String message;
}

/// A failure with a message that can be shown as-is.
///
/// [serverMessage] carries the backend's own text (the lockout countdown), so
/// the screen never invents its own wording.
class LicenseException implements Exception {
  const LicenseException(this.error, {this.serverMessage});

  final LicenseError error;
  final String? serverMessage;

  String get message => serverMessage ?? error.message;

  /// The key is never part of an error, so nothing that logs this leaks it.
  @override
  String toString() => 'LicenseException(${error.name})';
}

/// What the router guard decides from (SPEC-license).
sealed class LicenseState {
  const LicenseState();
}

final class Locked extends LicenseState {
  const Locked(this.reason);

  final LicenseError reason;
}

final class Active extends LicenseState {
  const Active({required this.expiresAt, this.offline = false});

  final DateTime expiresAt;

  /// True when the app was opened from the stored grant without a network call.
  final bool offline;
}

/// What the secure vault keeps: the minted session, its expiry, and the key
/// for a silent renewal once the session expires.
class LicenseRecord {
  const LicenseRecord({required this.token, required this.expiresAt, this.key});

  final String token;
  final DateTime expiresAt;
  final String? key;

  @override
  String toString() =>
      'LicenseRecord(expiresAt: ${expiresAt.toIso8601String()})';
}
