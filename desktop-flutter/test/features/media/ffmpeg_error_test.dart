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

    test('falls back to a readable message when stderr is empty', () {
      expect(ffmpegErrorReason(''), 'The file could not be processed.');
    });
  });
}
