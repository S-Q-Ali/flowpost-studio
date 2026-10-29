import 'dart:io';

import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('mediaKindForPath', () {
    test('maps every supported video extension to MediaKind.video', () {
      for (final extension in ['.mp4', '.m4v', '.mov', '.webm', '.mkv']) {
        expect(mediaKindForPath('clip$extension'), MediaKind.video);
      }
    });

    test('maps every supported image extension to MediaKind.image', () {
      for (final extension in ['.jpg', '.jpeg', '.png', '.webp']) {
        expect(mediaKindForPath('still$extension'), MediaKind.image);
      }
    });

    test('matches the extension case-insensitively', () {
      expect(mediaKindForPath('CLIP.MP4'), MediaKind.video);
      expect(mediaKindForPath('photo.JPG'), MediaKind.image);
    });

    test('returns null for an unsupported extension', () {
      expect(mediaKindForPath('notes.txt'), isNull);
      expect(mediaKindForPath('archive.zip'), isNull);
    });
  });

  group('validateMediaFile', () {
    late Directory tempDir;

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('flowpost_media_test');
    });

    tearDown(() async {
      if (await tempDir.exists()) await tempDir.delete(recursive: true);
    });

    Future<File> write(String name, {int bytes = 32}) async {
      final file = File('${tempDir.path}${Platform.pathSeparator}$name');
      await file.writeAsBytes(List<int>.filled(bytes, 0));
      return file;
    }

    test('accepts a supported video file', () async {
      final file = await write('clip.mp4');

      final result = await validateMediaFile(file);

      expect(result.error, isNull);
      expect(result.kind, MediaKind.video);
      expect(result.bytes, 32);
    });

    test('accepts a supported image file', () async {
      final file = await write('still.png');

      final result = await validateMediaFile(file);

      expect(result.error, isNull);
      expect(result.kind, MediaKind.image);
    });

    test('rejects an unsupported extension', () async {
      final file = await write('notes.txt');

      final result = await validateMediaFile(file);

      expect(result.error?.reason, MediaRejection.unsupportedType);
      expect(result.error?.message, contains('Unsupported file type'));
    });

    test('rejects a file above the size cap', () async {
      final file = await write('big.mp4', bytes: 64);

      final result = await validateMediaFile(file, maxBytes: 32);

      expect(result.error?.reason, MediaRejection.tooLarge);
      expect(result.error?.message, contains('too large'));
    });

    test('rejects an empty file', () async {
      final file = await write('empty.mp4', bytes: 0);

      final result = await validateMediaFile(file);

      expect(result.error?.reason, MediaRejection.empty);
    });

    test('rejects a missing file', () async {
      final missing = File('${tempDir.path}${Platform.pathSeparator}gone.mp4');

      final result = await validateMediaFile(missing);

      expect(result.error?.reason, MediaRejection.unreadable);
      expect(result.error?.message, contains("can't be read"));
    });

    test('rejects a directory', () async {
      final folder = Directory(
        '${tempDir.path}${Platform.pathSeparator}folder.mp4',
      );
      await folder.create();

      final result = await validateMediaFile(folder);

      expect(result.error?.reason, MediaRejection.unreadable);
    });
  });
}
