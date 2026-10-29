import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../../../core/auth/access_token.dart';

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
  Map<String, Object?> toRow(String userId) => {
    'user_id': userId,
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

/// A failure of the posts table.
class PostsException implements Exception {
  const PostsException(this.message);

  final String message;

  @override
  String toString() => 'PostsException: $message';
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

/// Carries the calls to the posts table.
abstract class PostsTransport {
  /// Sends one request and returns the rows the table answered with.
  Future<List<Map<String, Object?>>> send({
    required String method,
    required Uri url,
    String? body,
    String? token,
  });
}

/// Talks to the table through PostgREST.
class PostgrestPostsRepository implements PostsRepository {
  PostgrestPostsRepository({
    required this.supabaseUrl,
    required this.anonKey,
    required this.token,
    PostsTransport? transport,
  }) : _transport = transport ?? HttpPostsTransport(anonKey: anonKey);

  final String supabaseUrl;
  final String anonKey;

  /// The Supabase Auth token. The rows are written under the identity it
  /// carries, because the table only lets a user write their own rows.
  final String? token;

  final PostsTransport _transport;

  Uri get _rows => Uri.parse('$supabaseUrl/rest/v1/posts');

  @override
  Future<String> insert(PostDraft draft) async {
    final token = this.token;
    if (token == null || token.isEmpty) {
      throw const PostsException('Sign in required to publish.');
    }
    final userId = userIdFromAccessToken(token);
    if (userId == null) {
      throw const PostsException('Sign in again to publish.');
    }
    final rows = await _transport.send(
      method: 'POST',
      url: _rows.replace(queryParameters: {'select': 'id'}),
      body: jsonEncode(draft.toRow(userId)),
      token: token,
    );
    if (rows.isEmpty) {
      throw const PostsException('The post could not be prepared.');
    }
    final id = rows.first['id'];
    if (id is! String || id.isEmpty) {
      throw const PostsException('The post could not be prepared.');
    }
    return id;
  }

  @override
  Future<PostRow?> read(String postId) async {
    final token = this.token;
    if (token == null || token.isEmpty) return null;
    final rows = await _transport.send(
      method: 'GET',
      url: _rows.replace(
        queryParameters: {
          'id': 'eq.$postId',
          'select': 'id,platform,status,published_at',
        },
      ),
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
    final token = this.token;
    if (token == null || token.isEmpty) return false;
    // The status filter is what makes the retry a compare-and-set: only a
    // row that is still failed is moved back into the queue.
    final rows = await _transport.send(
      method: 'PATCH',
      url: _rows.replace(
        queryParameters: {'id': 'eq.$postId', 'status': 'eq.failed'},
      ),
      body: jsonEncode({
        'status': 'scheduled',
        'scheduled_at': scheduledAt.toUtc().toIso8601String(),
      }),
      token: token,
    );
    return rows.isNotEmpty;
  }
}

/// The real transport: PostgREST over `dart:io`.
class HttpPostsTransport implements PostsTransport {
  HttpPostsTransport({
    required this.anonKey,
    this.timeout = const Duration(seconds: 30),
  });

  final String anonKey;

  /// How long one call may take.
  ///
  /// The queue is asked again and again while a publish settles, and a call
  /// that never comes back would freeze the screen.
  final Duration timeout;

  @override
  Future<List<Map<String, Object?>>> send({
    required String method,
    required Uri url,
    String? body,
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
      final request = await client.openUrl(method, url).timeout(left());
      request.headers.set('apikey', anonKey);
      request.headers.set('Prefer', 'return=representation');
      if (token != null) {
        request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      }
      if (body != null) {
        request.headers.contentType = ContentType.json;
        request.write(body);
      }
      final response = await request.close().timeout(left());
      final text = await response
          .transform(utf8.decoder)
          .join()
          .timeout(left());
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw PostsException(
          'The queue did not accept the post (${response.statusCode}).',
        );
      }
      return _rowsOf(text);
    } on TimeoutException {
      throw const PostsException('The queue did not answer. Try again.');
    } on IOException {
      // The connection was dropped or never opened. Without this the
      // exception would escape the publish and leave the screen stuck on
      // "Publishing..." with nothing to show.
      throw const PostsException('The queue did not answer. Try again.');
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
    if (decoded is! List) return const [];
    return [
      for (final row in decoded)
        if (row is Map) Map<String, Object?>.from(row),
    ];
  }
}
