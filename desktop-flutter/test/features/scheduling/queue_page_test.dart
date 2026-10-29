import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/scheduling/data/scheduled_posts_repository.dart';
import 'package:flowpost_desktop/features/scheduling/domain/scheduled_post.dart';
import 'package:flowpost_desktop/features/scheduling/presentation/queue_page.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_scheduled_posts.dart';

Future<void> _pump(
  WidgetTester tester,
  FakeScheduledPostsRepository repository,
) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        scheduledPostsRepositoryProvider.overrideWithValue(repository),
      ],
      child: const MaterialApp(home: QueuePage()),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a row shows the media, the account, the status and the time', (
    tester,
  ) async {
    final repository = FakeScheduledPostsRepository()
      ..pages[0] = ScheduledPostsPage(
        posts: [
          post(
            scheduledAt: DateTime.utc(2026, 10, 29, 14, 30),
            caption: 'A caption',
          ),
        ],
        hasMore: false,
      );

    await _pump(tester, repository);

    expect(find.text('A video'), findsOneWidget);
    expect(find.text('Instagram · FlowPost'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const Key('queue-post-post-1')),
        matching: find.text('Scheduled'),
      ),
      findsOneWidget,
    );
    expect(find.text('A caption'), findsOneWidget);
    final time = tester.widget<Text>(
      find.byKey(const Key('queue-time-post-1')),
    );
    expect(
      time.data,
      matches(
        RegExp(r'^\d{4}-\d{2}-\d{2} \d{2}:\d{2} \(UTC[+-]\d{2}:\d{2}\)$'),
      ),
    );
  });

  testWidgets('a published row says when it went out', (tester) async {
    final repository = FakeScheduledPostsRepository()
      ..pages[0] = ScheduledPostsPage(
        posts: [
          post(
            status: PostStatus.published,
            publishedAt: DateTime.utc(2026, 10, 29, 15, 5),
          ),
        ],
        hasMore: false,
      );

    await _pump(tester, repository);

    expect(
      find.descendant(
        of: find.byKey(const Key('queue-post-post-1')),
        matching: find.text('Published'),
      ),
      findsOneWidget,
    );
    final time = tester.widget<Text>(
      find.byKey(const Key('queue-time-post-1')),
    );
    expect(time.data, startsWith('Published '));
  });

  testWidgets('an empty queue points at the upload screen', (tester) async {
    await _pump(tester, FakeScheduledPostsRepository());

    expect(find.text('No posts yet'), findsOneWidget);
    expect(find.byKey(const Key('queue-upload')), findsOneWidget);
  });

  testWidgets('an empty filter says so without the upload button', (
    tester,
  ) async {
    await _pump(tester, FakeScheduledPostsRepository());

    await tester.tap(find.byKey(const Key('queue-filter-failed')));
    await tester.pumpAndSettle();

    expect(find.text('No failed posts'), findsOneWidget);
    expect(find.byKey(const Key('queue-upload')), findsNothing);
  });

  testWidgets('a queue that cannot be read shows the reason and a way back', (
    tester,
  ) async {
    final repository = FakeScheduledPostsRepository()
      ..error = const PostsException('The queue did not answer. Try again.');

    await _pump(tester, repository);

    expect(find.text('The queue did not answer. Try again.'), findsOneWidget);

    repository.error = null;
    await tester.tap(find.byKey(const Key('queue-retry')));
    await tester.pumpAndSettle();

    expect(find.text('No posts yet'), findsOneWidget);
    expect(repository.calls, hasLength(2));
  });

  testWidgets('a status filter reads the queue again with that status', (
    tester,
  ) async {
    final repository = FakeScheduledPostsRepository();
    await _pump(tester, repository);

    await tester.tap(find.byKey(const Key('queue-filter-published')));
    await tester.pumpAndSettle();

    expect(repository.calls.last.filter, QueueFilter.published);
  });

  testWidgets('a platform filter reads the queue again with that platform', (
    tester,
  ) async {
    final repository = FakeScheduledPostsRepository();
    await _pump(tester, repository);

    await tester.tap(find.byKey(const Key('queue-platform')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('YouTube').last);
    await tester.pumpAndSettle();

    expect(repository.calls.last.platform, PublishPlatform.youtube);
  });

  testWidgets('load more asks the table for the next page', (tester) async {
    final repository = FakeScheduledPostsRepository()
      ..pages[0] = ScheduledPostsPage(posts: [post()], hasMore: true)
      ..pages[1] = ScheduledPostsPage(
        posts: [post(id: 'post-2')],
        hasMore: false,
      );
    await _pump(tester, repository);

    expect(find.byKey(const Key('queue-load-more')), findsOneWidget);
    await tester.tap(find.byKey(const Key('queue-load-more')));
    await tester.pumpAndSettle();

    expect(repository.calls.last.offset, 1);
    expect(find.byKey(const Key('queue-post-post-2')), findsOneWidget);
    expect(find.byKey(const Key('queue-load-more')), findsNothing);
  });

  testWidgets('a queue with no more pages has no load more', (tester) async {
    final repository = FakeScheduledPostsRepository()
      ..pages[0] = ScheduledPostsPage(posts: [post()], hasMore: false);

    await _pump(tester, repository);

    expect(find.byKey(const Key('queue-load-more')), findsNothing);
  });
}
