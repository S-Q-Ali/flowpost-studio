import 'package:flowpost_desktop/features/media/domain/media_limits.dart';
import 'package:flowpost_desktop/features/media/domain/media_probe.dart';
import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flutter_test/flutter_test.dart';

MediaProbe _probe({
  Duration duration = const Duration(seconds: 2),
  int width = 640,
  int height = 360,
  String? audioCodec = 'aac',
}) {
  return MediaProbe(
    duration: duration,
    width: width,
    height: height,
    videoCodec: 'h264',
    pixelFormat: 'yuv420p',
    fps: 30,
    audioCodec: audioCodec,
  );
}

void main() {
  group('checkMediaLimits', () {
    test('accepts a normal video', () {
      expect(checkMediaLimits(_probe(), kind: MediaKind.video), isNull);
    });

    test('rejects a video longer than three minutes', () {
      final error = checkMediaLimits(
        _probe(duration: const Duration(seconds: 181)),
        kind: MediaKind.video,
      );

      expect(error, isNotNull);
      expect(error!.reason, MediaLimitRejection.tooLong);
      expect(error.message, 'Videos must be 3 minutes or shorter.');
    });

    test('accepts a video of exactly three minutes', () {
      expect(
        checkMediaLimits(
          _probe(duration: const Duration(seconds: 180)),
          kind: MediaKind.video,
        ),
        isNull,
      );
    });

    test('rejects a video with no duration as unreadable', () {
      final error = checkMediaLimits(
        _probe(duration: Duration.zero),
        kind: MediaKind.video,
      );

      expect(error, isNotNull);
      expect(error!.reason, MediaLimitRejection.unreadable);
      expect(error.message, "This file can't be read. It may be damaged.");
    });

    test('rejects a stream with no dimensions', () {
      final error = checkMediaLimits(
        _probe(width: 0, height: 0),
        kind: MediaKind.image,
      );

      expect(error, isNotNull);
      expect(error!.reason, MediaLimitRejection.noVideoTrack);
      expect(error.message, 'No video track found.');
    });

    test('an image has no duration limit', () {
      expect(
        checkMediaLimits(
          _probe(duration: Duration.zero, audioCodec: null),
          kind: MediaKind.image,
        ),
        isNull,
      );
    });
  });
}
