import 'package:flowpost_desktop/features/media/data/ffmpeg_runner.dart';
import 'package:flutter_test/flutter_test.dart';

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
}
