import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flowpost_desktop/features/media/data/ffmpeg_runner.dart';
import 'package:flutter_test/flutter_test.dart';

/// A child that runs for about half a minute, so a test can kill it.
const List<String> _longRun = ['/c', 'ping', '-n', '30', '127.0.0.1'];

/// A process the test drives: it writes what it is told and exits when told.
class _FakeProcess implements Process {
  final stdoutController = StreamController<List<int>>();
  final stderrController = StreamController<List<int>>();
  final exit = Completer<int>();
  final _stdin = StreamController<List<int>>();
  bool killed = false;

  @override
  Stream<List<int>> get stdout => stdoutController.stream;

  @override
  Stream<List<int>> get stderr => stderrController.stream;

  @override
  IOSink get stdin => IOSink(_stdin.sink);

  @override
  Future<int> get exitCode => exit.future;

  @override
  int get pid => 4242;

  @override
  bool kill([ProcessSignal signal = ProcessSignal.sigterm]) {
    killed = true;
    return true;
  }
}

void main() {
  group('decodeOutputLines', () {
    test('splits the output into lines', () async {
      final lines = await decodeOutputLines(
        Stream.value('first\nsecond\n'.codeUnits),
      ).toList();

      expect(lines, ['first', 'second']);
    });

    test('malformed bytes do not break the decoder', () async {
      // A file name in a legacy code page is not valid UTF-8, and a decoder
      // error would take the whole job down.
      final lines = await decodeOutputLines(
        Stream.value(<int>[0x41, 0xFF, 0x42]),
      ).toList();

      expect(lines, hasLength(1));
      expect(lines.single, startsWith('A'));
    });
  });

  group('FfmpegRunner', () {
    final runner = FfmpegRunner(ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe');

    test('a run that outruns its timeout is stopped', () async {
      final run = await runner.run(
        executable: 'cmd',
        arguments: _longRun,
        timeout: const Duration(milliseconds: 300),
      );

      expect(run.timedOut, isTrue);
      expect(run.isSuccess, isFalse);
    });

    test('cancelling stops the running process', () async {
      final pending = runner.run(
        executable: 'cmd',
        arguments: _longRun,
        timeout: const Duration(seconds: 30),
      );
      await Future<void>.delayed(const Duration(milliseconds: 300));

      runner.cancel();
      final run = await pending;

      expect(run.cancelled, isTrue);
      expect(run.isSuccess, isFalse);
    });

    test(
      'an executable that does not exist fails instead of throwing',
      () async {
        final run = await runner.run(
          executable: 'flowpost-no-such-program',
          arguments: const [],
        );

        expect(run.failedToStart, isTrue);
        expect(run.isSuccess, isFalse);
      },
    );

    test(
      'the lines still in the pipe when the process exits are read',
      () async {
        final process = _FakeProcess();
        final started = FfmpegRunner(
          ffmpegPath: 'ffmpeg',
          ffprobePath: 'ffprobe',
          start: (_, _) async => process,
        );

        final pending = started.run(executable: 'ffmpeg', arguments: const []);
        await Future<void>.delayed(Duration.zero);

        // The exit reaches the app before the last read off the pipe does.
        process.exit.complete(1);
        await Future<void>.delayed(Duration.zero);
        // FFmpeg writes the reason for a failure without a trailing newline, so
        // the tail only becomes a line when the pipe closes.
        process.stderrController.add(utf8.encode('x1\r\nthe real reason'));
        process.stdoutController.add(utf8.encode('time=00:00:07.00\n'));
        await process.stderrController.close();
        await process.stdoutController.close();

        final run = await pending;

        expect(run.exitCode, 1);
        expect(run.stderr, contains('the real reason'));
        expect(run.stdout, contains('time=00:00:07.00'));
      },
    );

    test('the child still running when the app quits is killed', () async {
      final process = _FakeProcess();
      final started = FfmpegRunner(
        ffmpegPath: 'ffmpeg',
        ffprobePath: 'ffprobe',
        start: (_, _) async => process,
      );
      final pending = started.run(
        executable: 'ffmpeg',
        arguments: const [],
        timeout: const Duration(seconds: 30),
      );
      await Future<void>.delayed(Duration.zero);

      killRunningFfmpeg();
      expect(process.killed, isTrue);

      // The run itself is left to end as any cancelled one does.
      process.exit.complete(-1);
      await process.stdoutController.close();
      await process.stderrController.close();
      expect((await pending).isSuccess, isFalse);
    });

    test('the run that is over is not the one quit kills', () async {
      final finished = _FakeProcess();
      final first = FfmpegRunner(
        ffmpegPath: 'ffmpeg',
        ffprobePath: 'ffprobe',
        start: (_, _) async => finished,
      );
      final done = first.run(executable: 'ffmpeg', arguments: const []);
      await Future<void>.delayed(Duration.zero);
      finished.exit.complete(0);
      await finished.stdoutController.close();
      await finished.stderrController.close();
      await done;

      // The next file gets its own encoder; quit stops that one and does not
      // reach back to a process that is already gone.
      final running = _FakeProcess();
      final second = FfmpegRunner(
        ffmpegPath: 'ffmpeg',
        ffprobePath: 'ffprobe',
        start: (_, _) async => running,
      );
      final pending = second.run(
        executable: 'ffmpeg',
        arguments: const [],
        timeout: const Duration(seconds: 30),
      );
      await Future<void>.delayed(Duration.zero);

      killRunningFfmpeg();

      expect(running.killed, isTrue);
      expect(finished.killed, isFalse);

      running.exit.complete(-1);
      await running.stdoutController.close();
      await running.stderrController.close();
      await pending;
    });
  });
}
