import 'dart:async';

import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/scheduling/data/scheduled_posts_repository.dart';
import 'package:flowpost_desktop/features/scheduling/domain/scheduled_post.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_controller.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_scheduled_posts.dart';

ProviderContainer _container(FakeScheduledPostsRepository repository) {
  final container = ProviderContainer(
    overrides: [scheduledPostsRepositoryProvider.overrideWithValue(repository)],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  test('the queue shows the rows the table answered', () async {
    final repository = FakeScheduledPostsRepository()
      ..pages[0] = ScheduledPostsPage(
        posts: [
          post(),
          post(id: 'p2'),
        ],
        hasMore: false,
      );
    final container = _container(repository);

    final data = await container.read(queueControllerProvider.future);

    expect(data.posts, hasLength(2));
    expect(data.hasMore, isFalse);
  });

  test('the first page is the bounded window, not every row', () async {
    final repository = FakeScheduledPostsRepository();
    final container = _container(repository);

    await container.read(queueControllerProvider.future);

    expect(repository.calls.single.limit, QueueController.pageSize);
    expect(repository.calls.single.offset, 0);
    expect(repository.calls.single.filter, QueueFilter.all);
  });

  test('a filter change reads the queue again with that status', () async {
    final repository = FakeScheduledPostsRepository();
    final container = _container(repository);
    await container.read(queueControllerProvider.future);

    container.read(queueFilterProvider.notifier).select(QueueFilter.published);
    await container.read(queueControllerProvider.future);

    expect(repository.calls.last.filter, QueueFilter.published);
  });

  test('a read that fails says why and can be asked again', () async {
    final repository = FakeScheduledPostsRepository()
      ..error = const PostsException('The queue did not answer. Try again.');
    final container = _container(repository);

    container.read(queueControllerProvider);
    await pumpEventQueue();

    final state = container.read(queueControllerProvider);
    expect(state.hasError, isTrue);
    expect(
      (state.error! as PostsException).message,
      'The queue did not answer. Try again.',
    );
  });

  test('load more adds the next page to the rows already shown', () async {
    final repository = FakeScheduledPostsRepository()
      ..pages[0] = ScheduledPostsPage(posts: [post()], hasMore: true)
      ..pages[1] = ScheduledPostsPage(posts: [post(id: 'p2')], hasMore: false);
    final container = _container(repository);
    await container.read(queueControllerProvider.future);

    await container.read(queueControllerProvider.notifier).loadMore();

    final data = container.read(queueControllerProvider).value!;
    expect(data.posts.map((post) => post.id), ['post-1', 'p2']);
    expect(data.hasMore, isFalse);
    expect(repository.calls.last.offset, 1);
  });

  test('load more stops when the table has no more', () async {
    final repository = FakeScheduledPostsRepository()
      ..pages[0] = ScheduledPostsPage(posts: [post()], hasMore: false);
    final container = _container(repository);
    await container.read(queueControllerProvider.future);

    await container.read(queueControllerProvider.notifier).loadMore();

    expect(repository.calls, hasLength(1));
  });

  test('a second load more while one runs asks nothing', () async {
    final repository = FakeScheduledPostsRepository()
      ..pages[0] = ScheduledPostsPage(posts: [post()], hasMore: true)
      ..pages[1] = ScheduledPostsPage(posts: [post(id: 'p2')], hasMore: true);
    final container = _container(repository);
    await container.read(queueControllerProvider.future);
    repository.gate = Completer<void>();

    final first = container.read(queueControllerProvider.notifier).loadMore();
    await container.read(queueControllerProvider.notifier).loadMore();
    repository.gate!.complete();
    await first;

    expect(repository.calls, hasLength(2));
  });

  test('a page that fails keeps the rows and says why', () async {
    final repository = FakeScheduledPostsRepository()
      ..pages[0] = ScheduledPostsPage(posts: [post()], hasMore: true);
    final container = _container(repository);
    await container.read(queueControllerProvider.future);
    repository.error = const PostsException('The queue did not answer.');

    await container.read(queueControllerProvider.notifier).loadMore();

    final data = container.read(queueControllerProvider).value!;
    expect(data.posts, hasLength(1));
    expect(data.hasMore, isTrue);
    expect(data.loadingMore, isFalse);
    expect(data.loadMoreError, 'The queue did not answer.');
  });

  test('a page from before a filter change is dropped', () async {
    final repository = FakeScheduledPostsRepository()
      ..pages[0] = ScheduledPostsPage(posts: [post()], hasMore: true)
      ..pages[1] = ScheduledPostsPage(posts: [post(id: 'p2')], hasMore: true);
    final container = _container(repository);
    await container.read(queueControllerProvider.future);
    repository.gate = Completer<void>();

    final page = container.read(queueControllerProvider.notifier).loadMore();
    container.read(queueFilterProvider.notifier).select(QueueFilter.failed);
    repository.gate!.complete();
    await page;
    await container.read(queueControllerProvider.future);

    final data = container.read(queueControllerProvider);
    expect(data.value!.posts.map((post) => post.id), ['post-1']);
  });
}
