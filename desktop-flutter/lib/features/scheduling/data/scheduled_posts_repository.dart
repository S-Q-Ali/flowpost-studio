import '../../publishing/data/posts_repository.dart';
import '../../publishing/domain/publish_target.dart';
import '../domain/post_edit.dart';
import '../domain/scheduled_post.dart';

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

  /// Reads every post that goes out in `[from, to)`, without paging.
  ///
  /// The calendar shows one month or one week at a time, so the range is the
  /// bound; [from] and [to] are wall-clock days in the machine's zone.
  Future<List<ScheduledPost>> loadBetween(DateTime from, DateTime to);

  /// Saves an edit to a row that is still `scheduled`.
  ///
  /// Returns false when the row has moved on: the platform may already have
  /// it, so the edit is not written.
  Future<bool> updateScheduled(String postId, PostEdit edit);

  /// Deletes a row. Returns false when it was already gone.
  ///
  /// [onlyIf] is the status the row had when the admin decided to delete it.
  /// A row that moved on since — a scheduled post the publisher has claimed —
  /// is left alone, because the platform may already have it.
  Future<bool> delete(String postId, {PostStatus? onlyIf});
}

/// Reads the queue through the `posts-api` function.
class PostsApiScheduledPostsRepository implements ScheduledPostsRepository {
  PostsApiScheduledPostsRepository({
    required this.sessionToken,
    required this.transport,
  });

  /// The session token the activation minted. The function reads the owner
  /// from it, so every read is scoped to the session's own rows.
  final String? sessionToken;

  final PostsTransport transport;

  @override
  Future<ScheduledPostsPage> load({
    QueueFilter filter = QueueFilter.all,
    PublishPlatform? platform,
    int offset = 0,
    int limit = 200,
  }) async {
    _requireToken('Activate a license to see the queue.');
    // One row past the page is asked for, so "there is more" is known
    // without counting the whole table.
    final rows = await transport.send(
      body: {
        'action': 'list',
        'offset': offset,
        'limit': limit + 1,
        if (filter.status != null) 'status': filter.status!.name,
        if (platform != null) 'platform': platform.name,
      },
      token: sessionToken,
    );
    final page = rows.take(limit).toList();
    final names = await _accountNames([
      for (final row in page) row['account_id'],
    ]);
    return ScheduledPostsPage(
      posts: _shownPosts(page, names),
      hasMore: rows.length > limit,
    );
  }

  @override
  Future<List<ScheduledPost>> loadBetween(DateTime from, DateTime to) async {
    _requireToken('Activate a license to see the calendar.');
    final rows = await transport.send(
      body: {
        'action': 'range',
        'from': from.toUtc().toIso8601String(),
        'to': to.toUtc().toIso8601String(),
      },
      token: sessionToken,
    );
    final names = await _accountNames([
      for (final row in rows) row['account_id'],
    ]);
    return _shownPosts(rows, names);
  }

  @override
  Future<bool> updateScheduled(String postId, PostEdit edit) async {
    _requireToken('Activate a license to change a post.');
    // The function writes only a row that is still scheduled, so a row that
    // moved to processing while the form was open is left alone.
    final rows = await transport.send(
      body: {'action': 'update', 'id': postId, 'patch': edit.toRow()},
      token: sessionToken,
    );
    return rows.isNotEmpty;
  }

  @override
  Future<bool> delete(String postId, {PostStatus? onlyIf}) async {
    _requireToken('Activate a license to delete a post.');
    final rows = await transport.send(
      body: {
        'action': 'delete',
        'id': postId,
        if (onlyIf != null) 'onlyIf': onlyIf.name,
      },
      token: sessionToken,
    );
    return rows.isNotEmpty;
  }

  void _requireToken(String message) {
    final token = sessionToken;
    if (token == null || token.isEmpty) {
      throw PostsException(message);
    }
  }

  /// The rows that can be shown, in the order they came back.
  List<ScheduledPost> _shownPosts(
    List<Map<String, Object?>> rows,
    Map<String, String> names,
  ) {
    final posts = <ScheduledPost>[];
    for (final row in rows) {
      final post = _post(row, names);
      if (post != null) posts.add(post);
    }
    return posts;
  }

  /// The names of the accounts this page names.
  ///
  /// Only the display fields are asked for. The name is a label on the card,
  /// so a failed read leaves it out instead of failing the whole queue.
  Future<Map<String, String>> _accountNames(
    Iterable<Object?> accountIds,
  ) async {
    final ids = <String>{
      for (final id in accountIds)
        if (id is String && id.isNotEmpty) id,
    };
    if (ids.isEmpty) return const {};
    final List<Map<String, Object?>> rows;
    try {
      rows = await transport.send(
        body: {'action': 'accounts', 'ids': ids.toList()},
        token: sessionToken,
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
