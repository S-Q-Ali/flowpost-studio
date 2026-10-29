import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../domain/ffmpeg_progress.dart';

/// The outcome of one FFmpeg invocation.
class FfmpegRun {
  const FfmpegRun({
    required this.exitCode,
    required this.stdout,
    required this.stderr,
    this.timedOut = false,
    this.cancelled = false,
    this.failedToStart = false,
  });

  final int exitCode;
  final String stdout;
  final String stderr;
  final bool timedOut;
  final bool cancelled;

  /// True when the process could not be started at all — a broken install
  /// rather than a file FFmpeg disliked.
  final bool failedToStart;

  bool get isSuccess =>
      exitCode == 0 && !timedOut && !cancelled && !failedToStart;
}

/// Runs one FFmpeg or ffprobe process.
///
/// The pipeline depends on this seam rather than on the process itself, so a
/// test can drive every step without spawning FFmpeg.
abstract interface class FfmpegExecutor {
  Future<FfmpegRun> run({
    required String executable,
    required List<String> arguments,
    Duration? timeout,
    void Function(Duration outTime)? onProgress,
  });

  /// Stops the running process.
  void cancel();
}

/// Decodes FFmpeg output into lines.
///
/// FFmpeg can echo bytes that are not valid UTF-8 (a file name in a legacy
/// code page), and a decoder error would take the whole job down, so the
/// malformed bytes are replaced instead of thrown.
Stream<String> decodeOutputLines(Stream<List<int>> bytes) => bytes
    .transform(const Utf8Decoder(allowMalformed: true))
    .transform(const LineSplitter());

/// Runs the bundled FFmpeg as a separate process.
///
/// Arguments are always passed as a list, never through a shell, so a path
/// with spaces or quotes cannot turn into another command. One run at a time:
/// the media pipeline processes a single job.
class FfmpegRunner implements FfmpegExecutor {
  FfmpegRunner({required this.ffmpegPath, required this.ffprobePath});

  final String ffmpegPath;
  final String ffprobePath;

  static const Duration defaultTimeout = Duration(minutes: 10);
  static const int _maxStdoutChars = 1024 * 1024;
  static const int _maxStderrChars = 64 * 1024;

  Process? _active;
  bool _cancelRequested = false;

  @override
  Future<FfmpegRun> run({
    required String executable,
    required List<String> arguments,
    Duration? timeout,
    void Function(Duration outTime)? onProgress,
  }) async {
    _cancelRequested = false;
    final stdoutBuffer = StringBuffer();
    final stderrBuffer = StringBuffer();

    final Process process;
    try {
      process = await Process.start(executable, arguments);
    } on ProcessException catch (error) {
      return FfmpegRun(
        exitCode: -1,
        stdout: '',
        stderr: error.message,
        failedToStart: true,
      );
    }
    _active = process;
    if (_cancelRequested) process.kill();

    final outDone = decodeOutputLines(process.stdout).listen((line) {
      if (stdoutBuffer.length < _maxStdoutChars) stdoutBuffer.writeln(line);
      final outTime = parseProgressOutTime(line);
      if (outTime != null) onProgress?.call(outTime);
    });
    final errDone = decodeOutputLines(process.stderr).listen((line) {
      if (stderrBuffer.length < _maxStderrChars) stderrBuffer.writeln(line);
    });

    var timedOut = false;
    int exitCode;
    try {
      exitCode = await process.exitCode.timeout(
        timeout ?? defaultTimeout,
        onTimeout: () {
          timedOut = true;
          process.kill();
          return -1;
        },
      );
    } on TimeoutException {
      timedOut = true;
      process.kill();
      exitCode = await process.exitCode;
    } finally {
      _active = null;
    }
    await outDone.cancel();
    await errDone.cancel();

    return FfmpegRun(
      exitCode: exitCode,
      stdout: stdoutBuffer.toString(),
      stderr: stderrBuffer.toString(),
      timedOut: timedOut,
      cancelled: _cancelRequested,
    );
  }

  /// Stops the running process and waits for it to exit, so no FFmpeg
  /// process outlives the job that started it.
  @override
  void cancel() {
    _cancelRequested = true;
    _active?.kill();
  }
}
