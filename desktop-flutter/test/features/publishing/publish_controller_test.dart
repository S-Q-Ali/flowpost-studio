import 'dart:async';

import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/publishing/data/publish_client.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_errors.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_selection.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_validation.dart';
import 'package:flowpost_desktop/features/publishing/publishing_controller.dart';
import 'package:flowpost_desktop/features/publishing/publishing_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

const _instagram = PublishTarget(
  platform: PublishPlatform.instagram,
  accountId: 'ig-1',
  accountName: 'FlowPost',
);

const _tiktok = PublishTarget(
  platform: PublishPlatform.tiktok,
  accountId: 'tt-1',
  accountName: 'FlowPost',
);

/// A queue that answers from memory.
class _FakeRepository implements PostsRepository {
  final List<PostDraft> drafts = [];
  Object? failure;

  /// The failure a read answers with.
  Object? readFailure;

  /// The failure a retry answers with.
  Object? retryFailure;

  /// The rows the read answers with, in order. The last one repeats.
  List<PostRow?> answers = [];

  /// The ids the client read back.
  final List<String> reads = [];

  /// Whether the compare-and-set of a retry moves the row.
  bool movesOnRetry = true;

  /// The rows a retry tried to move.
  final List<String> rescheduled = [];

  @override
  Future<String> insert(PostDraft draft) async {
    if (failure != null) throw failure!;
    drafts.add(draft);
    return 'post-${drafts.length}';
  }

  @override
  Future<PostRow?> read(String postId) async {
    reads.add(postId);
    final failure = readFailure;
    if (failure != null) throw failure;
    if (answers.isEmpty) return null;
    final index = reads.length - 1;
    return index < answers.length ? answers[index] : answers.last;
  }

  @override
  Future<bool> rescheduleFailed(String postId, DateTime scheduledAt) async {
    rescheduled.add(postId);
    final failure = retryFailure;
    if (failure != null) throw failure;
    return movesOnRetry;
  }
}

/// A publisher that answers from memory.
class _FakeClient implements PublishApi {
  final List<String> postIds = [];
  final Map<String, PublishException> failures = {};
  PublishResult result = const PublishResult(platformId: 'platform-1');

  /// Holds the call until it is let go.
  Completer<void>? gate;

  @override
  Future<PublishResult> publish({
    required PublishTarget target,
    required String postId,
  }) async {
    final failure = failures[target.id];
    if (failure != null) throw failure;
    final gate = this.gate;
    if (gate != null) await gate.future;
    postIds.add(postId);
    return result;
  }
}

ProviderContainer _container({
  required _FakeRepository repository,
  required _FakeClient client,
  PublishPollPolicy policy = const PublishPollPolicy(
    interval: Duration.zero,
    attempts: 3,
  ),
}) {
  return ProviderContainer(
    overrides: [
      postsRepositoryProvider.overrideWithValue(repository),
      publishClientProvider.overrideWithValue(client),
      publishPollPolicyProvider.overrideWithValue(policy),
    ],
  );
}

