import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/scheduling/domain/calendar_range.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_controller.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_scheduled_posts.dart';

ProviderContainer _container(
  FakeScheduledPostsRepository repository, {
  DateTime? today,
}) {
  final container = ProviderContainer(
    overrides: [
      scheduledPostsRepositoryProvider.overrideWithValue(repository),
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

    final posts = await container.read(calendarControllerProvider.future);

    expect(posts.map((post) => post.id), ['p1', 'p2']);
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
}
