import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/features/media/data/media_file_picker.dart';
import 'package:flowpost_desktop/main.dart' as app;
import 'package:integration_test/integration_test.dart';
import 'package:path/path.dart' as p;

/// Picks a fixture instead of opening the native dialog, so the real pipeline
/// can run inside the test.
class _FixturePicker implements MediaFilePicker {
  const _FixturePicker(this.file);

  final File file;

  @override
  Future<File?> pick() async => file;
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  // A single launch: the shell takes an OS lock, so a second `app.main()`
  // in the same process would hand off to the first and exit. The whole
  // end-to-end pass therefore lives in one test.
  testWidgets(
    'launches the shell, processes a real video and cancels cleanly',
    (tester) async {
      final fixture = _fixture('portrait_2s_1080x1920_h264.mp4');
      expect(
        fixture.existsSync(),
        isTrue,
        reason: 'the fixture must be present',
      );

      final ffmpegBefore = await _ffmpegProcessCount();

      await app.main(picker: _FixturePicker(fixture));
      await tester.pumpAndSettle(const Duration(seconds: 2));

      expect(find.text('FlowPost Studio'), findsWidgets);
      expect(find.textContaining('native desktop experience'), findsOneWidget);

      await tester.tap(find.text('Upload'));
      await tester.pumpAndSettle();

      expect(find.text('Choose a video or image'), findsOneWidget);
      expect(find.text('Choose file'), findsOneWidget);

      await tester.tap(find.text('Choose file'));
      await tester.pump(const Duration(milliseconds: 200));

      // The pipeline runs FFmpeg for real, so wait for the job to finish
      // instead of assuming a fixed duration.
      await _pumpUntil(
        tester,
        () => find.text('Dimensions: 1080 x 1920').evaluate().isNotEmpty,
        timeout: const Duration(minutes: 2),
      );

      expect(find.text('portrait_2s_1080x1920_h264.mp4'), findsOneWidget);
      expect(find.text('Dimensions: 1080 x 1920'), findsOneWidget);
      expect(find.text('Duration: 0:02'), findsOneWidget);
      expect(find.text('Video codec: h264'), findsOneWidget);
      expect(find.text('Normalized video — normalized.mp4'), findsOneWidget);
      expect(find.text('Thumbnail — thumb.jpg'), findsOneWidget);
      expect(find.text('Transcription audio — audio.mp3'), findsOneWidget);

      final upload = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Upload'),
      );
      expect(upload.onPressed, isNull, reason: 'upload waits for sign-in');
      final captions = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Generate captions'),
      );
      expect(captions.onPressed, isNull, reason: 'captions wait for sign-in');
      expect(
        find.text('Sign in required to generate captions or upload.'),
        findsOneWidget,
      );

      // Releasing the job removes the temporary folder.
      await tester.tap(find.text('Choose another file'));
      await tester.pumpAndSettle();
      expect(find.text('Choose a video or image'), findsOneWidget);

      // A second job, cancelled while FFmpeg is running: the process must not
      // outlive the job that started it.
      await tester.tap(find.text('Choose file'));
      await _pumpUntil(
        tester,
        () => find.text('Cancel').evaluate().isNotEmpty,
        timeout: const Duration(minutes: 1),
      );
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);

      await tester.tap(find.text('Cancel'));
      await _pumpUntil(
        tester,
        () => find.text('Choose a video or image').evaluate().isNotEmpty,
        timeout: const Duration(seconds: 30),
      );

      expect(find.text('Choose a video or image'), findsOneWidget);
      await _waitFor(
        () async => (await _ffmpegProcessCount()) == ffmpegBefore,
        timeout: const Duration(seconds: 30),
        message: 'the cancelled job left an FFmpeg process running',
      );
    },
  );
}

/// Pumps until [condition] holds, failing the test when it never does.
Future<void> _pumpUntil(
  WidgetTester tester,
  bool Function() condition, {
  required Duration timeout,
}) async {
  final deadline = DateTime.now().add(timeout);
  while (!condition()) {
    if (DateTime.now().isAfter(deadline)) {
      fail('the media pipeline did not reach the expected state in $timeout');
    }
    await tester.pump(const Duration(milliseconds: 100));
  }
}

/// Waits for an asynchronous condition to hold.
Future<void> _waitFor(
  Future<bool> Function() condition, {
  required Duration timeout,
  required String message,
}) async {
  final deadline = DateTime.now().add(timeout);
  while (!await condition()) {
    if (DateTime.now().isAfter(deadline)) fail(message);
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
}

/// The number of running FFmpeg processes.
Future<int> _ffmpegProcessCount() async {
  final result = await Process.run('tasklist', [
    '/FI',
    'IMAGENAME eq ffmpeg.exe',
  ]);
  if (result.exitCode != 0) return 0;
  final lines = (result.stdout as String)
      .split('\n')
      .where((line) => line.trimLeft().toLowerCase().startsWith('ffmpeg.exe'))
      .toList();
  return lines.length;
}

/// Finds a fixture next to the test package.
File _fixture(String name) {
  var directory = Directory.current;
  for (var depth = 0; depth < 6; depth++) {
    final candidate = File(
      p.join(directory.path, 'test', 'fixtures', 'media', name),
    );
    if (candidate.existsSync()) return candidate;
    final parent = directory.parent;
    if (parent.path == directory.path) break;
    directory = parent;
  }
  return File(
    p.join(Directory.current.path, 'test', 'fixtures', 'media', name),
  );
}
