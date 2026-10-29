import 'package:flowpost_desktop/app.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/publishing/data/publish_client.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_errors.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/publishing/publishing_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

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
  @override
  Future<String> insert(PostDraft draft) async => 'post-1';

  @override
  Future<PostRow?> read(String postId) async => null;

  @override
  Future<bool> rescheduleFailed(String postId, DateTime scheduledAt) async =>
      false;
}

/// A publisher that answers from memory.
class _FakeClient implements PublishApi {
  PublishResult result = const PublishResult(platformId: 'ig-99');
  PublishException? failure;

  @override
  Future<PublishResult> publish({
    required PublishTarget target,
    required String postId,
  }) async {
    final failure = this.failure;
    if (failure != null) throw failure;
    return result;
  }
}

Future<void> _pump(
  WidgetTester tester, {
  List<PublishTarget> targets = const [_instagram],
  bool signedIn = true,
  bool withMedia = true,
  Size size = const Size(1280, 800),
  _FakeClient? client,
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
        postsRepositoryProvider.overrideWithValue(_FakeRepository()),
        publishClientProvider.overrideWithValue(client ?? _FakeClient()),
        publishPollPolicyProvider.overrideWithValue(
          const PublishPollPolicy(interval: Duration.zero, attempts: 1),
        ),
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
    expect(find.text('Post id: ig-99'), findsOneWidget);
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
}
