import 'package:flowpost_desktop/features/offline/data/cache_store.dart';
import 'package:flowpost_desktop/features/offline/offline_providers.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/scheduling/presentation/calendar_page.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_controller.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_posts_cache.dart';
import '../../support/fake_scheduled_posts.dart';

/// The app stands on Thursday 29 October 2026 in these tests.
final DateTime _today = DateTime(2026, 10, 29);

Future<void> _pump(
  WidgetTester tester,
  FakeScheduledPostsRepository repository, {
  FakePostsCache? cache,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        scheduledPostsRepositoryProvider.overrideWithValue(repository),
        postsCacheProvider.overrideWithValue(cache ?? FakePostsCache()),
        todayProvider.overrideWithValue(_today),
      ],
      child: const MaterialApp(home: CalendarPage()),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the month grid shows a post on the day it goes out', (
    tester,
  ) async {
    final repository = FakeScheduledPostsRepository()
      ..rangePosts = [
        post(
          scheduledAt: DateTime(2026, 10, 29, 14, 30),
          videoTitle: 'A video',
        ),
      ];

    await _pump(tester, repository);

    expect(find.text('October 2026'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const Key('calendar-day-2026-10-29')),
        matching: find.byKey(const Key('calendar-post-post-1')),
      ),
      findsOneWidget,
    );
    expect(find.text('14:30'), findsOneWidget);
  });

  testWidgets('a day with four posts shows three and counts the rest', (
    tester,
  ) async {
    final repository = FakeScheduledPostsRepository()
      ..rangePosts = [
        for (var hour = 9; hour < 13; hour++)
          post(id: 'post-$hour', scheduledAt: DateTime(2026, 10, 29, hour)),
      ];

    await _pump(tester, repository);

    final day = find.byKey(const Key('calendar-day-2026-10-29'));
    expect(
      find.descendant(
        of: day,
        matching: find.byKey(const Key('calendar-post-post-12')),
      ),
      findsNothing,
    );
    expect(
      find.descendant(of: day, matching: find.text('+1 more')),
      findsOneWidget,
    );
  });

  testWidgets('the week view shows the seven days of the week', (tester) async {
    final repository = FakeScheduledPostsRepository()
      ..rangePosts = [post(scheduledAt: DateTime(2026, 10, 29, 14, 30))];

    await _pump(tester, repository);
    await tester.tap(find.text('Week'));
    await tester.pumpAndSettle();

    expect(find.text('25–31 October 2026'), findsOneWidget);
    for (final day in [25, 26, 27, 28, 29, 30, 31]) {
      expect(find.byKey(Key('calendar-day-2026-10-$day')), findsOneWidget);
    }
    expect(find.byKey(const Key('calendar-post-post-1')), findsOneWidget);
    expect(repository.rangeCalls.last.from, DateTime(2026, 10, 25));
  });

  testWidgets('the list groups the posts by day and shows them all', (
    tester,
  ) async {
    final repository = FakeScheduledPostsRepository()
      ..rangePosts = [
        post(id: 'post-9', scheduledAt: DateTime(2026, 10, 29, 9)),
        post(id: 'post-10', scheduledAt: DateTime(2026, 10, 29, 10)),
        post(id: 'post-11', scheduledAt: DateTime(2026, 10, 29, 11)),
        post(id: 'post-12', scheduledAt: DateTime(2026, 10, 29, 12)),
        post(id: 'post-30', scheduledAt: DateTime(2026, 10, 30, 9)),
      ];

    await _pump(tester, repository);
    await tester.tap(find.text('List'));
    await tester.pumpAndSettle();

    expect(find.text('Thursday, 29 October 2026'), findsOneWidget);
    expect(find.text('Friday, 30 October 2026'), findsOneWidget);
    for (final id in ['post-9', 'post-10', 'post-11', 'post-12', 'post-30']) {
      expect(find.byKey(Key('calendar-post-$id')), findsOneWidget);
    }
    expect(find.text('+1 more'), findsNothing);
  });

  testWidgets('the arrows move the month and read it again', (tester) async {
    final repository = FakeScheduledPostsRepository();
    await _pump(tester, repository);

    await tester.tap(find.byKey(const Key('calendar-next')));
    await tester.pumpAndSettle();

    expect(find.text('November 2026'), findsOneWidget);
    expect(repository.rangeCalls.last.from, DateTime(2026, 11, 1));

    await tester.tap(find.byKey(const Key('calendar-prev')));
    await tester.pumpAndSettle();

    expect(find.text('October 2026'), findsOneWidget);
    expect(repository.rangeCalls.last.from, DateTime(2026, 10, 1));
  });

  testWidgets('a month with nothing says so', (tester) async {
    await _pump(tester, FakeScheduledPostsRepository());

    expect(find.text('No posts this month'), findsOneWidget);
  });

  testWidgets(
    'a calendar that cannot be read shows the reason and a way back',
    (tester) async {
      final repository = FakeScheduledPostsRepository()
        ..error = const PostsException('The calendar did not answer.');
      await _pump(tester, repository);

      expect(find.text('The calendar did not answer.'), findsOneWidget);

      repository.error = null;
      await tester.tap(find.byKey(const Key('calendar-retry')));
      await tester.pumpAndSettle();

      expect(find.text('No posts this month'), findsOneWidget);
      expect(repository.rangeCalls, hasLength(2));
    },
  );

  testWidgets('a new post opens the upload screen', (tester) async {
    await _pump(tester, FakeScheduledPostsRepository());

    expect(find.byKey(const Key('calendar-new')), findsOneWidget);
  });

  testWidgets('a post on the grid can be opened', (tester) async {
    final repository = FakeScheduledPostsRepository()
      ..rangePosts = [post(scheduledAt: DateTime(2026, 10, 29, 10))];
    await _pump(tester, repository);

    await tester.tap(find.byKey(const Key('calendar-post-post-1')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('post-cancel')), findsOneWidget);
    expect(find.byKey(const Key('post-edit')), findsOneWidget);
  });

  testWidgets('no connection shows the cached rows of the month', (
    tester,
  ) async {
    final repository = FakeScheduledPostsRepository()
      ..error = const PostsException(
        'The calendar did not answer. Try again.',
        kind: PostsErrorKind.connection,
      );
    final cache = FakePostsCache(
      CachedPosts(
        posts: [post(id: 'saved', scheduledAt: DateTime(2026, 10, 15, 9, 15))],
        readAt: DateTime(2026, 10, 29, 14, 32),
      ),
    );

    await _pump(tester, repository, cache: cache);

    expect(find.byKey(const Key('offline-banner')), findsOneWidget);
    expect(find.textContaining('last read at 14:32'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const Key('calendar-day-2026-10-15')),
        matching: find.byKey(const Key('calendar-post-saved')),
      ),
      findsOneWidget,
    );
  });

  testWidgets('grows with large text at the minimum window size', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    tester.view.physicalSize = const Size(1024, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final repository = FakeScheduledPostsRepository()
      ..rangePosts = [
        post(
          scheduledAt: DateTime(2026, 10, 29, 14, 30),
          videoTitle: 'A video',
        ),
      ];

    await _pump(tester, repository);

    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('calendar-post-post-1')), findsOneWidget);
    expect(find.byKey(const Key('calendar-new')), findsOneWidget);
  });
}
