import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../publishing/data/posts_repository.dart';
import '../publishing/domain/publish_target.dart';
import 'data/scheduled_posts_repository.dart';
import 'domain/scheduled_post.dart';
import 'scheduling_providers.dart';

/// The status the queue is filtered by.
final queueFilterProvider =
    NotifierProvider<QueueFilterController, QueueFilter>(
      QueueFilterController.new,
    );

class QueueFilterController extends Notifier<QueueFilter> {
  @override
  QueueFilter build() => QueueFilter.all;

  void select(QueueFilter filter) => state = filter;
}

/// The platform the queue is filtered by. Null keeps every platform.
final queuePlatformProvider =
    NotifierProvider<QueuePlatformController, PublishPlatform?>(
      QueuePlatformController.new,
    );

class QueuePlatformController extends Notifier<PublishPlatform?> {
  @override
  PublishPlatform? build() => null;

  void select(PublishPlatform? platform) => state = platform;
}

/// One read of the queue, as the screen shows it.
class QueueData {
  const QueueData({
    required this.posts,
    required this.hasMore,
    this.loadingMore = false,
    this.loadMoreError,
  });

  final List<ScheduledPost> posts;

  /// True when there is another page to ask for.
  final bool hasMore;

  /// A page is being fetched. The rows already shown stay on the screen.
  final bool loadingMore;

  /// Why the last page could not be read. The rows already shown stay.
  final String? loadMoreError;

  QueueData copyWith({
    List<ScheduledPost>? posts,
    bool? hasMore,
    bool? loadingMore,
  }) {
    return QueueData(
      posts: posts ?? this.posts,
      hasMore: hasMore ?? this.hasMore,
      loadingMore: loadingMore ?? this.loadingMore,
      loadMoreError: loadMoreError,
    );
  }
}

final queueControllerProvider =
    AsyncNotifierProvider<QueueController, QueueData>(
      QueueController.new,
      // Riverpod retries a failed read on its own and shows loading while it
      // does. The queue shows the reason and a Try again button instead, so a
      // read that keeps failing is visible rather than a skeleton forever.
      retry: (retryCount, error) => null,
    );

/// Reads the queue a page at a time.
class QueueController extends AsyncNotifier<QueueData> {
  /// How many rows one page holds (SPEC-scheduling "The queue").
  ///
  /// The table has no index on the columns the queue sorts by, so reading
  /// every row — which the web app does — is a full scan on every open.
  static const int pageSize = 200;

  @override
  Future<QueueData> build() async {
    final filter = ref.watch(queueFilterProvider);
    final platform = ref.watch(queuePlatformProvider);
    final page = await ref
        .read(scheduledPostsRepositoryProvider)
        .load(filter: filter, platform: platform, limit: pageSize);
    return QueueData(posts: page.posts, hasMore: page.hasMore);
  }

  /// Reads one more page and adds it to the list.
  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || current.loadingMore) return;
    final filter = ref.read(queueFilterProvider);
    final platform = ref.read(queuePlatformProvider);
    state = AsyncData(current.copyWith(loadingMore: true));
    final ScheduledPostsPage page;
    try {
      page = await ref
          .read(scheduledPostsRepositoryProvider)
          .load(
            filter: filter,
            platform: platform,
            offset: current.posts.length,
            limit: pageSize,
          );
    } on PostsException catch (error) {
      state = AsyncData(
        QueueData(
          posts: current.posts,
          hasMore: current.hasMore,
          loadMoreError: error.message,
        ),
      );
      return;
    }
    // The filter may have changed while the page was in flight; its rows
    // belong to a different list.
    if (ref.read(queueFilterProvider) != filter ||
        ref.read(queuePlatformProvider) != platform) {
      return;
    }
    state = AsyncData(
      QueueData(
        posts: [...current.posts, ...page.posts],
        hasMore: page.hasMore,
      ),
    );
  }
}
