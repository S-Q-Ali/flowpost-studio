import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/features/media/data/ffmpeg_paths.dart';
import 'package:flowpost_desktop/features/media/data/media_file_picker.dart';
import 'package:flowpost_desktop/features/media/media_providers.dart';
import 'package:flowpost_desktop/features/media/presentation/media_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import '../test/support/config_overrides.dart';

/// The size budget the stress file has to clear to be a large-file run.
const int _minimumStressBytes = 60 * 1024 * 1024;

/// Writes the stress video with the bundled FFmpeg: 1080p30 for 20 seconds at
/// the highest MPEG-4 quality, about 70 MB on the pinned build.
Future<File> _stressFile() async {
  final fixture = File('build/perf_media/size_stress.mp4').absolute;
  if (fixture.existsSync() && fixture.lengthSync() >= _minimumStressBytes) {
    return fixture;
  }
  final paths = await FfmpegPaths.locate();
  if (paths == null) {
    throw StateError('FFmpeg is not installed; no large-file run is possible.');
  }
  await fixture.parent.create(recursive: true);
  final run = await Process.run(paths.ffmpeg, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1920x1080:rate=30',
    '-t',
    '20',
    '-c:v',
    'mpeg4',
    '-q:v',
    '1',
    fixture.path,
  ]);
  if (run.exitCode != 0) {
    throw StateError('FFmpeg could not write the stress video: ${run.stderr}');
  }
  return fixture;
}

/// Runs the real FFmpeg pipeline over a 70 MB video on the real window and
/// writes the frame timings and the peak memory to
/// `build/perf_media_result.json`.
class _FixturePicker implements MediaFilePicker {
  const _FixturePicker(this.file);

  final File file;

  @override
  Future<File?> pick() async => file;
}

const _config = AppConfig(
  supabaseUrl: 'https://flowpost.test',
  supabaseAnonKey: 'anon-key',
  updateManifestUrl: '',
);

Future<void> _pumpUntil(
  WidgetTester tester,
  bool Function() done, {
  required Duration timeout,
}) async {
  final clock = Stopwatch()..start();
  while (!done()) {
    if (clock.elapsed > timeout) {
      throw TimeoutException('The step did not finish in $timeout.');
    }
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('a 70 MB video does not freeze the window', (tester) async {
    final fixture = await _stressFile();
    expect(
      fixture.lengthSync(),
      greaterThan(_minimumStressBytes),
      reason: 'the stress file has to be a large file',
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          seededConfig(_config),
          mediaPickerProvider.overrideWithValue(_FixturePicker(fixture)),
        ],
        child: const MaterialApp(home: MediaPage()),
      ),
    );
    await tester.pumpAndSettle();

    final timings = <FrameTiming>[];
    void collect(List<FrameTiming> batch) => timings.addAll(batch);
    binding.addTimingsCallback(collect);

    var peakRss = ProcessInfo.currentRss;
    final sampler = Timer.periodic(const Duration(milliseconds: 100), (_) {
      final rss = ProcessInfo.currentRss;
      if (rss > peakRss) peakRss = rss;
    });

    final started = DateTime.now();
    await tester.tap(find.text('Choose file'));
    await _pumpUntil(
      tester,
      () => find.text('Dimensions: 1920 x 1080').evaluate().isNotEmpty,
      timeout: const Duration(minutes: 3),
    );
    final elapsed = DateTime.now().difference(started);
    sampler.cancel();
    await tester.pumpAndSettle(const Duration(seconds: 1));
    binding.removeTimingsCallback(collect);

    final spans = [for (final t in timings) t.totalSpan.inMicroseconds / 1000]
      ..sort();
    double pct(double p) => spans.isEmpty
        ? 0
        : spans[(spans.length * p).clamp(0, spans.length - 1).toInt()];
    final report = {
      'seconds': elapsed.inMilliseconds / 1000,
      'file_mb': fixture.lengthSync() / (1024 * 1024),
      'frames': spans.length,
      'p50_ms': pct(0.5),
      'p95_ms': pct(0.95),
      'p99_ms': pct(0.99),
      'max_ms': spans.isEmpty ? 0 : spans.last,
      'over_16_7': spans.where((s) => s > 16.7).length,
      'over_100': spans.where((s) => s > 100).length,
      'peak_rss_mb': peakRss / (1024 * 1024),
    };
    File('build/perf_media_result.json')
        .writeAsStringSync(const JsonEncoder.withIndent('  ').convert(report));
  });
}
