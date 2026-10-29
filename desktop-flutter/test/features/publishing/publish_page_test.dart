import 'package:flowpost_desktop/app.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/core/time/time_zone.dart';
import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/publishing/data/publish_client.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_errors.dart';
import 'package:flowpost_desktop/features/offline/drafts/compose_draft.dart';
import 'package:flowpost_desktop/features/offline/offline_providers.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_selection.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_validation.dart';
import 'package:flowpost_desktop/features/publishing/publishing_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_drafts.dart';
import '../../support/fake_time_zone.dart';

const _config = AppConfig(
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-anon',
  updateManifestUrl: '',
);

const _instagram = PublishTarget(
  platform: PublishPlatform.instagram,
  accountId: 'ig-1',
  accountName: 'FlowPost Reels',
);

const _youtube = PublishTarget(
  platform: PublishPlatform.youtube,
  accountId: 'yt-1',
  accountName: 'FlowPost Channel',
);

/// A queue that answers from memory.
class _FakeRepository implements PostsRepository {
  /// The rows the client wrote.
  final List<PostDraft> drafts = [];

  /// The row the client reads back.
  PostRow? row;

  /// Whether the compare-and-set of a retry moves the row.
  bool movesOnRetry = true;

  /// The rows a retry tried to move.
  final List<String> rescheduled = [];

  @override
  Future<String> insert(PostDraft draft) async {
    drafts.add(draft);
    return 'post-1';
  }

  @override
  Future<PostRow?> read(String postId) async => row;

  @override
  Future<bool> rescheduleFailed(String postId, DateTime scheduledAt) async {
    rescheduled.add(postId);
    return movesOnRetry;
  }
}

/// A publisher that answers from memory.
class _FakeClient implements PublishApi {
  PublishResult result = const PublishResult(platformId: 'ig-99');
  PublishException? failure;

  /// The rows the client sent out.
  final List<String> postIds = [];

  @override
  Future<PublishResult> publish({
    required PublishTarget target,
    required String postId,
  }) async {
    final failure = this.failure;
    if (failure != null) throw failure;
    postIds.add(postId);
    return result;
  }
}

/// A date and a time far enough ahead that the form accepts them.
({String date, String time}) _later() {
  final when = DateTime.now().add(const Duration(days: 2));
  final date =
      '${when.year.toString().padLeft(4, '0')}-'
      '${when.month.toString().padLeft(2, '0')}-'
      '${when.day.toString().padLeft(2, '0')}';
  final time =
      '${when.hour.toString().padLeft(2, '0')}:'
      '${when.minute.toString().padLeft(2, '0')}';
  return (date: date, time: time);
}

