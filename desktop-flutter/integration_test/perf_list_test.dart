import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/core/time/time_zone.dart';
import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flowpost_desktop/features/offline/offline_providers.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/publishing/presentation/publish_page.dart';
import 'package:flowpost_desktop/features/publishing/publishing_providers.dart';
import 'package:flowpost_desktop/features/scheduling/data/scheduled_posts_repository.dart';
import 'package:flowpost_desktop/features/scheduling/presentation/queue_page.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import '../test/support/config_overrides.dart';
import '../test/support/fake_drafts.dart';
import '../test/support/fake_posts_cache.dart';
import '../test/support/fake_scheduled_posts.dart';

const _config = AppConfig(
  supabaseUrl: 'https://flowpost.test',
  supabaseAnonKey: 'anon-key',
  updateManifestUrl: '',
);

const _targets = [
  PublishTarget(
    platform: PublishPlatform.instagram,
    accountId: 'ig-1',
    accountName: 'FlowPost Reels',
  ),
  PublishTarget(
    platform: PublishPlatform.youtube,
    accountId: 'yt-1',
    accountName: 'FlowPost Channel',
  ),
  PublishTarget(
    platform: PublishPlatform.facebook,
    accountId: 'fb-1',
    accountName: 'FlowPost Page',
  ),
  PublishTarget(
    platform: PublishPlatform.tiktok,
    accountId: 'tt-1',
    accountName: 'FlowPost TikTok',
  ),
  PublishTarget(
    platform: PublishPlatform.linkedin,
    accountId: 'li-1',
    accountName: 'FlowPost Company',
  ),
];

List<double> _stats(List<FrameTiming> timings) =>
    [for (final t in timings) t.totalSpan.inMicroseconds / 1000]..sort();

String _line(String name, List<double> spans, {double? firstPaintMs}) {
  double pct(double p) => spans.isEmpty
      ? 0
      : spans[(spans.length * p).clamp(0, spans.length - 1).toInt()];
  return jsonEncode({
    'test': name,
    'frames': spans.length,
    'first_paint_max_ms': ?firstPaintMs,
    'p50_ms': pct(0.5),
    'p95_ms': pct(0.95),
    'p99_ms': pct(0.99),
    'max_ms': spans.isEmpty ? 0 : spans.last,
    'over_16_7': spans.where((s) => s > 16.7).length,
    'over_100': spans.where((s) => s > 100).length,
    'rss_mb': ProcessInfo.currentRss / (1024 * 1024),
  });
}

double _max(List<double> spans) => spans.isEmpty ? 0 : spans.last;

/// Scrolls a 200-row queue and the five-platform compose screen on the real
/// Windows window and writes the frame timings to `build/perf_*_result.json`.
/// Run both harnesses with `flutter drive --profile -d windows` (see
/// `tasks/todo.md`, Phase 6.5).
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('200-row queue scrolls on real frames', (tester) async {
    final rows = [
      for (var i = 0; i < 200; i++)
        post(
          id: 'post-$i',
          caption:
              'Caption $i: a sentence long enough to take a line or '
              'two on the card, with #tags and a platform name.',
        ),
    ];
    final repository = FakeScheduledPostsRepository()
      ..pages[0] = ScheduledPostsPage(posts: rows, hasMore: false);

    final timings = <FrameTiming>[];
    void collect(List<FrameTiming> batch) => timings.addAll(batch);
    binding.addTimingsCallback(collect);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          scheduledPostsRepositoryProvider.overrideWithValue(repository),
          postsCacheProvider.overrideWithValue(FakePostsCache()),
          timeZoneProvider.overrideWithValue(const SystemTimeZone()),
        ],
        child: const MaterialApp(home: QueuePage()),
      ),
    );
    await tester.pumpAndSettle();

    // Warm the first frames, then fling through the list ten screens.
    await Future<void>.delayed(const Duration(milliseconds: 400));
    final firstPaint = _max(_stats(timings));
    timings.clear();
    for (var i = 0; i < 10; i++) {
      await tester.fling(
        find.byType(ListView).first,
        const Offset(0, -900),
        3000,
      );
      await tester.pumpAndSettle();
    }
    await Future<void>.delayed(const Duration(milliseconds: 600));
    binding.removeTimingsCallback(collect);

    final spans = _stats(timings);
    File('build/perf_list_result.json')
        .writeAsStringSync(_line('queue-200', spans, firstPaintMs: firstPaint));
    expect(spans, isNotEmpty);
  });

  testWidgets('the five-platform compose screen scrolls on real frames', (
    tester,
  ) async {
    final timings = <FrameTiming>[];
    void collect(List<FrameTiming> batch) => timings.addAll(batch);
    binding.addTimingsCallback(collect);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          seededConfig(_config),
          publishTargetsProvider.overrideWithValue(_targets),
          draftsRepositoryProvider.overrideWithValue(FakeDraftsRepository()),
          publishedMediaProvider.overrideWithValue(
            const PublishedMedia(
              videoId: 'video-1',
              fileName: 'clip.mp4',
              size: 70 * 1024 * 1024,
              kind: MediaKind.video,
            ),
          ),
          timeZoneProvider.overrideWithValue(const SystemTimeZone()),
        ],
        child: const MaterialApp(home: PublishPage()),
      ),
    );
    await tester.pumpAndSettle();
    await Future<void>.delayed(const Duration(milliseconds: 400));
    final firstPaint = _max(_stats(timings));
    timings.clear();

    // Pick every platform, then scroll the whole form, twice.
    for (final target in _targets) {
      final tile = find.byKey(Key('target-${target.id}'));
      await tester.ensureVisible(tile);
      await tester.pumpAndSettle();
      await tester.tap(tile);
      await tester.pumpAndSettle();
    }
    // All five platforms are on the form, so the scroll crosses the whole
    // thing and not just the tiles.
    expect(find.byKey(Key('caption-${_targets.first.id}')), findsOneWidget);
    expect(find.byKey(Key('caption-${_targets.last.id}')), findsOneWidget);
    final lastCaption = find.byKey(Key('caption-${_targets.last.id}'));
    final before = tester.getTopLeft(lastCaption).dy;
    for (var i = 0; i < 8; i++) {
      final scroll = find.byType(Scrollable).first;
      await tester.fling(scroll, const Offset(0, -600), 3000);
      await tester.pumpAndSettle();
    }
    // The page really moved, so the frames belong to a scroll.
    expect(tester.getTopLeft(lastCaption).dy, lessThan(before));
    await Future<void>.delayed(const Duration(milliseconds: 600));
    binding.removeTimingsCallback(collect);

    final spans = _stats(timings);
    File('build/perf_publish_result.json').writeAsStringSync(
      _line('publish-compose', spans, firstPaintMs: firstPaint),
    );
    expect(spans, isNotEmpty);
  });
}
