import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

/// The status of a post row (SPEC-publishing "Status model").
enum PostStatus {
  scheduled,
  processing,
  publishing,
  published,
  failed;

  /// Reads the status of a row. Null when the value is not one the database
  /// allows, so an unknown status is never treated as a success.
  static PostStatus? fromName(Object? name) {
    if (name is! String) return null;
    for (final status in PostStatus.values) {
      if (status.name == name) return status;
    }
    return null;
  }
}

/// The row the client writes for one platform.
class PostDraft {
  const PostDraft({
    required this.id,
    required this.videoId,
    required this.platform,
    required this.accountId,
    required this.postType,
    required this.scheduledAt,
    required this.status,
    this.caption,
    this.hashtags,
    this.captionsEnabled = true,
    this.containsAlteredContent = false,
    this.metadata,
  });

  /// The id the client picked.
  ///
  /// Picked here, not by the table, so an insert whose answer was lost can be
  /// checked by this id instead of written a second time.
  final String id;

  final String videoId;
  final String platform;
  final String accountId;

  /// `feed` or `story`.
  final String postType;

  /// The UTC instant the post goes out at.
  final DateTime scheduledAt;

  /// `scheduled` or `processing`.
  final String status;

  final String? caption;
  final String? hashtags;
  final bool captionsEnabled;
  final bool containsAlteredContent;

  /// The extra fields of the row, such as the YouTube title.
  final Map<String, Object?>? metadata;

  /// The row as the table wants it.
  ///
  /// The owner is not named: `posts-api` writes every row under the session
  /// that called it, whatever the client sends.
  Map<String, Object?> toRow() => {
    'id': id,
    'video_id': videoId,
    'platform': platform,
    'account_id': accountId,
    'post_type': postType,
    'caption': caption,
    'hashtags': hashtags,
    'scheduled_at': scheduledAt.toUtc().toIso8601String(),
    'status': status,
    'captions_enabled': captionsEnabled,
    'contains_altered_content': containsAlteredContent,
    if (metadata != null) 'metadata': metadata,
  };
}

/// A row the client read back.
class PostRow {
  const PostRow({
    required this.id,
    required this.platform,
    required this.status,
    this.publishedAt,
  });

  final String id;
  final String platform;
  final PostStatus status;
  final DateTime? publishedAt;
}

/// What kind of failure a call to the posts function hit.
///
/// Only [connection] means the machine is offline: a timeout and an error
/// answer both say the server was reached (SPEC-offline "What the app knows
/// about the connection"). [rejected] says the server was reached and did not
/// take the session, so the app has to ask for a new one.
enum PostsErrorKind { connection, timeout, server, rejected }

/// A failure of the posts function.
class PostsException implements Exception {
  const PostsException(this.message, {this.kind = PostsErrorKind.server});

  final String message;
  final PostsErrorKind kind;

  @override
  String toString() => 'PostsException: $message';
}

/// A v4 UUID for a row the client is about to write.
String newPostId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

/// Reads and writes the posts table.
abstract class PostsRepository {
  /// Writes the row and returns its id.
  Future<String> insert(PostDraft draft);

  /// Reads a row back, or null when it is gone.
  Future<PostRow?> read(String postId);

  /// Moves a failed row back into the queue.
  ///
  /// Returns false when the row is no longer failed, so a retry never fires
  /// twice.
  Future<bool> rescheduleFailed(String postId, DateTime scheduledAt);
}

/// Carries one call to the posts function.
abstract class PostsTransport {
  /// Sends [body] and returns the rows the function answered with.
  Future<List<Map<String, Object?>>> send({
    required Map<String, Object?> body,
    String? token,
  });
}

/// Talks to the `posts-api` function with the license session.
class PostsApiRepository implements PostsRepository {
  PostsApiRepository({required this.sessionToken, required this.transport});

  /// The session token the activation minted. The function reads the owner
  /// from it, so the rows are always the session's own.
  final String? sessionToken;

  final PostsTransport transport;