Future<void> _pump(
  WidgetTester tester, {
  List<PublishTarget> targets = const [_instagram],
  bool signedIn = true,
  bool withMedia = true,
  Size size = const Size(1280, 800),
  _FakeClient? client,
  _FakeRepository? repository,
  FakeDraftsRepository? drafts,
  TimeZone zone = const SystemTimeZone(),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        appConfigProvider.overrideWithValue(_config),
        publishTargetsProvider.overrideWithValue(targets),
        publishedMediaProvider.overrideWithValue(
          withMedia
              ? const PublishedMedia(
                  videoId: 'video-1',
                  fileName: 'clip.mp4',
                  size: 2 * 1024 * 1024,
                  kind: MediaKind.video,
                )
              : null,
        ),
        if (signedIn) ...[
          sessionTokenProvider.overrideWithValue('session-token'),
          authAccessTokenProvider.overrideWithValue('auth-token'),
        ],
        postsRepositoryProvider.overrideWithValue(
          repository ?? _FakeRepository(),
        ),
        publishClientProvider.overrideWithValue(client ?? _FakeClient()),
        publishPollPolicyProvider.overrideWithValue(
          const PublishPollPolicy(interval: Duration.zero, attempts: 1),
        ),
        draftsRepositoryProvider.overrideWithValue(
          drafts ?? FakeDraftsRepository(),
        ),
        timeZoneProvider.overrideWithValue(zone),
      ],
      child: const FlowPostApp(initialDeepLink: '/publish'),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('shows the media and the accounts to publish to', (tester) async {
    await _pump(tester);

    expect(find.text('clip.mp4'), findsOneWidget);
    expect(find.text('Instagram'), findsOneWidget);
    expect(find.text('FlowPost Reels'), findsOneWidget);
    expect(find.text('Publish now'), findsOneWidget);
  });

  testWidgets('without a file it asks for an upload', (tester) async {
    await _pump(tester, withMedia: false);

    expect(find.textContaining('Upload a file first'), findsOneWidget);
  });

  testWidgets('the publish action is off without a sign-in', (tester) async {
    await _pump(tester, signedIn: false);

    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Publish now'),
    );
    expect(button.onPressed, isNull);
    expect(find.textContaining('Sign in required'), findsOneWidget);
  });

  testWidgets('picking a platform shows its caption field', (tester) async {
    await _pump(tester);

    await tester.tap(find.byKey(const Key('target-instagram:ig-1:feed')));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('caption-instagram:ig-1:feed')),
      findsOneWidget,
    );
    expect(find.text('0 / 2200'), findsOneWidget);
  });

  testWidgets('a caption over the limit is refused with the limit named', (
    tester,
  ) async {
    await _pump(tester);
    await tester.tap(find.byKey(const Key('target-instagram:ig-1:feed')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('caption-instagram:ig-1:feed')),
      'x' * 2201,
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('2200'), findsWidgets);
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Publish now'),
    );
    expect(button.onPressed, isNull);
  });

  testWidgets('a caption over the limit is shown once, under its field', (
    tester,
  ) async {
    await _pump(tester);
    await tester.tap(find.byKey(const Key('target-instagram:ig-1:feed')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('caption-instagram:ig-1:feed')),
      'x' * 2201,
    );
    await tester.pumpAndSettle();

    expect(
      find.text('The Instagram caption is 2201 characters. The limit is 2200.'),
      findsOneWidget,
    );
  });

  testWidgets('a YouTube post asks for a title', (tester) async {
    await _pump(tester, targets: const [_youtube]);

    await tester.tap(find.byKey(const Key('target-youtube:yt-1:feed')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('youtube-title')), findsOneWidget);
    expect(find.text('A YouTube title is required.'), findsOneWidget);
  });

  testWidgets('the publish runs and the platform answers', (tester) async {
    await _pump(tester);
    await tester.tap(find.byKey(const Key('target-instagram:ig-1:feed')));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Publish now'));
    await tester.pumpAndSettle();

    expect(find.text('Instagram: Published'), findsOneWidget);
    expect(find.text('Platform id: ig-99'), findsOneWidget);
  });

  testWidgets('a failure shows the sentence of the service', (tester) async {
    final client = _FakeClient()
      ..failure = const PublishException(
        PublishFailure(PublishErrorCode.platformRejected, 'Instagram said no.'),
      );
    await _pump(tester, client: client);
    await tester.tap(find.byKey(const Key('target-instagram:ig-1:feed')));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Publish now'));
    await tester.pumpAndSettle();

    expect(find.text('Instagram: Failed'), findsOneWidget);
    expect(find.text('Instagram said no.'), findsOneWidget);
  });

  testWidgets('a publish that never came back is not confirmed', (
    tester,
  ) async {
    final client = _FakeClient()
      ..failure = const PublishException(publishTimeoutFailure);
    await _pump(tester, client: client);
    await tester.tap(find.byKey(const Key('target-instagram:ig-1:feed')));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Publish now'));
    await tester.pumpAndSettle();

    expect(find.text('Instagram: Not confirmed'), findsOneWidget);
    expect(find.textContaining('The publish timed out'), findsOneWidget);
  });

  testWidgets('the schedule shows the instant that is stored', (tester) async {
    await _pump(tester);
    await tester.tap(find.byKey(const Key('target-instagram:ig-1:feed')));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Later'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('schedule-date')), findsOneWidget);
    expect(find.byKey(const Key('schedule-time')), findsOneWidget);
    expect(find.textContaining('Stored as'), findsOneWidget);
  });

  testWidgets('a time the clock skips is refused under the field', (
    tester,
  ) async {
    await _pump(tester, zone: easternSpringForward());
    await tester.tap(find.byKey(const Key('target-instagram:ig-1:feed')));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Later'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('schedule-date')),
      '2026-03-08',
    );
    await tester.enterText(find.byKey(const Key('schedule-time')), '02:30');
    await tester.pumpAndSettle();

    expect(
      find.textContaining('That time does not exist today'),
      findsOneWidget,
    );
    expect(find.textContaining('01:59'), findsOneWidget);
    expect(find.textContaining('03:00'), findsOneWidget);
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Schedule'),
    );
    expect(button.onPressed, isNull);
  });

  testWidgets('a time that happens twice says the first one is used', (
    tester,
  ) async {
    await _pump(tester, zone: easternFallBack());
    await tester.tap(find.byKey(const Key('target-instagram:ig-1:feed')));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Later'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('schedule-date')),
      '2026-11-01',
    );
    await tester.enterText(find.byKey(const Key('schedule-time')), '01:30');
    await tester.pumpAndSettle();

    expect(find.textContaining('happens twice'), findsOneWidget);
    expect(find.textContaining('UTC-04:00'), findsOneWidget);
  });

  testWidgets(
    'a scheduled post is queued and the screen says when it goes out',
    (tester) async {
      final repository = _FakeRepository();
      final client = _FakeClient();
      await _pump(tester, client: client, repository: repository);
      await tester.tap(find.byKey(const Key('target-instagram:ig-1:feed')));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Later'));
      await tester.pumpAndSettle();
      final when = _later();
      await tester.enterText(find.byKey(const Key('schedule-date')), when.date);
      await tester.enterText(find.byKey(const Key('schedule-time')), when.time);
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(FilledButton, 'Schedule'));
      await tester.pumpAndSettle();

      expect(find.text('Instagram: Scheduled'), findsOneWidget);
      expect(find.textContaining('Goes out at'), findsOneWidget);
      expect(repository.drafts.single.status, 'scheduled');
      // The scheduler publishes it, so the client sends nothing itself.
      expect(client.postIds, isEmpty);
    },
  );

  testWidgets('a failure offers a retry that is ready', (tester) async {
    final client = _FakeClient()
      ..failure = const PublishException(
        PublishFailure(PublishErrorCode.platformRejected, 'Instagram said no.'),
      );
    final repository = _FakeRepository()
      ..row = const PostRow(
        id: 'post-1',
        platform: 'instagram',
        status: PostStatus.failed,
      );
    await _pump(tester, client: client, repository: repository);
    await tester.tap(find.byKey(const Key('target-instagram:ig-1:feed')));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Publish now'));
    await tester.pumpAndSettle();

    expect(find.text('Instagram: Failed'), findsOneWidget);
    final button = tester.widget<TextButton>(
      find.byKey(const Key('retry-instagram:ig-1:feed')),
    );
    expect(button.onPressed, isNotNull);
  });

  testWidgets('the retry puts the row back into the queue', (tester) async {
    final client = _FakeClient()
      ..failure = const PublishException(
        PublishFailure(PublishErrorCode.platformRejected, 'Instagram said no.'),
      );
    final repository = _FakeRepository()
      ..row = const PostRow(
        id: 'post-1',
        platform: 'instagram',
        status: PostStatus.failed,
      );
    await _pump(tester, client: client, repository: repository);
    await tester.tap(find.byKey(const Key('target-instagram:ig-1:feed')));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Publish now'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('retry-instagram:ig-1:feed')));
    await tester.pumpAndSettle();

    expect(repository.rescheduled, ['post-1']);
    expect(find.text('Instagram: Scheduled'), findsOneWidget);
    expect(find.text('It goes out in a minute.'), findsOneWidget);
  });

  testWidgets('a retry waits for the row before it is offered', (tester) async {
    final client = _FakeClient()
      ..failure = const PublishException(
        PublishFailure(PublishErrorCode.platformRejected, 'Instagram said no.'),
      );
    await _pump(tester, client: client);
    await tester.tap(find.byKey(const Key('target-instagram:ig-1:feed')));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Publish now'));
    await tester.pumpAndSettle();

    final button = tester.widget<TextButton>(
      find.byKey(const Key('retry-instagram:ig-1:feed')),
    );
    expect(button.onPressed, isNull);
    expect(find.textContaining('asked again before a retry'), findsOneWidget);
  });

  testWidgets('grows with large text at the minimum window size', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 1.6;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    await _pump(tester, size: const Size(1024, 640));
    await tester.tap(find.byKey(const Key('target-instagram:ig-1:feed')));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Instagram'), findsOneWidget);
  });

  group('a draft', () {
    ComposeDraft saved({
      PublishMode mode = PublishMode.now,
      String scheduleDate = '',
      String scheduleTime = '',
      DateTime? resolvedAt,
    }) {
      return ComposeDraft(
        videoId: 'video-1',
        savedAt: DateTime(2026, 10, 29, 14, 32),
        targetIds: const {'instagram:ig-1:feed'},
        captions: const {'instagram:ig-1:feed': 'Saved caption'},
        mode: mode,
        scheduleDate: scheduleDate,
        scheduleTime: scheduleTime,
        resolvedAt: resolvedAt,
      );
    }

    testWidgets('comes back when the screen opens for its media', (
      tester,
    ) async {
      final drafts = FakeDraftsRepository({'video-1': saved()});

      await _pump(tester, drafts: drafts);

      expect(find.byKey(const Key('draft-restored')), findsOneWidget);
      expect(find.text('Restored from 14:32'), findsOneWidget);
      expect(find.text('Saved caption'), findsOneWidget);
      expect(
        find.byKey(const Key('caption-instagram:ig-1:feed')),
        findsOneWidget,
      );
    });

    testWidgets('is written 800 ms after the last change, not on every key', (
      tester,
    ) async {
      final drafts = FakeDraftsRepository();
      await _pump(tester, drafts: drafts);

      await tester.tap(find.byKey(const Key('target-instagram:ig-1:feed')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(drafts.saves, 0);

      await tester.pump(const Duration(milliseconds: 500));
      expect(drafts.saves, 1);
      expect(drafts.drafts['video-1']!.targetIds, {'instagram:ig-1:feed'});
    });

    testWidgets('a second change restarts the wait', (tester) async {
      final drafts = FakeDraftsRepository();
      await _pump(tester, drafts: drafts);
      await tester.tap(find.byKey(const Key('target-instagram:ig-1:feed')));
      await tester.pump();

      await tester.enterText(
        find.byKey(const Key('caption-instagram:ig-1:feed')),
        'a',
      );
      await tester.pump(const Duration(milliseconds: 400));
      await tester.enterText(
        find.byKey(const Key('caption-instagram:ig-1:feed')),
        'ab',
      );
      await tester.pump(const Duration(milliseconds: 400));
      expect(drafts.saves, 0);

      await tester.pump(const Duration(milliseconds: 500));
      expect(drafts.saves, 1);
      expect(drafts.drafts['video-1']!.captions['instagram:ig-1:feed'], 'ab');
    });

    testWidgets('is thrown away by the discard button', (tester) async {
      final drafts = FakeDraftsRepository({'video-1': saved()});
      await _pump(tester, drafts: drafts);

      await tester.tap(find.byKey(const Key('draft-discard')));
      await tester.pumpAndSettle();

      expect(drafts.deleted, ['video-1']);
      expect(drafts.drafts, isEmpty);
      expect(find.byKey(const Key('draft-restored')), findsNothing);
      expect(
        find.byKey(const Key('caption-instagram:ig-1:feed')),
        findsNothing,
      );
    });

    testWidgets('is deleted when every target wrote its row', (tester) async {
      final drafts = FakeDraftsRepository({'video-1': saved()});
      await _pump(tester, drafts: drafts);

      await tester.tap(find.widgetWithText(FilledButton, 'Publish now'));
      await tester.pumpAndSettle();

      expect(drafts.deleted, ['video-1']);
    });

    testWidgets('is kept when a target failed', (tester) async {
      final drafts = FakeDraftsRepository({'video-1': saved()});
      final client = _FakeClient()
        ..failure = const PublishException(
          PublishFailure(
            PublishErrorCode.platformRejected,
            'Instagram said no.',
          ),
        );
      await _pump(tester, drafts: drafts, client: client);

      await tester.tap(find.widgetWithText(FilledButton, 'Publish now'));
      await tester.pumpAndSettle();

      expect(drafts.deleted, isEmpty);
      expect(drafts.drafts, contains('video-1'));
    });

    testWidgets('a time that now means another instant is asked about', (
      tester,
    ) async {
      final typed = DateTime(2026, 11, 2, 14, 30);
      final fields = scheduleFields(typed);
      final savedInstant = typed.toUtc().add(const Duration(hours: 1));
      final drafts = FakeDraftsRepository({
        'video-1': saved(
          mode: PublishMode.schedule,
          scheduleDate: fields.date,
          scheduleTime: fields.time,
          resolvedAt: savedInstant,
        ),
      });

      await _pump(tester, drafts: drafts);

      expect(find.byKey(const Key('draft-time-moved')), findsOneWidget);

      await tester.tap(find.byKey(const Key('draft-use-saved')));
      await tester.pumpAndSettle();

      final moved = scheduleFields(savedInstant.toLocal());
      expect(find.byKey(const Key('draft-time-moved')), findsNothing);
      expect(find.text(moved.date), findsOneWidget);
      expect(find.text(moved.time), findsOneWidget);
    });

    testWidgets('keeping the typed time leaves the fields as they were', (
      tester,
    ) async {
      final typed = DateTime(2026, 11, 2, 14, 30);
      final fields = scheduleFields(typed);
      final drafts = FakeDraftsRepository({
        'video-1': saved(
          mode: PublishMode.schedule,
          scheduleDate: fields.date,
          scheduleTime: fields.time,
          resolvedAt: typed.toUtc().add(const Duration(hours: 1)),
        ),
      });
      await _pump(tester, drafts: drafts);

      await tester.tap(find.byKey(const Key('draft-keep-typed')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('draft-time-moved')), findsNothing);
      expect(find.text(fields.date), findsOneWidget);
      expect(find.text(fields.time), findsOneWidget);
    });

    testWidgets('a typed time the clock no longer has is refused', (
      tester,
    ) async {
      final zone = easternSpringForward();
      final drafts = FakeDraftsRepository({
        'video-1': saved(
          mode: PublishMode.schedule,
          scheduleDate: '2026-03-08',
          scheduleTime: '02:30',
          resolvedAt: DateTime.utc(2026, 3, 8, 7, 30),
        ),
      });

      await _pump(tester, drafts: drafts, zone: zone);

      expect(find.textContaining('does not exist'), findsOneWidget);
      expect(find.byKey(const Key('draft-time-moved')), findsNothing);
      final button = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Schedule'),
      );
      expect(button.onPressed, isNull);
    });
  });
}
