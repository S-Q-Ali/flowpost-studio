import 'package:flowpost_desktop/features/media/data/ffmpeg_runner.dart';
import 'package:flutter_test/flutter_test.dart';

/// A child that runs for about half a minute, so a test can kill it.
const List<String> _longRun = ['/c', 'ping', '-n', '30', '127.0.0.1'];

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
  });
}
