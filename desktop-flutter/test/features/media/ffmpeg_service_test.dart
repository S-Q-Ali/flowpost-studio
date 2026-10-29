import 'dart:async';
import 'dart:io';

import 'package:flowpost_desktop/features/media/data/ffmpeg_paths.dart';
import 'package:flowpost_desktop/features/media/data/ffmpeg_runner.dart';
import 'package:flowpost_desktop/features/media/data/media_processor.dart';
import 'package:flowpost_desktop/features/media/domain/media_job.dart';
import 'package:flowpost_desktop/features/media/domain/media_processing.dart';
import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flutter_test/flutter_test.dart';

const String _videoProbeJson = '''
{
  "streams": [
    {
      "codec_name": "h264",
      "codec_type": "video",
      "width": 1080,
      "height": 1920,
      "pix_fmt": "yuv420p",
      "avg_frame_rate": "30/1",
      "r_frame_rate": "30/1"
    },
    {
      "codec_name": "aac",
      "codec_type": "audio"
    }
  ],
  "format": { "duration": "2.000000" }
}
''';

const String _silentProbeJson = '''
{
  "streams": [
    {
      "codec_name": "h264",
      "codec_type": "video",
      "width": 640,
      "height": 360,
      "pix_fmt": "yuv420p",
      "avg_frame_rate": "30/1"
    }
  ],
  "format": { "duration": "2.000000" }
}
''';

const String _imageProbeJson = '''
{
  "streams": [
    {
      "codec_name": "png",
      "codec_type": "video",
      "width": 640,
      "height": 360,
      "pix_fmt": "rgb24"
    }
  ],
  "format": {}
}
''';

class _FakeCall {
  _FakeCall(this.executable, this.arguments);

  final String executable;
  final List<String> arguments;

  String get outputPath => arguments.last;
}

class _FakeExecutor implements FfmpegExecutor {
  _FakeExecutor(this.handler);

  final FutureOr<FfmpegRun> Function(_FakeCall call) handler;
  final List<_FakeCall> calls = [];
  final List<Duration?> timeouts = [];
  List<Duration> progressTimes = const [];
  int cancelCalls = 0;

  List<List<String>> get argumentLists =>
      calls.map((call) => call.arguments).toList();

  /// The FFmpeg calls only; the probe runs on a different executable.
  List<List<String>> get ffmpegArgumentLists => calls
      .where((call) => call.executable == 'ffmpeg')
      .map((call) => call.arguments)
      .toList();

  @override
  Future<FfmpegRun> run({
    required String executable,
    required List<String> arguments,
    Duration? timeout,
    void Function(Duration outTime)? onProgress,
  }) async {
    final call = _FakeCall(executable, arguments);
    calls.add(call);
    timeouts.add(timeout);
    for (final time in progressTimes) {
      onProgress?.call(time);
    }
    return await handler(call);
  }

  @override
  void cancel() {
    cancelCalls++;
  }
}

const FfmpegPaths _paths = FfmpegPaths(ffmpeg: 'ffmpeg', ffprobe: 'ffprobe');

void _writeOutput(String path) {
  File(path).writeAsBytesSync(List<int>.filled(16, 0));
}

/// A fake that probes successfully and runs every FFmpeg step.
_FakeExecutor _workingExecutor({
  String probeJson = _videoProbeJson,
  int probeExitCode = 0,
  FfmpegRun Function(_FakeCall call)? onFfmpeg,
}) {
  return _FakeExecutor((call) {
    if (call.executable == 'ffprobe') {
      return FfmpegRun(
        exitCode: probeExitCode,
        stdout: probeJson,
        stderr: probeExitCode == 0 ? '' : 'Invalid data found',
      );
    }
    final override = onFfmpeg?.call(call);
    if (override != null) return override;
    _writeOutput(call.outputPath);
    return const FfmpegRun(exitCode: 0, stdout: '', stderr: '');
  });
}

