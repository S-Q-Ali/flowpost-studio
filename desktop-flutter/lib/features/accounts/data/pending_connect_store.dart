import 'dart:math';

import '../domain/connect_link.dart';
import '../domain/connected_account.dart';

/// One connect this app started and has not heard back about.
class PendingConnect {
  const PendingConnect({
    required this.platform,
    required this.nonce,
    required this.expiresAt,
  });

  final String platform;
  final String nonce;
  final DateTime expiresAt;
}

/// Whether a callback link answers a wait this app started.
enum ConnectAnswer { trusted, unknown, expired, wrongPlatform }

/// The connects this app started and is still waiting on.
///
/// The nonce is what turns a browser redirect into an answer rather than a
/// request: the server sends back the one this app made, and a link naming a
/// nonce that is not here — already used, never asked for, or left behind when
/// the app closed — is not trusted. It lives in memory only; a wait that
/// outlives the process has nothing to check against, and the account list
/// read from the server is the truth either way.
class PendingConnectStore {
  PendingConnectStore({
    DateTime Function()? now,
    this.lifetime = const Duration(minutes: 10),
  }) : _now = now ?? DateTime.now;

  /// How long one wait is open — the same ten minutes the server gives a
  /// connect state to be exchanged.
  final Duration lifetime;

  final DateTime Function() _now;
  final Map<String, PendingConnect> _waits = {};

  /// Opens a wait for [platform] and answers the nonce to send with it.
  /// Starting again abandons the previous wait for that platform.
  PendingConnect start(String platform) {
    if (socialPlatformOf(platform) == null) {
      throw ArgumentError.value(platform, 'platform', 'No such platform');
    }
    final wait = PendingConnect(
      platform: platform,
      nonce: _newNonce(),
      expiresAt: _now().add(lifetime),
    );
    _waits.removeWhere((_, open) => open.platform == platform);
    _waits[wait.nonce] = wait;
    return wait;
  }

  /// Checks a link against the open waits and spends the one it answers, so
  /// the same link cannot be used twice.
  ConnectAnswer answer(ConnectCallback callback) {
    final wait = _waits[callback.nonce];
    if (wait == null) return ConnectAnswer.unknown;
    if (wait.platform != callback.platform) return ConnectAnswer.wrongPlatform;
    _waits.remove(callback.nonce);
    if (!_now().isBefore(wait.expiresAt)) return ConnectAnswer.expired;
    return ConnectAnswer.trusted;
  }

  /// The waits still inside their minute, oldest first; a dead one is dropped.
  List<PendingConnect> waiting() {
    final now = _now();
    _waits.removeWhere((_, open) => !now.isBefore(open.expiresAt));
    return _waits.values.toList();
  }

  String _newNonce() {
    final random = Random.secure();
    return List.generate(
      32,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }
}
