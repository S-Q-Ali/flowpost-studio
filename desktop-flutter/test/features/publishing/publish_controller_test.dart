import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/publishing/data/publish_client.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_errors.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_selection.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
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

  /// The rows the read answers with, in order. The last one repeats.
  List<PostRow?> answers = [];

  /// The ids the client read back.
  final List<String> reads = [];

  @override
  Future<String> insert(PostDraft draft) async {
    if (failure != null) throw failure!;
    drafts.add(draft);
    return 'post-${drafts.length}';
  }

  @override
  Future<PostRow?> read(String postId) async {
    reads.add(postId);
    if (answers.isEmpty) return null;
    final index = reads.length - 1;
    return index < answers.length ? answers[index] : answers.last;
  }

  @override
  Future<bool> rescheduleFailed(String postId, DateTime scheduledAt) async =>
      false;
}

/// A publisher that answers from memory.
class _FakeClient implements PublishApi {
  final List<String> postIds = [];
  final Map<String, PublishException> failures = {};
  PublishResult result = const PublishResult(platformId: 'platform-1');

  @override
  Future<PublishResult> publish({
    required PublishTarget target,
    required String postId,
  }) async {
    final failure = failures[target.id];
    if (failure != null) throw failure;
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

  test('reset throws the last attempt away', () async {
    final repository = _FakeRepository();
    final client = _FakeClient();
    final container = _container(repository: repository, client: client);
    addTearDown(container.dispose);
    final controller = container.read(publishControllerProvider.notifier);

    await controller.publish(
      selection: const PublishSelection(targetIds: {'instagram:ig-1:feed'}),
      targets: const [_instagram],
      videoId: 'video-1',
    );
    controller.reset();

    expect(container.read(publishControllerProvider), isA<PublishIdle>());
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
}
