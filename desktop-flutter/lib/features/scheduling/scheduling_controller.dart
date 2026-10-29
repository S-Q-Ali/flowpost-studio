import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../offline/connectivity.dart';
import '../offline/data/cache_store.dart';
import '../offline/offline_providers.dart';
import '../publishing/data/posts_repository.dart';
import '../publishing/domain/publish_target.dart';
import 'data/scheduled_posts_repository.dart';
import 'domain/calendar_range.dart';
import 'domain/scheduled_post.dart';
import 'scheduling_providers.dart';

/// The day the app treats as today.
///
/// The calendar opens on it, and a test stands on a known day by overriding
/// it rather than by waiting for the real one.
final todayProvider = Provider<DateTime>((ref) => dateOnly(DateTime.now()));

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
    this.savedAt,
  });

  final List<ScheduledPost> posts;

  /// True when there is another page to ask for.
  final bool hasMore;

  /// A page is being fetched. The rows already shown stay on the screen.
  final bool loadingMore;

  /// Why the last page could not be read. The rows already shown stay.
  final String? loadMoreError;

  /// When the rows were read from the server, for rows that came from the
  /// cache. Null while the rows are the server's own answer.
  final DateTime? savedAt;

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
      savedAt: savedAt,
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
    // A read that failed left the cache on the screen. When a later call
    // reaches the server again, the queue asks it again by itself.
    ref.listen(connectivityProvider, (previous, next) {
      if (previous == ConnectionStatus.offline &&
          next == ConnectionStatus.online &&
          !state.isLoading &&
          state.value?.savedAt != null) {
        ref.invalidateSelf();
      }
    });
    final filter = ref.watch(queueFilterProvider);
    final platform = ref.watch(queuePlatformProvider);
    final ScheduledPostsPage page;
    try {
      page = await ref
          .read(scheduledPostsRepositoryProvider)
          .load(filter: filter, platform: platform, limit: pageSize);
    } on PostsException catch (error) {
      final cached = await _cached(error, filter, platform);
      if (cached != null) return cached;
      rethrow;
    }
    await ref
        .read(postsCacheProvider)
        .merge(page.posts, readAt: DateTime.now());
    return QueueData(posts: page.posts, hasMore: page.hasMore);
  }

  /// The cached rows, when the connection is why the read failed.
  ///
  /// A timeout and an error answer are not offline, so they keep the reason
  /// on the screen instead of a possibly old list (SPEC-offline Decision 2).
  Future<QueueData?> _cached(
    PostsException error,
    QueueFilter filter,
    PublishPlatform? platform,
  ) async {
    if (error.kind != PostsErrorKind.connection) return null;
    final CachedPosts? cached;
    try {
      cached = await ref.read(postsCacheProvider).load();
    } on Object {
      return null;
    }
    if (cached == null) return null;
    return QueueData(
      posts: [
        for (final post in cached.posts)
          if ((filter.status == null || post.status == filter.status) &&
              (platform == null || post.platform == platform))
            post,
      ],
      // The cache holds one list, not the pages the server has.
      hasMore: false,
      savedAt: cached.readAt,
    );
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
    // The page belongs in the cache too, or a restart shows only the first
    // page of a list the admin had already scrolled through.
    await ref
        .read(postsCacheProvider)
        .merge(page.posts, readAt: DateTime.now());
    state = AsyncData(
      QueueData(
        posts: [...current.posts, ...page.posts],
        hasMore: page.hasMore,
      ),
    );
  }
}

/// The view the calendar is showing.
final calendarViewProvider =
    NotifierProvider<CalendarViewController, CalendarView>(
      CalendarViewController.new,
    );

class CalendarViewController extends Notifier<CalendarView> {
  @override
  CalendarView build() => CalendarView.month;

  void select(CalendarView view) => state = view;
}

/// The day the visible month or week is taken from.
final calendarAnchorProvider =
    NotifierProvider<CalendarAnchorController, DateTime>(
      CalendarAnchorController.new,
    );

class CalendarAnchorController extends Notifier<DateTime> {
  @override
  DateTime build() => dateOnly(ref.read(todayProvider));

  /// Moves [steps] views forward (or back): a month, or a week.
  void step(int steps) {
    state = stepAnchor(ref.read(calendarViewProvider), state, steps);
  }
}

/// One read of the calendar, as the screen shows it.
class CalendarData {
  const CalendarData({required this.posts, this.savedAt});

  final List<ScheduledPost> posts;

  /// When the rows were read from the server, for rows that came from the
  /// cache. Null while the rows are the server's own answer.
  final DateTime? savedAt;
}

final calendarControllerProvider =
    AsyncNotifierProvider<CalendarController, CalendarData>(
      CalendarController.new,
      // Same reason as the queue: the screen shows the reason and a Try again
      // button, not a skeleton that never ends.
      retry: (retryCount, error) => null,
    );

/// Reads the rows of the month or week the calendar is showing.
class CalendarController extends AsyncNotifier<CalendarData> {
  @override
  Future<CalendarData> build() async {
    // Same rule as the queue: a read that comes back refills the screen the
    // cache is holding.
    ref.listen(connectivityProvider, (previous, next) {
      if (previous == ConnectionStatus.offline &&
          next == ConnectionStatus.online &&
          !state.isLoading &&
          state.value?.savedAt != null) {
        ref.invalidateSelf();
      }
    });
    final view = ref.watch(calendarViewProvider);
    final anchor = ref.watch(calendarAnchorProvider);
    final range = calendarRange(view, anchor);
    final List<ScheduledPost> posts;
    try {
      posts = await ref
          .read(scheduledPostsRepositoryProvider)
          .loadBetween(range.start, range.end);
    } on PostsException catch (error) {
      final cached = await _cached(error, range);
      if (cached != null) return cached;
      rethrow;
    }
    await ref.read(postsCacheProvider).merge(posts, readAt: DateTime.now());
    return CalendarData(posts: posts);
  }

  /// The cached rows of the visible range, when the connection is why the
  /// read failed.
  Future<CalendarData?> _cached(
    PostsException error,
    CalendarRange range,
  ) async {
    if (error.kind != PostsErrorKind.connection) return null;
    final CachedPosts? cached;
    try {
      cached = await ref.read(postsCacheProvider).load();
    } on Object {
      return null;
    }
    if (cached == null) return null;
    return CalendarData(
      posts: [
        for (final post in cached.posts)
          if (post.scheduledAt != null &&
              !post.scheduledAt!.isBefore(range.start) &&
              post.scheduledAt!.isBefore(range.end))
            post,
      ],
      savedAt: cached.readAt,
    );
  }
}
