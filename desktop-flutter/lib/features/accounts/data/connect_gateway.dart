import '../../publishing/data/posts_repository.dart';
import '../domain/connect_link.dart';

/// Starts and stops a browser connect on the server.
abstract class ConnectGateway {
  /// The address the system browser opens for this connect. [nonce] is the
  /// one this app made, so the answer can be matched back to the wait.
  Future<String> connectUrl({required String platform, required String nonce});

  /// What the browser's callback recorded for this connect, or null while it
  /// has recorded nothing. The server matches [nonce] to the session that made
  /// the connect, so this only speaks about a connect this app started.
  Future<ConnectResult?> connectOutcome({
    required String platform,
    required String nonce,
  });

  /// Revokes the grant the server holds and removes the account row.
  Future<void> disconnect({
    required String platform,
    required String accountId,
  });
}

/// Asks the `posts-api` function, through the transport the queue already
/// uses, so one session and one set of failure kinds cover every call.
///
/// The session names the owner; no call takes one from the body, so a connect
/// can only be started, asked about or stopped for the account this license
/// holds. The transport hands back rows, so the answers come in the first row.
class ServerConnectGateway implements ConnectGateway {
  ServerConnectGateway({required this.sessionToken, required this.transport});

  /// The license session. Without it the server has no owner to connect for.
  final String? sessionToken;

  final PostsTransport transport;

  @override
  Future<String> connectUrl({
    required String platform,
    required String nonce,
  }) async {
    final rows = await transport.send(
      body: {'action': 'connect-url', 'platform': platform, 'nonce': nonce},
      token: sessionToken,
    );
    final url = rows.isEmpty ? null : rows.first['url'];
    // An answer without an address is a failure: opening nothing, or opening
    // an address the server never named, both leave the admin waiting on a
    // browser that was never told to go anywhere.
    if (url is! String || url.isEmpty) {
      throw const PostsException('The connect could not start.');
    }
    return url;
  }

  @override
  Future<ConnectResult?> connectOutcome({
    required String platform,
    required String nonce,
  }) async {
    final rows = await transport.send(
      body: {'action': 'connect-status', 'platform': platform, 'nonce': nonce},
      token: sessionToken,
    );
    // Only the three words the server was told to record answer. Anything
    // else — a row with nothing in it, a word from some other connect — is
    // the same as no answer, and the wait stays open.
    return switch (rows.isEmpty ? null : rows.first['result']) {
      'connected' => ConnectResult.connected,
      'denied' => ConnectResult.denied,
      'failed' => ConnectResult.failed,
      _ => null,
    };
  }

  @override
  Future<void> disconnect({
    required String platform,
    required String accountId,
  }) async {
    // The answer names the rows that went; the caller reads the list again,
    // so whether one row or none left, the server is what says so.
    await transport.send(
      body: {
        'action': 'disconnect',
        'platform': platform,
        'accountId': accountId,
      },
      token: sessionToken,
    );
  }
}
