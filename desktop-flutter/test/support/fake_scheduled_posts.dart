import 'dart:async';

import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/scheduling/data/scheduled_posts_repository.dart';
import 'package:flowpost_desktop/features/scheduling/domain/post_edit.dart';
import 'package:flowpost_desktop/features/scheduling/domain/scheduled_post.dart';

/// A repository that answers from memory.
class FakeScheduledPostsRepository implements ScheduledPostsRepository {
  final List<
    ({QueueFilter filter, PublishPlatform? platform, int offset, int limit})
  >
  calls = [];

  /// The answer for the page that starts at an offset.
  final Map<int, ScheduledPostsPage> pages = {};

  /// Every range the calendar asked for, in call order.
  final List<({DateTime from, DateTime to})> rangeCalls = [];

  /// The answer to every calendar read.
  List<ScheduledPost> rangePosts = [];

  /// Every edit and delete, in call order. An edit is null for a delete.
  final List<({String id, PostEdit? edit})> changes = [];

  /// What an edit or a delete answers.
  bool changeSucceeds = true;

  /// Thrown instead of an answer when set.
  Object? error;

  /// When set, a read waits for it, so a test can keep one in flight.
  Completer<void>? gate;

  @override
  Future<ScheduledPostsPage> load({
    QueueFilter filter = QueueFilter.all,
    PublishPlatform? platform,
    int offset = 0,
    int limit = 200,
  }) async {
    calls.add((
      filter: filter,
      platform: platform,
      offset: offset,
      limit: limit,
    ));
    await _maybeWait();
    final error = this.error;
    if (error != null) throw error;
    return pages[offset] ?? const ScheduledPostsPage(posts: [], hasMore: false);
  }

  @override
  Future<List<ScheduledPost>> loadBetween(DateTime from, DateTime to) async {
    rangeCalls.add((from: from, to: to));
    await _maybeWait();
    final error = this.error;
    if (error != null) throw error;
    return rangePosts;
  }

  @override
  Future<bool> updateScheduled(String postId, PostEdit edit) async {
    await _maybeWait();
    final error = this.error;
    if (error != null) throw error;
    changes.add((id: postId, edit: edit));
    return changeSucceeds;
  }

  @override
  Future<bool> delete(String postId) async {
    await _maybeWait();
    final error = this.error;
    if (error != null) throw error;
    changes.add((id: postId, edit: null));
    return changeSucceeds;
  }

  Future<void> _maybeWait() async {
    final gate = this.gate;
    if (gate != null) await gate.future;
  }
}

/// A row for the fakes.
ScheduledPost post({
  String id = 'post-1',
  PostStatus status = PostStatus.scheduled,
  PublishPlatform? platform = PublishPlatform.instagram,
  String? accountName = 'FlowPost',
  String? caption = 'A caption',
  DateTime? scheduledAt,
  DateTime? publishedAt,
  String? videoTitle = 'A video',
}) {
  return ScheduledPost(
    id: id,
    status: status,
    platform: platform,
    accountName: accountName,
    caption: caption,
    scheduledAt: scheduledAt ?? DateTime.utc(2026, 10, 29, 14, 30),
    publishedAt: publishedAt,
    videoTitle: videoTitle,
  );
}
