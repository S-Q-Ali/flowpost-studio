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

  @override
  Future<String> insert(PostDraft draft) async {
    if (failure != null) throw failure!;
    drafts.add(draft);
    return 'post-${drafts.length}';
  }

  @override
  Future<PostRow?> read(String postId) async => null;

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
}) {
  return ProviderContainer(
    overrides: [
      postsRepositoryProvider.overrideWithValue(repository),
      publishClientProvider.overrideWithValue(client),
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
}
