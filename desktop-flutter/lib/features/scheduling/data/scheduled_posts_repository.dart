import '../../publishing/data/posts_repository.dart';
import '../../publishing/domain/publish_target.dart';
import '../domain/scheduled_post.dart';

/// The fields a read is allowed to ask for.
///
/// The account token fields are never named here, so they are never fetched,
/// let alone cached or logged (SPEC-scheduling "Security and privacy").
const String _postFields =
    'id,platform,account_id,post_type,caption,hashtags,scheduled_at,'
    'published_at,status,contains_altered_content,'
    'videos(title,thumbnail_url)';

/// One page of the queue.
class ScheduledPostsPage {
  const ScheduledPostsPage({required this.posts, required this.hasMore});

  final List<ScheduledPost> posts;

  /// True when the table has another row past this page.
  final bool hasMore;
}

/// Reads the admin's posts, a page at a time.
abstract class ScheduledPostsRepository {
  /// Reads one page, ordered by the time each post goes out.
  ///
  /// [offset] is where the page starts, so the screen can ask for more
  /// without re-reading the rows it already shows. A null [platform] keeps
  /// every platform.
  Future<ScheduledPostsPage> load({
    QueueFilter filter = QueueFilter.all,
    PublishPlatform? platform,
    int offset = 0,
    int limit = 200,
  });
}

/// Reads the queue through PostgREST.
class PostgrestScheduledPostsRepository implements ScheduledPostsRepository {
  PostgrestScheduledPostsRepository({
    required this.supabaseUrl,
    required this.anonKey,
    required this.token,
    PostsTransport? transport,
  }) : _transport = transport ?? HttpPostsTransport(anonKey: anonKey);

  final String supabaseUrl;
  final String anonKey;

  /// The Supabase Auth token. The `posts` policy only lets a user read their
  /// own rows, so the token is what makes the read possible.
  final String? token;

  final PostsTransport _transport;

  Uri get _posts => Uri.parse('$supabaseUrl/rest/v1/posts');
  Uri get _accounts => Uri.parse('$supabaseUrl/rest/v1/connected_accounts');

  @override
  Future<ScheduledPostsPage> load({
    QueueFilter filter = QueueFilter.all,
    PublishPlatform? platform,
    int offset = 0,
    int limit = 200,
  }) async {
    final token = this.token;
    if (token == null || token.isEmpty) {
      throw const PostsException('Sign in required to see the queue.');
    }
    // One row past the page is asked for, so "there is more" is known
    // without counting the whole table, which has no index to count it with.
    final rows = await _transport.send(
      method: 'GET',
      url: _posts.replace(
        queryParameters: {
          'select': _postFields,
          'order': 'scheduled_at.asc.nullslast,created_at.asc',
          'offset': '$offset',
          'limit': '${limit + 1}',
          if (filter.status != null) 'status': 'eq.${filter.status!.name}',
          if (platform != null) 'platform': 'eq.${platform.name}',
        },
      ),
      token: token,
    );
    final page = rows.take(limit).toList();
    final names = await _accountNames([
      for (final row in page) row['account_id'],
    ], token);
    final posts = <ScheduledPost>[];
    for (final row in page) {
      final post = _post(row, names);
      if (post != null) posts.add(post);
    }
    return ScheduledPostsPage(posts: posts, hasMore: rows.length > limit);
  }

  /// The names of the accounts this page names.
  ///
  /// Only the display fields are asked for. The name is a label on the card,
  /// so a failed read leaves it out instead of failing the whole queue.
  Future<Map<String, String>> _accountNames(
    Iterable<Object?> accountIds,
    String token,
  ) async {
    final ids = <String>{
      for (final id in accountIds)
        if (id is String && id.isNotEmpty) id,
    };
    if (ids.isEmpty) return const {};
    final List<Map<String, Object?>> rows;
    try {
      rows = await _transport.send(
        method: 'GET',
        url: _accounts.replace(
          queryParameters: {
            'select': 'account_id,account_name,display_name',
            'account_id': _inList(ids),
          },
        ),
        token: token,
      );
    } on PostsException {
      return const {};
    }
    final names = <String, String>{};
    for (final row in rows) {
      final id = row['account_id'];
      final name = row['display_name'] ?? row['account_name'];
      if (id is String && id.isNotEmpty && name is String && name.isNotEmpty) {
        names[id] = name;
      }
    }
    return names;
  }

  /// The row as the screen's model, or null when the row cannot be shown.
  ScheduledPost? _post(Map<String, Object?> row, Map<String, String> names) {
    final id = row['id'];
    final status = PostStatus.fromName(row['status']);
    if (id is! String || id.isEmpty || status == null) return null;
    final video = row['videos'];
    final media = video is Map
        ? Map<String, Object?>.from(video)
        : const <String, Object?>{};
    final accountId = row['account_id'];
    final postType = row['post_type'];
    return ScheduledPost(
      id: id,
      platform: _platformOf(row['platform']),
      status: status,
      postType: postType is String ? postType : 'feed',
      accountName: accountId is String ? names[accountId] : null,
      caption: _text(row['caption']),
      hashtags: _text(row['hashtags']),
      scheduledAt: _instant(row['scheduled_at']),
      publishedAt: _instant(row['published_at']),
      videoTitle: _text(media['title']),
      thumbnailUrl: _text(media['thumbnail_url']),
      containsAlteredContent: row['contains_altered_content'] == true,
    );
  }
}

/// A PostgREST `in.(...)` list.
///
/// The ids are quoted and escaped, so an id with a comma or a bracket cannot
/// change what the filter asks for.
String _inList(Iterable<String> ids) {
  final quoted = [
    for (final id in ids)
      '"${id.replaceAll(r'\', r'\\').replaceAll('"', r'\"')}"',
  ];
  return 'in.(${quoted.join(',')})';
}

PublishPlatform? _platformOf(Object? name) {
  if (name is! String) return null;
  for (final platform in PublishPlatform.values) {
    if (platform.name == name) return platform;
  }
  return null;
}

DateTime? _instant(Object? value) {
  if (value is! String) return null;
  return DateTime.tryParse(value)?.toUtc();
}

String? _text(Object? value) {
  if (value is! String || value.isEmpty) return null;
  return value;
}
