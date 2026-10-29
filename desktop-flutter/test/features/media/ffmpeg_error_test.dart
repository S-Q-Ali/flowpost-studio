import 'package:flowpost_desktop/features/media/domain/ffmpeg_error.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ffmpegErrorReason', () {
    test('drops the library prefix and keeps the reason', () {
      const stderr = '''
Input #0, mov,mp4,m4a, from 'C:\\Users\\Someone\\clips\\bad.mp4':
[lib @ 0x00007f9c] Error opening input: Invalid data found when processing input
''';

      final reason = ffmpegErrorReason(stderr);

      expect(
        reason,
        'Error opening input: Invalid data found when processing input',
      );
    });

    test('never leaks an absolute path', () {
      const stderr =
          '[lib @ 0x1] Permission denied\nC:\\Users\\Someone\\Videos\\clip.mp4';

      final reason = ffmpegErrorReason(stderr);

      expect(reason, isNot(contains('C:')));
      expect(reason, isNot(contains('Someone')));
      expect(reason, isNotEmpty);
    });

    test('replaces a quoted path', () {
      const stderr = '[lib @ 0x1] Could not open "C:\\clips\\clip.mp4"';

      expect(ffmpegErrorReason(stderr), isNot(contains('C:')));
    });

    test('masks a path that contains a space', () {
      const stderr =
          '[lib @ 0x1] Permission denied\nC:\\Users\\Jane Doe\\clips\\clip.mp4';

      final reason = ffmpegErrorReason(stderr);

      expect(reason, isNot(contains('Jane')));
      expect(reason, isNot(contains('Doe')));
      expect(reason, isNot(contains('clip.mp4')));
    });

    test('masks the source path the job knows about', () {
      const stderr =
          "[mov,mp4] Could not open 'C:\\Users\\Jane Doe\\clips\\clip.mp4'";

      final reason = ffmpegErrorReason(
        stderr,
        sourcePath: r'C:\Users\Jane Doe\clips\clip.mp4',
      );

      expect(reason, isNot(contains('Jane')));
      expect(reason, isNot(contains('clip.mp4')));
    });

    test('drops the control characters a file name could carry', () {
      final stderr =
          '[lib @ 0x1] Error opening input: Invalid${String.fromCharCode(7)} data';

      final reason = ffmpegErrorReason(stderr);

      expect(reason, isNot(contains(String.fromCharCode(7))));
      expect(reason, contains('Error opening input'));
    });

    test('falls back to a readable message when stderr is empty', () {
      expect(ffmpegErrorReason(''), 'The file could not be processed.');
    });
  });
}
