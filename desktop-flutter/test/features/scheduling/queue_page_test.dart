import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/core/time/time_zone.dart';
import 'package:flowpost_desktop/features/offline/data/cache_store.dart';
import 'package:flowpost_desktop/features/offline/offline_providers.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/scheduling/data/scheduled_posts_repository.dart';
import 'package:flowpost_desktop/features/scheduling/domain/scheduled_post.dart';
import 'package:flowpost_desktop/features/scheduling/presentation/queue_page.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_posts_cache.dart';
import '../../support/fake_scheduled_posts.dart';
import '../../support/fake_time_zone.dart';

Future<void> _pump(
  WidgetTester tester,
  FakeScheduledPostsRepository repository, {
  TimeZone? zone,
  FakePostsCache? cache,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        scheduledPostsRepositoryProvider.overrideWithValue(repository),
        postsCacheProvider.overrideWithValue(cache ?? FakePostsCache()),
        if (zone != null) timeZoneProvider.overrideWithValue(zone),
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

  group('a row can be opened', () {
    Future<void> open(WidgetTester tester) async {
      await tester.tap(find.byKey(const Key('queue-post-post-1')));
      await tester.pumpAndSettle();
    }

    testWidgets('the details offer to edit and to cancel a scheduled post', (
      tester,
    ) async {
      final repository = FakeScheduledPostsRepository()
        ..pages[0] = ScheduledPostsPage(
          posts: [post(scheduledAt: DateTime(2026, 10, 29, 10))],
          hasMore: false,
        );
      await _pump(tester, repository);
      await open(tester);

      final dialog = find.byType(AlertDialog);
      expect(
        find.descendant(of: dialog, matching: find.text('A caption')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('post-edit')), findsOneWidget);
      expect(find.byKey(const Key('post-cancel')), findsOneWidget);
      expect(find.byKey(const Key('post-delete')), findsNothing);
    });

    testWidgets('a cancel asks first and deletes the row on a yes', (
      tester,
    ) async {
      final repository = FakeScheduledPostsRepository()
        ..pages[0] = ScheduledPostsPage(
          posts: [post(scheduledAt: DateTime(2026, 10, 29, 10))],
          hasMore: false,
        );
      await _pump(tester, repository);
      await open(tester);

      await tester.tap(find.byKey(const Key('post-cancel')));
      await tester.pumpAndSettle();

      expect(
        find.text(
          'Delete the Instagram post for 29 October 2026 at 10:00? '
          'The caption is deleted with it and it cannot be recovered.',
        ),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('confirm-delete')));
      await tester.pumpAndSettle();

      expect(repository.changes.single.id, 'post-1');
      expect(repository.changes.single.edit, isNull);
      expect(repository.changes.single.onlyIf, PostStatus.scheduled);
      expect(find.byType(AlertDialog), findsNothing);
    });

    testWidgets('keeping the post changes nothing', (tester) async {
      final repository = FakeScheduledPostsRepository()
        ..pages[0] = ScheduledPostsPage(
          posts: [post(scheduledAt: DateTime(2026, 10, 29, 10))],
          hasMore: false,
        );
      await _pump(tester, repository);
      await open(tester);

      await tester.tap(find.byKey(const Key('post-cancel')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm-keep')));
      await tester.pumpAndSettle();

      expect(repository.changes, isEmpty);
    });

    testWidgets('a published post can be deleted but not cancelled', (
      tester,
    ) async {
      final repository = FakeScheduledPostsRepository()
        ..pages[0] = ScheduledPostsPage(
          posts: [
            post(
              status: PostStatus.published,
              scheduledAt: DateTime(2026, 10, 29, 10),
              publishedAt: DateTime(2026, 10, 29, 10),
            ),
          ],
          hasMore: false,
        );
      await _pump(tester, repository);
      await open(tester);

      expect(find.byKey(const Key('post-delete')), findsOneWidget);
      expect(find.byKey(const Key('post-cancel')), findsNothing);
      expect(find.byKey(const Key('post-edit')), findsNothing);

      await tester.tap(find.byKey(const Key('post-delete')));
      await tester.pumpAndSettle();

      expect(find.textContaining('that went out on'), findsOneWidget);
    });

    testWidgets('a row that is already gone keeps the dialog and says so', (
      tester,
    ) async {
      final repository = FakeScheduledPostsRepository()
        ..changeSucceeds = false
        ..pages[0] = ScheduledPostsPage(
          posts: [post(scheduledAt: DateTime(2026, 10, 29, 10))],
          hasMore: false,
        );
      await _pump(tester, repository);
      await open(tester);

      await tester.tap(find.byKey(const Key('post-cancel')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm-delete')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('post-error')), findsOneWidget);
      expect(find.byType(AlertDialog), findsOneWidget);
    });

    testWidgets('an edit saves the caption and the typed time', (tester) async {
      final at = DateTime(2026, 10, 30, 10);
      final repository = FakeScheduledPostsRepository()
        ..pages[0] = ScheduledPostsPage(
          posts: [post(scheduledAt: at)],
          hasMore: false,
        );
      await _pump(tester, repository);
      await open(tester);

      await tester.tap(find.byKey(const Key('post-edit')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('edit-caption')),
        'New caption',
      );
      await tester.tap(find.byKey(const Key('edit-save')));
      await tester.pumpAndSettle();

      final edit = repository.changes.single.edit!;
      expect(edit.caption, 'New caption');
      expect(edit.scheduledAt, at.toUtc());
      expect(find.byType(AlertDialog), findsNothing);
    });

    testWidgets('an edit also writes the row into the cache', (tester) async {
      final at = DateTime(2026, 10, 30, 10);
      final repository = FakeScheduledPostsRepository()
        ..pages[0] = ScheduledPostsPage(
          posts: [post(scheduledAt: at)],
          hasMore: false,
        );
      final cache = FakePostsCache();
      await _pump(tester, repository, cache: cache);
      await open(tester);

      await tester.tap(find.byKey(const Key('post-edit')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('edit-caption')),
        'New caption',
      );
      await tester.tap(find.byKey(const Key('edit-save')));
      await tester.pumpAndSettle();

      final saved = cache.saved.single;
      expect(saved.id, 'post-1');
      expect(saved.caption, 'New caption');
      expect(saved.scheduledAt, at.toUtc());
      expect(saved.status, PostStatus.scheduled);
    });

    testWidgets('a cancel drops the row from the cache', (tester) async {
      final repository = FakeScheduledPostsRepository()
        ..pages[0] = ScheduledPostsPage(
          posts: [post(scheduledAt: DateTime(2026, 10, 29, 10))],
          hasMore: false,
        );
      final cache = FakePostsCache();
      await _pump(tester, repository, cache: cache);
      await open(tester);

      await tester.tap(find.byKey(const Key('post-cancel')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm-delete')));
      await tester.pumpAndSettle();

      expect(cache.removed, ['post-1']);
    });

    testWidgets('a delete that was already gone leaves the cache alone', (
      tester,
    ) async {
      final repository = FakeScheduledPostsRepository()
        ..changeSucceeds = false
        ..pages[0] = ScheduledPostsPage(
          posts: [post(scheduledAt: DateTime(2026, 10, 29, 10))],
          hasMore: false,
        );
      final cache = FakePostsCache();
      await _pump(tester, repository, cache: cache);
      await open(tester);

      await tester.tap(find.byKey(const Key('post-cancel')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm-delete')));
      await tester.pumpAndSettle();

      expect(cache.removed, isEmpty);
    });

    testWidgets('an edit onto a time the clock skips is refused', (
      tester,
    ) async {
      final repository = FakeScheduledPostsRepository()
        ..pages[0] = ScheduledPostsPage(
          posts: [post(scheduledAt: DateTime(2026, 10, 30, 10))],
          hasMore: false,
        );
      await _pump(tester, repository, zone: easternSpringForward());
      await open(tester);

      await tester.tap(find.byKey(const Key('post-edit')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('edit-date')), '2026-03-08');
      await tester.enterText(find.byKey(const Key('edit-time')), '02:30');
      await tester.tap(find.byKey(const Key('edit-save')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('edit-error')), findsOneWidget);
      expect(find.textContaining('does not exist'), findsOneWidget);
      expect(repository.changes, isEmpty);
    });

    testWidgets('an edit of a row that moved on is not written', (
      tester,
    ) async {
      final repository = FakeScheduledPostsRepository()
        ..changeSucceeds = false
        ..pages[0] = ScheduledPostsPage(
          posts: [post(scheduledAt: DateTime(2026, 10, 30, 10))],
          hasMore: false,
        );
      await _pump(tester, repository);
      await open(tester);

      await tester.tap(find.byKey(const Key('post-edit')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('edit-save')));
      await tester.pumpAndSettle();

      expect(
        find.text('This post is no longer scheduled, so it was not changed.'),
        findsOneWidget,
      );
    });
  });

  testWidgets('no connection shows the cached rows and when they were read', (
    tester,
  ) async {
    final repository = FakeScheduledPostsRepository()
      ..error = const PostsException(
        'The queue did not answer. Try again.',
        kind: PostsErrorKind.connection,
      );
    final cache = FakePostsCache(
      CachedPosts(
        posts: [post(id: 'cached', videoTitle: 'Old video')],
        readAt: DateTime(2026, 10, 29, 14, 32),
      ),
    );

    await _pump(tester, repository, cache: cache);

    expect(find.byKey(const Key('offline-banner')), findsOneWidget);
    expect(find.textContaining('last read at 14:32'), findsOneWidget);
    expect(find.text('Old video'), findsOneWidget);
  });

  testWidgets('Try again reads the queue again and the banner goes', (
    tester,
  ) async {
    final repository = FakeScheduledPostsRepository()
      ..error = const PostsException(
        'The queue did not answer. Try again.',
        kind: PostsErrorKind.connection,
      );
    await _pump(
      tester,
      repository,
      cache: FakePostsCache(
        CachedPosts(
          posts: [post(id: 'cached', videoTitle: 'Old video')],
          readAt: DateTime(2026, 10, 29, 14, 32),
        ),
      ),
    );
    repository.error = null;
    repository.pages[0] = ScheduledPostsPage(
      posts: [post(id: 'fresh', videoTitle: 'Fresh video')],
      hasMore: false,
    );

    await tester.tap(find.byKey(const Key('offline-retry')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('offline-banner')), findsNothing);
    expect(find.text('Fresh video'), findsOneWidget);
  });
}
