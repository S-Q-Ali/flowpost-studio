import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../publishing/data/posts_repository.dart';

/// What the app knows about the connection (SPEC-offline "What the app knows
/// about the connection").
enum ConnectionStatus { online, offline }

/// The state the app starts on.
///
/// There is no poll to ask: the first call tells. Starting online means the
/// first read is attempted rather than refused on a guess.
final connectivityProvider =
    NotifierProvider<ConnectivityController, ConnectionStatus>(
      ConnectivityController.new,
    );

class ConnectivityController extends Notifier<ConnectionStatus> {
  @override
  ConnectionStatus build() => ConnectionStatus.online;

  /// A call reached the server.
  void reached() => state = ConnectionStatus.online;

  /// A connection was never opened, or was dropped.
  void lost() => state = ConnectionStatus.offline;
}

/// Passes a posts call through and reports what it found.
///
/// The app learns the state from the calls it already makes, so there is
/// nothing to poll and no state to believe over the server's own answer
/// (SPEC-offline Decision 1).
class ReportingTransport implements PostsTransport {
  ReportingTransport({
    required this.inner,
    required this.onReached,
    required this.onLost,
  });

  final PostsTransport inner;
  final void Function() onReached;
  final void Function() onLost;

  @override
  Future<List<Map<String, Object?>>> send({
    required String method,
    required Uri url,
    String? body,
    String? token,
  }) async {
    try {
      final rows = await inner.send(
        method: method,
        url: url,
        body: body,
        token: token,
      );
      onReached();
      return rows;
    } on PostsException catch (error) {
      // A timeout and an error answer both say the server was reached, so
      // only a connection-level failure is offline (Decision 2).
      if (error.kind == PostsErrorKind.connection) {
        onLost();
      } else {
        onReached();
      }
      rethrow;
    }
  }
}
