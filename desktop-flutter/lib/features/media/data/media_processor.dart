import 'dart:io';

import 'package:logging/logging.dart';
import 'package:path/path.dart' as p;

import '../domain/ffmpeg_error.dart';
import '../domain/ffmpeg_plan.dart';
import '../domain/media_job.dart';
import '../domain/media_limits.dart';
import '../domain/media_outputs.dart';
import '../domain/media_probe.dart';
import '../domain/media_processing.dart';
import '../domain/media_validation.dart';
import 'ffmpeg_paths.dart';
import 'ffmpeg_runner.dart';

typedef MediaProgressCallback = void Function(MediaProcessingProgress progress);

/// Builds the processor for one job. One job runs at a time, so each job
/// gets its own processor and its own cancel flag.
typedef MediaProcessorFactory = Future<MediaProcessor> Function(MediaJob job);

/// Turns one picked file into the outputs the upload step needs.
///
/// One processor serves one job: cancelling it stops the FFmpeg process and
/// leaves the processor cancelled.
abstract interface class MediaProcessor {
  Future<MediaJob> process(MediaJob job, {MediaProgressCallback? onProgress});

  /// Stops the running FFmpeg process. The job ends as cancelled.
  void cancel();
}

/// Runs the pipeline with the bundled FFmpeg: probe, limits, normalize,
/// thumbnail, caption frames and audio.
class FfmpegMediaProcessor implements MediaProcessor {
  FfmpegMediaProcessor({
    required this.executor,
    required this.paths,
    this.log,
    this.jobTimeout = defaultJobTimeout,
  });

  final FfmpegExecutor executor;
  final FfmpegPaths paths;
  final Logger? log;

  /// The wall-clock time the whole job may take.
  ///
  /// The runner's timeout applies to one process and a job runs six of them,
  /// so without a job budget a stuck job could run for an hour.
  final Duration jobTimeout;

  static const Duration defaultJobTimeout = Duration(minutes: 15);
  static const Duration _probeTimeout = Duration(seconds: 30);
  static const String _tooLongMessage =
      'Processing took too long and was stopped.';

  bool _cancelled = false;

  @override
  void cancel() {
    _cancelled = true;
    executor.cancel();
  }

  @override
  Future<MediaJob> process(
    MediaJob job, {
    MediaProgressCallback? onProgress,
  }) async {
    final progress = _Progress(onProgress);
    final budget = _Budget(jobTimeout);

    _throwIfCancelled();
    progress.stage(MediaStage.probing, 0.02, 'Reading the file...');

    final probe = await _probe(job.sourcePath, budget);
    _throwIfCancelled();

    final limitError = checkMediaLimits(probe, kind: job.kind);
    if (limitError != null) throw MediaProcessingException(limitError.message);

    progress.stage(MediaStage.processing, 0.05, 'Processing...');

    final outputs = await _produce(
      job,
      probe,
      Directory(job.workspacePath),
      progress,
      budget,
    );

    progress.stage(MediaStage.ready, 1.0, 'Ready.');
    return job.copyWith(
      probe: probe,
      outputs: outputs,
      stage: MediaStage.ready,
    );
  }

  Future<MediaProbe> _probe(String sourcePath, _Budget budget) async {
    final remaining = budget.remaining;
    if (remaining <= Duration.zero) {
      throw const MediaProcessingException(_tooLongMessage);
    }
    final run = await executor.run(
      executable: paths.ffprobe,
      arguments: probeArguments(sourcePath),
      timeout: remaining < _probeTimeout ? remaining : _probeTimeout,
    );
    if (run.cancelled) throw const MediaCancelled();
    if (!run.isSuccess) {
      throw const MediaProcessingException(
        "This file can't be read. It may be damaged.",
      );
    }
    try {
      return parseProbeJson(run.stdout);
    } on MediaProbeException catch (error) {
      throw MediaProcessingException(error.message);
    }
  }

  Future<MediaOutputs> _produce(
    MediaJob job,
    MediaProbe probe,
    Directory directory,
    _Progress progress,
    _Budget budget,
  ) async {
    File? normalized;
    if (job.kind == MediaKind.video) {
      normalized = await _normalize(job, probe, directory, progress, budget);
    }

    progress.stage(MediaStage.processing, 0.7, 'Creating the thumbnail...');
    final thumbnail = File(p.join(directory.path, 'thumb.jpg'));
    await _run(
      thumbnailArguments(
        sourcePath: job.sourcePath,
        outputPath: thumbnail.path,
        at: job.kind == MediaKind.image
            ? null
            : thumbnailTimestamp(probe.duration),
      ),
      thumbnail,
      progress,
      budget,
    );

    progress.stage(MediaStage.processing, 0.8, 'Extracting caption frames...');
    final frames = <File>[];
    final timestamps = frameTimestampsForKind(job.kind, probe.duration);
    for (var index = 0; index < timestamps.length; index++) {
      final frame = File(p.join(directory.path, 'frame_${index + 1}.jpg'));
      await _run(
        frameArguments(
          sourcePath: job.sourcePath,
          outputPath: frame.path,
          at: job.kind == MediaKind.image ? null : timestamps[index],
        ),
        frame,
        progress,
        budget,
      );
      frames.add(frame);
    }

    File? audio;
    if (probe.hasAudio) {
      progress.stage(MediaStage.processing, 0.95, 'Extracting the audio...');
      audio = File(p.join(directory.path, 'audio.mp3'));
      await _run(
        audioArguments(sourcePath: job.sourcePath, outputPath: audio.path),
        audio,
        progress,
        budget,
      );
    }

    return MediaOutputs(
      thumbnail: thumbnail,
      frames: frames,
      normalized: normalized,
      audio: audio,
    );
  }