void main() {
  test('one row and one call per target', () async {
    final repository = _FakeRepository();
    final client = _FakeClient();
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(
            targetIds: {'instagram:ig-1:feed', 'tiktok:tt-1:feed'},
            captions: {'instagram:ig-1:feed': 'A caption'},
          ),
          targets: const [_instagram, _tiktok],
          videoId: 'video-1',
        );

    expect(repository.drafts, hasLength(2));
    expect(client.postIds, hasLength(2));
    final state = container.read(publishControllerProvider) as PublishDone;
    expect(
      state.statuses.map((status) => status.phase),
      everyElement(PublishPhase.published),
    );
  });

  test('the row carries the caption of its own target', () async {
    final repository = _FakeRepository();
    final client = _FakeClient();
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(
            targetIds: {'instagram:ig-1:feed', 'tiktok:tt-1:feed'},
            captions: {
              'instagram:ig-1:feed': 'The Instagram words',
              'tiktok:tt-1:feed': 'The TikTok words',
            },
          ),
          targets: const [_instagram, _tiktok],
          videoId: 'video-1',
        );

    expect(repository.drafts.first.caption, 'The Instagram words');
    expect(repository.drafts.last.caption, 'The TikTok words');
  });

  test('the YouTube title goes into the row', () async {
    final repository = _FakeRepository();
    final client = _FakeClient();
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);
    const youtube = PublishTarget(
      platform: PublishPlatform.youtube,
      accountId: 'yt-1',
      accountName: 'FlowPost',
    );

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(
            targetIds: {'youtube:yt-1:feed'},
            captions: {'youtube:yt-1:feed': 'A description'},
            youtubeTitle: 'A title',
          ),
          targets: const [youtube],
          videoId: 'video-1',
        );

    expect(repository.drafts.single.metadata, {
      'youtube_video_title': 'A title',
    });
  });

  test('a caption the AI wrote marks the content as altered', () async {
    final repository = _FakeRepository();
    final client = _FakeClient();
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(
            targetIds: {'instagram:ig-1:feed'},
            captions: {'instagram:ig-1:feed': 'The AI words'},
            aiCaptions: {'instagram:ig-1:feed': 'The AI words'},
          ),
          targets: const [_instagram],
          videoId: 'video-1',
        );

    expect(repository.drafts.single.containsAlteredContent, isTrue);
  });

  test('a caption the admin wrote is not marked as altered', () async {
    final repository = _FakeRepository();
    final client = _FakeClient();
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(
            targetIds: {'instagram:ig-1:feed'},
            captions: {'instagram:ig-1:feed': 'My own words'},
            aiCaptions: {'instagram:ig-1:feed': 'The AI words'},
          ),
          targets: const [_instagram],
          videoId: 'video-1',
        );

    expect(repository.drafts.single.containsAlteredContent, isFalse);
  });

  test('one target that fails does not stop the other', () async {
    final repository = _FakeRepository();
    final client = _FakeClient()
      ..failures[_tiktok.id] = const PublishException(
        PublishFailure(PublishErrorCode.platformRejected, 'TikTok said no.'),
      );
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(
            targetIds: {'instagram:ig-1:feed', 'tiktok:tt-1:feed'},
          ),
          targets: const [_instagram, _tiktok],
          videoId: 'video-1',
        );

    final state = container.read(publishControllerProvider) as PublishDone;
    expect(state.statuses.first.phase, PublishPhase.published);
    expect(state.statuses.first.platformId, 'platform-1');
    expect(state.statuses.last.phase, PublishPhase.failed);
    expect(state.statuses.last.message, 'TikTok said no.');
  });

  test('a row the queue refuses fails only that target', () async {
    final repository = _FakeRepository()
      ..failure = const PostsException('The queue did not accept the post.');
    final client = _FakeClient();
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(targetIds: {'instagram:ig-1:feed'}),
          targets: const [_instagram],
          videoId: 'video-1',
        );

    final state = container.read(publishControllerProvider) as PublishDone;
    expect(state.statuses.single.phase, PublishPhase.failed);
    expect(state.statuses.single.message, 'The queue did not accept the post.');
  });

  test('the state is running while the call is in flight', () async {
    final repository = _FakeRepository();
    final client = _FakeClient();
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);
    final states = <PublishState>[];
    container.listen(publishControllerProvider, (_, next) => states.add(next));

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(targetIds: {'instagram:ig-1:feed'}),
          targets: const [_instagram],
          videoId: 'video-1',
        );

    expect(states.whereType<PublishRunning>(), isNotEmpty);
    expect(states.last, isA<PublishDone>());
  });

  test('the row is read back after the attempt', () async {
    final repository = _FakeRepository();
    final client = _FakeClient();
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(targetIds: {'instagram:ig-1:feed'}),
          targets: const [_instagram],
          videoId: 'video-1',
        );

    expect(repository.reads, ['post-1']);
  });

  test('a timeout waits for the row to settle', () async {
    final repository = _FakeRepository()
      ..answers = const [
        PostRow(
          id: 'post-1',
          platform: 'instagram',
          status: PostStatus.processing,
        ),
        PostRow(
          id: 'post-1',
          platform: 'instagram',
          status: PostStatus.published,
        ),
      ];
    final client = _FakeClient()
      ..failures[_instagram.id] = const PublishException(publishTimeoutFailure);
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(targetIds: {'instagram:ig-1:feed'}),
          targets: const [_instagram],
          videoId: 'video-1',
        );

    final state = container.read(publishControllerProvider) as PublishDone;
    expect(state.statuses.single.phase, PublishPhase.published);
    expect(repository.reads, hasLength(2));
  });

  test('a timeout that never settles leaves the outcome unknown', () async {
    final repository = _FakeRepository()
      ..answers = const [
        PostRow(
          id: 'post-1',
          platform: 'instagram',
          status: PostStatus.processing,
        ),
      ];
    final client = _FakeClient()
      ..failures[_instagram.id] = const PublishException(publishTimeoutFailure);
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(targetIds: {'instagram:ig-1:feed'}),
          targets: const [_instagram],
          videoId: 'video-1',
        );

    final state = container.read(publishControllerProvider) as PublishDone;
    expect(state.statuses.single.phase, PublishPhase.unconfirmed);
    expect(
      state.statuses.single.message,
      'The publish timed out. Check the Queue before trying again.',
    );
    // The wait is bounded: one read for the refresh and one per attempt.
    expect(repository.reads, hasLength(4));
  });

  test('a published row after a timeout is published', () async {
    final repository = _FakeRepository()
      ..answers = const [
        PostRow(
          id: 'post-1',
          platform: 'instagram',
          status: PostStatus.published,
        ),
      ];
    final client = _FakeClient()
      ..failures[_instagram.id] = const PublishException(publishTimeoutFailure);
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(targetIds: {'instagram:ig-1:feed'}),
          targets: const [_instagram],
          videoId: 'video-1',
        );

    final state = container.read(publishControllerProvider) as PublishDone;
    expect(state.statuses.single.phase, PublishPhase.published);
    // The row already said it, so nothing had to be waited for.
    expect(repository.reads, hasLength(1));
  });

  test('a failed row after a timeout is failed', () async {
    final repository = _FakeRepository()
      ..answers = const [
        PostRow(id: 'post-1', platform: 'instagram', status: PostStatus.failed),
      ];
    final client = _FakeClient()
      ..failures[_instagram.id] = const PublishException(publishTimeoutFailure);
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(targetIds: {'instagram:ig-1:feed'}),
          targets: const [_instagram],
          videoId: 'video-1',
        );

    final state = container.read(publishControllerProvider) as PublishDone;
    expect(state.statuses.single.phase, PublishPhase.failed);
    expect(repository.reads, hasLength(1));
  });

  test(
    'a row with a published time went out even when it says failed',
    () async {
      final repository = _FakeRepository()
        ..answers = [
          PostRow(
            id: 'post-1',
            platform: 'instagram',
            status: PostStatus.failed,
            publishedAt: DateTime.utc(2026, 10, 29),
          ),
        ];
      final client = _FakeClient()
        ..failures[_instagram.id] = const PublishException(
          publishTimeoutFailure,
        );
      final container = _container(repository: repository, client: client);
      addTearDown(container.dispose);

      await container
          .read(publishControllerProvider.notifier)
          .publish(
            selection: const PublishSelection(
              targetIds: {'instagram:ig-1:feed'},
            ),
            targets: const [_instagram],
            videoId: 'video-1',
          );

      final state = container.read(publishControllerProvider) as PublishDone;
      expect(state.statuses.single.phase, PublishPhase.published);
    },
  );

  test('a plain failure does not wait for the row', () async {
    final repository = _FakeRepository()
      ..answers = const [
        PostRow(
          id: 'post-1',
          platform: 'instagram',
          status: PostStatus.processing,
        ),
      ];
    final client = _FakeClient()
      ..failures[_instagram.id] = const PublishException(
        PublishFailure(PublishErrorCode.platformRejected, 'Instagram said no.'),
      );
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(targetIds: {'instagram:ig-1:feed'}),
          targets: const [_instagram],
          videoId: 'video-1',
        );

    final state = container.read(publishControllerProvider) as PublishDone;
    expect(state.statuses.single.phase, PublishPhase.failed);
    expect(repository.reads, hasLength(1));
  });

  test('an upload that worked but the row did not is not confirmed', () async {
    final repository = _FakeRepository()
      ..answers = const [
        PostRow(id: 'post-1', platform: 'instagram', status: PostStatus.failed),
      ];
    final client = _FakeClient()
      ..failures[_instagram.id] = const PublishException(
        PublishFailure(
          PublishErrorCode.uploadSucceeded,
          'The post may have gone out. Check the Queue before trying again.',
        ),
      );
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(targetIds: {'instagram:ig-1:feed'}),
          targets: const [_instagram],
          videoId: 'video-1',
        );

    final state = container.read(publishControllerProvider) as PublishDone;
    expect(state.statuses.single.phase, PublishPhase.unconfirmed);
    expect(
      state.statuses.single.message,
      'The post may have gone out. Check the Queue before trying again.',
    );
  });

  test('a scheduled post is queued and nothing is sent', () async {
    final repository = _FakeRepository();
    final client = _FakeClient();
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(
            targetIds: {'instagram:ig-1:feed'},
            mode: PublishMode.schedule,
            scheduleDate: '2026-11-01',
            scheduleTime: '09:30',
          ),
          targets: const [_instagram],
          videoId: 'video-1',
        );

    // The scheduler publishes it, so the client sends nothing itself.
    expect(client.postIds, isEmpty);
    expect(repository.reads, isEmpty);
    final draft = repository.drafts.single;
    expect(draft.status, 'scheduled');
    expect(draft.scheduledAt, DateTime(2026, 11, 1, 9, 30));
    final state = container.read(publishControllerProvider) as PublishDone;
    expect(state.statuses.single.phase, PublishPhase.scheduled);
    expect(state.statuses.single.scheduledAt, DateTime(2026, 11, 1, 9, 30));
  });

  test('a scheduled post with no time fails with the format', () async {
    final repository = _FakeRepository();
    final client = _FakeClient();
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(
            targetIds: {'instagram:ig-1:feed'},
            mode: PublishMode.schedule,
            scheduleDate: 'not a date',
            scheduleTime: '09:30',
          ),
          targets: const [_instagram],
          videoId: 'video-1',
        );

    final state = container.read(publishControllerProvider) as PublishDone;
    expect(state.statuses.single.phase, PublishPhase.failed);
    expect(state.statuses.single.message, scheduleFormatMessage);
    expect(repository.drafts, isEmpty);
  });

  test('a retry puts a failed row back into the queue', () async {
    final repository = _FakeRepository()
      ..answers = const [
        PostRow(id: 'post-1', platform: 'instagram', status: PostStatus.failed),
      ];
    final client = _FakeClient()
      ..failures[_instagram.id] = const PublishException(
        PublishFailure(PublishErrorCode.platformRejected, 'Instagram said no.'),
      );
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);
    final controller = container.read(publishControllerProvider.notifier);

    await controller.publish(
      selection: const PublishSelection(targetIds: {'instagram:ig-1:feed'}),
      targets: const [_instagram],
      videoId: 'video-1',
    );
    final failed = (container.read(
      publishControllerProvider,
    ) as PublishDone).statuses.single;
    expect(failed.canRetry, isTrue);

    await controller.retry(failed);

    expect(repository.rescheduled, ['post-1']);
    final state = container.read(publishControllerProvider) as PublishDone;
    expect(state.statuses.single.phase, PublishPhase.scheduled);
    expect(state.statuses.single.message, 'It goes out in a minute.');
    expect(
      state.statuses.single.scheduledAt!.difference(DateTime.now()).inSeconds,
      closeTo(60, 5),
    );
    // The retry never sends the call again.
    expect(client.postIds, isEmpty);
  });

  test(
    'a retry that changes nothing reads the row and shows the truth',
    () async {
      final repository = _FakeRepository()
        ..answers = const [
          PostRow(
            id: 'post-1',
            platform: 'instagram',
            status: PostStatus.failed,
          ),
          PostRow(
            id: 'post-1',
            platform: 'instagram',
            status: PostStatus.published,
          ),
        ]
        ..movesOnRetry = false;
      final client = _FakeClient()
        ..failures[_instagram.id] = const PublishException(
          PublishFailure(
            PublishErrorCode.platformRejected,
            'Instagram said no.',
          ),
        );
      final container = _container(repository: repository, client: client);
      addTearDown(container.dispose);
      final controller = container.read(publishControllerProvider.notifier);

      await controller.publish(
        selection: const PublishSelection(targetIds: {'instagram:ig-1:feed'}),
        targets: const [_instagram],
        videoId: 'video-1',
      );
      final failed = (container.read(
        publishControllerProvider,
      ) as PublishDone).statuses.single;

      await controller.retry(failed);

      final state = container.read(publishControllerProvider) as PublishDone;
      expect(state.statuses.single.phase, PublishPhase.published);
      expect(state.statuses.single.canRetry, isFalse);
      expect(
        state.statuses.single.message,
        'The row changed. Its status is now published.',
      );
    },
  );

  test(
    'a retry is not offered when the row was not read back as failed',
    () async {
      final repository = _FakeRepository();
      final client = _FakeClient()
        ..failures[_instagram.id] = const PublishException(
          PublishFailure(
            PublishErrorCode.platformRejected,
            'Instagram said no.',
          ),
        );
      final container = _container(repository: repository, client: client);
      addTearDown(container.dispose);
      final controller = container.read(publishControllerProvider.notifier);

      await controller.publish(
        selection: const PublishSelection(targetIds: {'instagram:ig-1:feed'}),
        targets: const [_instagram],
        videoId: 'video-1',
      );
      final failed = (container.read(
        publishControllerProvider,
      ) as PublishDone).statuses.single;
      expect(failed.canRetry, isFalse);

      await controller.retry(failed);

      expect(repository.rescheduled, isEmpty);
    },
  );

  test('a second click while a run works writes no second row', () async {
    final repository = _FakeRepository();
    final gate = Completer<void>();
    final client = _FakeClient()..gate = gate;
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);
    final controller = container.read(publishControllerProvider.notifier);
    const selection = PublishSelection(targetIds: {'instagram:ig-1:feed'});

    final first = controller.publish(
      selection: selection,
      targets: const [_instagram],
      videoId: 'video-1',
    );
    await controller.publish(
      selection: selection,
      targets: const [_instagram],
      videoId: 'video-1',
    );

    expect(repository.drafts, hasLength(1));
    expect(client.postIds, isEmpty);

    gate.complete();
    await first;

    expect(repository.drafts, hasLength(1));
    expect(client.postIds, hasLength(1));
  });

  test('a queue that stops answering ends the wait', () async {
    final repository = _FakeRepository()
      ..readFailure = const PostsException(
        'The queue did not answer. Try again.',
      );
    final client = _FakeClient()
      ..failures[_instagram.id] = const PublishException(publishTimeoutFailure);
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);

    await container
        .read(publishControllerProvider.notifier)
        .publish(
          selection: const PublishSelection(targetIds: {'instagram:ig-1:feed'}),
          targets: const [_instagram],
          videoId: 'video-1',
        );

    final state = container.read(publishControllerProvider) as PublishDone;
    expect(state.statuses.single.phase, PublishPhase.unconfirmed);
    // The refresh and one poll, and then the wait is over: a queue that does
    // not answer will not answer the next time either.
    expect(repository.reads, hasLength(2));
  });

  test('a retry the queue refuses keeps the failure on the screen', () async {
    final repository = _FakeRepository()
      ..answers = const [
        PostRow(id: 'post-1', platform: 'instagram', status: PostStatus.failed),
      ]
      ..retryFailure = const PostsException(
        'The queue did not answer. Try again.',
      );
    final client = _FakeClient()
      ..failures[_instagram.id] = const PublishException(
        PublishFailure(PublishErrorCode.platformRejected, 'Instagram said no.'),
      );
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);
    final controller = container.read(publishControllerProvider.notifier);

    await controller.publish(
      selection: const PublishSelection(targetIds: {'instagram:ig-1:feed'}),
      targets: const [_instagram],
      videoId: 'video-1',
    );
    final failed = (container.read(
      publishControllerProvider,
    ) as PublishDone).statuses.single;

    await controller.retry(failed);

    final state = container.read(publishControllerProvider) as PublishDone;
    expect(state.statuses.single.phase, PublishPhase.failed);
    expect(
      state.statuses.single.message,
      'The queue did not answer. Try again.',
    );
    expect(state.statuses.single.canRetry, isTrue);
  });
}