  @override
  Future<String> insert(PostDraft draft) async {
    _requireToken('Activate a license to publish.');
    final rows = await transport.send(
      body: {'action': 'insert', 'row': draft.toRow()},
      token: sessionToken,
    );
    if (rows.isEmpty) {
      throw const PostsException('The post could not be prepared.');
    }
    return draft.id;
  }

  @override
  Future<PostRow?> read(String postId) async {
    final token = sessionToken;
    if (token == null || token.isEmpty) return null;
    final rows = await transport.send(
      body: {'action': 'read', 'id': postId},
      token: token,
    );
    if (rows.isEmpty) return null;
    final row = rows.first;
    final status = PostStatus.fromName(row['status']);
    if (status == null) return null;
    final publishedAt = row['published_at'];
    return PostRow(
      id: postId,
      platform: row['platform'] is String ? row['platform'] as String : '',
      status: status,
      publishedAt: publishedAt is String
          ? DateTime.tryParse(publishedAt)
          : null,
    );
  }

  @override
  Future<bool> rescheduleFailed(String postId, DateTime scheduledAt) async {
    final token = sessionToken;
    if (token == null || token.isEmpty) return false;
    // The function moves only a row that is still failed back into the
    // queue, so the retry cannot fire twice.
    final rows = await transport.send(
      body: {
        'action': 'retry',
        'id': postId,
        'scheduledAt': scheduledAt.toUtc().toIso8601String(),
      },
      token: token,
    );
    return rows.isNotEmpty;
  }

  void _requireToken(String message) {
    final token = sessionToken;
    if (token == null || token.isEmpty) {
      throw PostsException(message);
    }
  }
}

/// The real transport: the `posts-api` function over `dart:io`.
class HttpPostsTransport implements PostsTransport {
  HttpPostsTransport({
    required this.supabaseUrl,
    required this.anonKey,
    this.timeout = const Duration(seconds: 30),
  });

  final String supabaseUrl;
  final String anonKey;

  /// How long one call may take.
  ///
  /// The queue is asked again and again while a publish settles, and a call
  /// that never comes back would freeze the screen.
  final Duration timeout;

  Uri get _endpoint => Uri.parse('$supabaseUrl/functions/v1/posts-api');

  @override
  Future<List<Map<String, Object?>>> send({
    required Map<String, Object?> body,
    String? token,
  }) async {
    // A client per call: the table is asked a few times per publish, and a
    // client that is kept open holds a socket for the life of the app.
    final client = HttpClient();
    // One budget for the whole call: the connection, the answer and the
    // body. Two timeouts would make the budget twice as long as it says.
    final clock = Stopwatch()..start();
    Duration left() => timeout - clock.elapsed;
    try {
      final request = await client.openUrl('POST', _endpoint).timeout(left());
      request.headers.set('apikey', anonKey);
      if (token != null) {
        request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      }
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode(body));
      final response = await request.close().timeout(left());
      final text = await response
          .transform(utf8.decoder)
          .join()
          .timeout(left());
      if (response.statusCode == 401 || response.statusCode == 403) {
        throw const PostsException(
          'Your session is no longer accepted. Activate your license.',
          kind: PostsErrorKind.rejected,
        );
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw PostsException(
          'The queue did not accept the call (${response.statusCode}).',
        );
      }
      return _rowsOf(text);
    } on TimeoutException {
      throw const PostsException(
        'The queue did not answer. Try again.',
        kind: PostsErrorKind.timeout,
      );
    } on IOException {
      // The connection was dropped or never opened. Without this the
      // exception would escape the publish and leave the screen stuck on
      // "Publishing..." with nothing to show.
      throw const PostsException(
        'The queue did not answer. Try again.',
        kind: PostsErrorKind.connection,
      );
    } finally {
      client.close(force: true);
    }
  }

  List<Map<String, Object?>> _rowsOf(String body) {
    if (body.isEmpty) return const [];
    Object? decoded;
    try {
      decoded = jsonDecode(body);
    } on FormatException {
      return const [];
    }
    if (decoded is! Map) return const [];
    final rows = decoded['rows'];
    if (rows is! List) return const [];
    return [
      for (final row in rows)
        if (row is Map) Map<String, Object?>.from(row),
    ];
  }
}
