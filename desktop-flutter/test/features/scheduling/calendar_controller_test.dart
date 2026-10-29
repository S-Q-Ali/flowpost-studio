import 'package:flowpost_desktop/features/offline/connectivity.dart';
import 'package:flowpost_desktop/features/offline/data/cache_store.dart';
import 'package:flowpost_desktop/features/offline/offline_providers.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/scheduling/domain/calendar_range.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_controller.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_posts_cache.dart';
import '../../support/fake_scheduled_posts.dart';

ProviderContainer _container(
  FakeScheduledPostsRepository repository, {
  DateTime? today,
  FakePostsCache? cache,
}) {
  final container = ProviderContainer(
    overrides: [
      scheduledPostsRepositoryProvider.overrideWithValue(repository),
      postsCacheProvider.overrideWithValue(cache ?? FakePostsCache()),
      todayProvider.overrideWithValue(today ?? DateTime(2026, 10, 29)),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  test('the calendar opens on the month the app is standing on', () async {
    final repository = FakeScheduledPostsRepository();
    final container = _container(repository);

    await container.read(calendarControllerProvider.future);

    final call = repository.rangeCalls.single;
    expect(call.from, DateTime(2026, 10, 1));
    expect(call.to, DateTime(2026, 11, 1));
  });

  test('the rows of the month are shown', () async {
    final repository = FakeScheduledPostsRepository()
      ..rangePosts = [post(id: 'p1'), post(id: 'p2')];
    final container = _container(repository);

    final data = await container.read(calendarControllerProvider.future);

    expect(data.posts.map((post) => post.id), ['p1', 'p2']);
    expect(data.savedAt, isNull);
  });

  test('the week view reads the seven days it shows', () async {
    final repository = FakeScheduledPostsRepository();
    final container = _container(repository);
    await container.read(calendarControllerProvider.future);

    container.read(calendarViewProvider.notifier).select(CalendarView.week);
    await container.read(calendarControllerProvider.future);

    final call = repository.rangeCalls.last;
    expect(call.from, DateTime(2026, 10, 25));
    expect(call.to, DateTime(2026, 11, 1));
  });

  test('the next arrow moves a month at a time in the month view', () async {
    final repository = FakeScheduledPostsRepository();
    final container = _container(repository);
    await container.read(calendarControllerProvider.future);

    container.read(calendarAnchorProvider.notifier).step(1);
    await container.read(calendarControllerProvider.future);

    final call = repository.rangeCalls.last;
    expect(call.from, DateTime(2026, 11, 1));
    expect(call.to, DateTime(2026, 12, 1));
  });

  test('the next arrow moves a week at a time in the week view', () async {
    final repository = FakeScheduledPostsRepository();
    final container = _container(repository);
    container.read(calendarViewProvider.notifier).select(CalendarView.week);
    await container.read(calendarControllerProvider.future);

    container.read(calendarAnchorProvider.notifier).step(1);
    await container.read(calendarControllerProvider.future);

    final call = repository.rangeCalls.last;
    expect(call.from, DateTime(2026, 11, 1));
    expect(call.to, DateTime(2026, 11, 8));
  });

  test(
    'the list moves the anchor a month at a time, as the grid does',
    () async {
      final repository = FakeScheduledPostsRepository();
      final container = _container(repository);
      container.read(calendarViewProvider.notifier).select(CalendarView.list);
      await container.read(calendarControllerProvider.future);

      container.read(calendarAnchorProvider.notifier).step(-1);
      await container.read(calendarControllerProvider.future);

      expect(repository.rangeCalls.last.from, DateTime(2026, 9, 1));
    },
  );

  test('a calendar that cannot be read shows the reason once', () async {
    final repository = FakeScheduledPostsRepository()
      ..error = const PostsException('The calendar did not answer.');
    final container = _container(repository);

    container.read(calendarControllerProvider);
    await pumpEventQueue();

    final state = container.read(calendarControllerProvider);
    expect(state.hasError, isTrue);
    expect(
      (state.error! as PostsException).message,
      'The calendar did not answer.',
    );
    // Riverpod would retry on its own and hide the reason behind a spinner.
    expect(repository.rangeCalls, hasLength(1));
  });

  test('a month that reads is written to the cache', () async {
    final repository = FakeScheduledPostsRepository()
      ..rangePosts = [post(id: 'p1')];
    final cache = FakePostsCache();
    final container = _container(repository, cache: cache);

    await container.read(calendarControllerProvider.future);

    expect(cache.merges, hasLength(1));
    expect(cache.merges.single.posts.map((row) => row.id), ['p1']);
  });

  test('no connection shows the cached rows of the visible month', () async {
    final readAt = DateTime.utc(2026, 10, 29, 14, 32);
    final repository = FakeScheduledPostsRepository()
      ..error = const PostsException(
        'The calendar did not answer. Try again.',
        kind: PostsErrorKind.connection,
      );
    final cache = FakePostsCache(
      CachedPosts(
        posts: [
          post(id: 'october', scheduledAt: DateTime.utc(2026, 10, 15, 9)),
          post(id: 'september', scheduledAt: DateTime.utc(2026, 9, 15, 9)),
          // A row with no time cannot be placed on a day.
          post(id: 'no-time', noTime: true),
        ],
        readAt: readAt,
      ),
    );
    final container = _container(repository, cache: cache);

    final data = await container.read(calendarControllerProvider.future);

    expect(data.posts.map((row) => row.id), ['october']);
    expect(data.savedAt, readAt);
  });

  test('a timeout is not offline, so the reason stays on the screen', () async {
    final repository = FakeScheduledPostsRepository()
      ..error = const PostsException(
        'The calendar did not answer. Try again.',
        kind: PostsErrorKind.timeout,
      );
    final container = _container(
      repository,
      cache: FakePostsCache(
        CachedPosts(
          posts: [post(id: 'cached')],
          readAt: DateTime.utc(2026, 10, 29, 14, 32),
        ),
      ),
    );

    container.read(calendarControllerProvider);
    await pumpEventQueue();

    expect(container.read(calendarControllerProvider).hasError, isTrue);
  });

  test('the calendar reads again when the connection comes back', () async {
    final repository = FakeScheduledPostsRepository()
      ..error = const PostsException(
        'The calendar did not answer. Try again.',
        kind: PostsErrorKind.connection,
      );
    final container = _container(
      repository,
      cache: FakePostsCache(
        CachedPosts(
          posts: [post(id: 'cached')],
          readAt: DateTime.utc(2026, 10, 29, 14, 32),
        ),
      ),
    );
    // The calendar screen watches the provider, which keeps its listener
    // alive.
    addTearDown(container.listen(calendarControllerProvider, (_, _) {}).close);
    await container.read(calendarControllerProvider.future);
    repository.error = null;
    repository.rangePosts = [post(id: 'fresh')];

    // The call that failed is what put the app offline.
    container.read(connectivityProvider.notifier).lost();
    await pumpEventQueue();
    container.read(connectivityProvider.notifier).reached();
    await pumpEventQueue();

    final data = container.read(calendarControllerProvider).value!;
    expect(data.posts.map((row) => row.id), ['fresh']);
    expect(data.savedAt, isNull);
  });
}