void main() {
  late Directory workspace;

  setUp(() async {
    workspace = await Directory.systemTemp.createTemp('flowpost-media-test');
  });

  tearDown(() async {
    if (await workspace.exists()) {
      await workspace.delete(recursive: true);
    }
  });

  MediaJob job({
    String sourcePath = r'C:\clips\portrait.mp4',
    MediaKind kind = MediaKind.video,
  }) {
    return MediaJob(
      id: '20260101T000000-abcdef',
      sourcePath: sourcePath,
      displayName: sourcePath.split(RegExp(r'[/\\]')).last,
      kind: kind,
      sourceBytes: 623666,
      workspacePath: workspace.path,
    );
  }

  test('probes the source and produces every output', () async {
    final processor = FfmpegMediaProcessor(
      executor: _workingExecutor(),
      paths: _paths,
    );

    final result = await processor.process(job());

    expect(result.stage, MediaStage.ready);
    expect(result.probe, isNotNull);
    expect(result.probe!.width, 1080);
    expect(result.probe!.duration, const Duration(seconds: 2));

    final outputs = result.outputs!;
    expect(outputs.normalized, isNotNull);
    expect(outputs.normalized!.path, endsWith('normalized.mp4'));
    expect(outputs.thumbnail.path, endsWith('thumb.jpg'));
    expect(outputs.frames, hasLength(3));
    expect(outputs.frames.first.path, endsWith('frame_1.jpg'));
    expect(outputs.frames.last.path, endsWith('frame_3.jpg'));
    expect(outputs.audio, isNotNull);
    expect(outputs.audio!.path, endsWith('audio.mp3'));
  });

  test('an unreadable file is rejected before any processing', () async {
    final executor = _workingExecutor(probeExitCode: 1);
    final processor = FfmpegMediaProcessor(executor: executor, paths: _paths);

    await expectLater(
      processor.process(job()),
      throwsA(
        isA<MediaProcessingException>().having(
          (error) => error.message,
          'message',
          "This file can't be read. It may be damaged.",
        ),
      ),
    );
    expect(executor.calls, hasLength(1));
  });

  test('a video longer than three minutes is rejected', () async {
    const probeJson = '''
{
  "streams": [
    {
      "codec_name": "h264",
      "codec_type": "video",
      "width": 640,
      "height": 360,
      "pix_fmt": "yuv420p"
    }
  ],
  "format": { "duration": "200.000000" }
}
''';
    final processor = FfmpegMediaProcessor(
      executor: _workingExecutor(probeJson: probeJson),
      paths: _paths,
    );

    await expectLater(
      processor.process(job()),
      throwsA(
        isA<MediaProcessingException>().having(
          (error) => error.message,
          'message',
          'Videos must be 3 minutes or shorter.',
        ),
      ),
    );
  });

  test('a compliant mp4 is copied and a webm is re-encoded', () async {
    final copyExecutor = _workingExecutor();
    await FfmpegMediaProcessor(
      executor: copyExecutor,
      paths: _paths,
    ).process(job(sourcePath: r'C:\clips\portrait.mp4'));

    expect(
      copyExecutor.ffmpegArgumentLists.first,
      containsAllInOrder(['-c', 'copy']),
    );

    final encodeExecutor = _workingExecutor();
    await FfmpegMediaProcessor(
      executor: encodeExecutor,
      paths: _paths,
    ).process(job(sourcePath: r'C:\clips\clip.webm'));

    expect(
      encodeExecutor.ffmpegArgumentLists.first,
      containsAllInOrder(['-c:v', 'libopenh264']),
    );
  });

  test('a failed remux falls back to one encode attempt', () async {
    final executor = _workingExecutor(
      onFfmpeg: (call) {
        final isRemux = call.arguments.contains('-c');
        if (isRemux) {
          return const FfmpegRun(
            exitCode: 1,
            stdout: '',
            stderr: '[lib @ 0x1] Invalid data found when processing input',
          );
        }
        _writeOutput(call.outputPath);
        return const FfmpegRun(exitCode: 0, stdout: '', stderr: '');
      },
    );

    final result = await FfmpegMediaProcessor(
      executor: executor,
      paths: _paths,
    ).process(job());

    expect(result.stage, MediaStage.ready);
    final ffmpegCalls = executor.ffmpegArgumentLists;
    expect(ffmpegCalls[0], containsAllInOrder(['-c', 'copy']));
    expect(ffmpegCalls[1], containsAllInOrder(['-c:v', 'libopenh264']));
    expect(
      ffmpegCalls.where((arguments) => arguments.contains('libopenh264')),
      hasLength(1),
    );
  });

  test('a silent source produces no audio file', () async {
    final executor = _workingExecutor(probeJson: _silentProbeJson);

    final result = await FfmpegMediaProcessor(
      executor: executor,
      paths: _paths,
    ).process(job());

    expect(result.outputs!.audio, isNull);
    expect(
      executor.argumentLists.any(
        (arguments) => arguments.contains('libmp3lame'),
      ),
      isFalse,
    );
  });

  test('an image is not normalized and produces a single frame', () async {
    final executor = _workingExecutor(probeJson: _imageProbeJson);

    final result = await FfmpegMediaProcessor(
      executor: executor,
      paths: _paths,
    ).process(job(sourcePath: r'C:\clips\still.png', kind: MediaKind.image));

    expect(result.outputs!.normalized, isNull);
    expect(result.outputs!.frames, hasLength(1));
    expect(
      executor.argumentLists.any(
        (arguments) => arguments.contains('libopenh264'),
      ),
      isFalse,
    );
  });

  test('progress rises and ends at one', () async {
    final executor = _workingExecutor();
    executor.progressTimes = const [Duration(seconds: 1), Duration(seconds: 2)];
    final updates = <MediaProcessingProgress>[];

    await FfmpegMediaProcessor(
      executor: executor,
      paths: _paths,
    ).process(job(), onProgress: updates.add);

    expect(updates, isNotEmpty);
    for (var index = 1; index < updates.length; index++) {
      expect(
        updates[index].fraction,
        greaterThanOrEqualTo(updates[index - 1].fraction),
      );
    }
    expect(updates.last.fraction, 1.0);
    expect(updates.last.stage, MediaStage.ready);
  });

  test('cancelling during a run stops the pipeline', () async {
    late FfmpegMediaProcessor processor;
    final executor = _FakeExecutor((call) {
      if (call.executable == 'ffprobe') {
        return const FfmpegRun(
          exitCode: 0,
          stdout: _videoProbeJson,
          stderr: '',
        );
      }
      processor.cancel();
      return const FfmpegRun(
        exitCode: -1,
        stdout: '',
        stderr: '',
        cancelled: true,
      );
    });
    processor = FfmpegMediaProcessor(executor: executor, paths: _paths);

    await expectLater(processor.process(job()), throwsA(isA<MediaCancelled>()));
    expect(executor.cancelCalls, 1);
  });

  test('cancelling before the run starts does no work', () async {
    final executor = _workingExecutor();
    final processor = FfmpegMediaProcessor(executor: executor, paths: _paths);

    processor.cancel();

    await expectLater(processor.process(job()), throwsA(isA<MediaCancelled>()));
    expect(executor.calls, isEmpty);
  });

  test('a failed run reports a reason without the source path', () async {
    final executor = _workingExecutor(
      onFfmpeg: (call) => const FfmpegRun(
        exitCode: 1,
        stdout: '',
        stderr: '[lib @ 0x1] Error opening input: Invalid data found\nC:\\Users\\Someone\\clips\\bad.mp4',
      ),
    );

    try {
      await FfmpegMediaProcessor(
        executor: executor,
        paths: _paths,
      ).process(job());
      fail('the pipeline should have failed');
    } on MediaProcessingException catch (error) {
      expect(error.message, isNot(contains('C:')));
      expect(error.message, isNotEmpty);
    }
  });

  test('an operation that produces no file fails the step', () async {
    final executor = _workingExecutor(
      onFfmpeg: (call) => const FfmpegRun(exitCode: 0, stdout: '', stderr: ''),
    );

    await expectLater(
      FfmpegMediaProcessor(executor: executor, paths: _paths).process(job()),
      throwsA(isA<MediaProcessingException>()),
    );
  });

  test('every step runs inside the job budget', () async {
    final executor = _workingExecutor();

    await FfmpegMediaProcessor(
      executor: executor,
      paths: _paths,
      jobTimeout: const Duration(minutes: 5),
    ).process(job());

    expect(executor.timeouts, isNotEmpty);
    for (final timeout in executor.timeouts) {
      expect(timeout, isNotNull);
      expect(timeout!, lessThanOrEqualTo(const Duration(minutes: 5)));
      expect(timeout, greaterThan(Duration.zero));
    }
  });

  test('a job that outruns its budget is stopped', () async {
    final executor = _FakeExecutor((call) async {
      if (call.executable == 'ffprobe') {
        return const FfmpegRun(
          exitCode: 0,
          stdout: _videoProbeJson,
          stderr: '',
        );
      }
      await Future<void>.delayed(const Duration(milliseconds: 60));
      _writeOutput(call.outputPath);
      return const FfmpegRun(exitCode: 0, stdout: '', stderr: '');
    });

    await expectLater(
      FfmpegMediaProcessor(
        executor: executor,
        paths: _paths,
        jobTimeout: const Duration(milliseconds: 100),
      ).process(job()),
      throwsA(
        isA<MediaProcessingException>().having(
          (error) => error.message,
          'message',
          'Processing took too long and was stopped.',
        ),
      ),
    );
  });
}