  /// Normalizes the video to MP4, copying the streams when the source allows
  /// it and re-encoding otherwise.
  Future<File> _normalize(
    MediaJob job,
    MediaProbe probe,
    Directory directory,
    _Progress progress,
    _Budget budget,
  ) async {
    final output = File(p.join(directory.path, 'normalized.mp4'));

    if (canRemux(kind: job.kind, sourcePath: job.sourcePath, probe: probe)) {
      final run = await _execute(
        remuxArguments(sourcePath: job.sourcePath, outputPath: output.path),
        total: probe.duration,
        from: 0.05,
        to: 0.7,
        progress: progress,
        budget: budget,
      );
      if (run.isSuccess) {
        await _requireOutput(output);
        return output;
      }
      // A failed copy is retried once as a full encode.
      log?.warning('Media remux failed; falling back to a re-encode.');
    }

    final run = await _execute(
      encodeArguments(sourcePath: job.sourcePath, outputPath: output.path),
      total: probe.duration,
      from: 0.05,
      to: 0.7,
      progress: progress,
      budget: budget,
    );
    if (!run.isSuccess) {
      throw MediaProcessingException(ffmpegErrorReason(run.stderr));
    }
    await _requireOutput(output);
    return output;
  }

  /// Runs one short step and checks that it produced its file.
  Future<void> _run(
    List<String> arguments,
    File expected,
    _Progress progress,
    _Budget budget,
  ) async {
    final run = await _execute(
      arguments,
      total: null,
      from: 0,
      to: 0,
      progress: progress,
      budget: budget,
    );
    if (!run.isSuccess) {
      throw MediaProcessingException(ffmpegErrorReason(run.stderr));
    }
    await _requireOutput(expected);
  }

  Future<FfmpegRun> _execute(
    List<String> arguments, {
    required Duration? total,
    required double from,
    required double to,
    required _Progress progress,
    required _Budget budget,
  }) async {
    _throwIfCancelled();
    final remaining = budget.remaining;
    if (remaining <= Duration.zero) {
      throw const MediaProcessingException(_tooLongMessage);
    }
    final run = await executor.run(
      executable: paths.ffmpeg,
      arguments: arguments,
      timeout: remaining,
      onProgress: (outTime) {
        if (total == null || total <= Duration.zero) return;
        final fraction = outTime.inMicroseconds / total.inMicroseconds;
        progress.fraction(from + (to - from) * fraction.clamp(0.0, 1.0));
      },
    );
    _throwIfCancelled();
    if (run.cancelled) throw const MediaCancelled();
    if (run.timedOut) {
      throw const MediaProcessingException(_tooLongMessage);
    }
    return run;
  }

  /// A step that exits cleanly but leaves no file is still a failure.
  Future<void> _requireOutput(File file) async {
    if (await file.exists() && await file.length() > 0) return;
    throw const MediaProcessingException(
      "Couldn't write temporary files. Check free space and try again.",
    );
  }

  void _throwIfCancelled() {
    if (_cancelled) throw const MediaCancelled();
  }
}

/// The job's wall-clock budget. Every step gets what is left of it.
class _Budget {
  _Budget(this.limit) : _stopwatch = Stopwatch()..start();

  final Duration limit;
  final Stopwatch _stopwatch;

  Duration get remaining {
    final left = limit - _stopwatch.elapsed;
    return left.isNegative ? Duration.zero : left;
  }
}

/// Progress reporting: step boundaries always show up, running updates are
/// throttled so the UI is not flooded.
class _Progress {
  _Progress(this.callback);

  static const Duration _interval = Duration(milliseconds: 250);

  final MediaProgressCallback? callback;
  DateTime _lastUpdate = DateTime.fromMillisecondsSinceEpoch(0);
  double _lastFraction = 0;

  void stage(MediaStage stage, double fraction, String message) {
    final callback = this.callback;
    if (callback == null) return;
    _lastUpdate = DateTime.now();
    _lastFraction = fraction;
    callback(
      MediaProcessingProgress(
        stage: stage,
        fraction: fraction,
        message: message,
      ),
    );
  }

  void fraction(double value) {
    final callback = this.callback;
    if (callback == null) return;
    if (value < _lastFraction) return;
    final now = DateTime.now();
    if (now.difference(_lastUpdate) < _interval) return;
    _lastUpdate = now;
    _lastFraction = value;
    callback(
      MediaProcessingProgress(stage: MediaStage.processing, fraction: value),
    );
  }
}
