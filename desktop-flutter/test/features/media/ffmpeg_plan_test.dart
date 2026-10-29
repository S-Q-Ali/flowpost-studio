import 'package:flowpost_desktop/features/media/domain/ffmpeg_plan.dart';
import 'package:flowpost_desktop/features/media/domain/media_probe.dart';
import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flutter_test/flutter_test.dart';

MediaProbe _probe({
  String videoCodec = 'h264',
  String pixelFormat = 'yuv420p',
  String? audioCodec = 'aac',
  int width = 1080,
  int height = 1920,
}) {
  return MediaProbe(
    duration: const Duration(seconds: 2),
    width: width,
    height: height,
    videoCodec: videoCodec,
    pixelFormat: pixelFormat,
    fps: 30,
    audioCodec: audioCodec,
  );
}

void main() {
  group('canRemux', () {
    test('a compliant mp4 is copied instead of re-encoded', () {
      expect(
        canRemux(
          kind: MediaKind.video,
          sourcePath: r'C:\clips\portrait.mp4',
          probe: _probe(),
        ),
        isTrue,
      );
    });

    test('mov and m4v are copied too', () {
      for (final path in [r'C:\clips\a.mov', r'C:\clips\a.m4v']) {
        expect(
          canRemux(kind: MediaKind.video, sourcePath: path, probe: _probe()),
          isTrue,
          reason: path,
        );
      }
    });

    test('a webm container is re-encoded', () {
      expect(
        canRemux(
          kind: MediaKind.video,
          sourcePath: r'C:\clips\a.webm',
          probe: _probe(),
        ),
        isFalse,
      );
    });

    test('a non-h264 video is re-encoded', () {
      expect(
        canRemux(
          kind: MediaKind.video,
          sourcePath: r'C:\clips\a.mp4',
          probe: _probe(videoCodec: 'vp9'),
        ),
        isFalse,
      );
    });

    test('a non-aac audio track forces a re-encode', () {
      expect(
        canRemux(
          kind: MediaKind.video,
          sourcePath: r'C:\clips\a.mp4',
          probe: _probe(audioCodec: 'opus'),
        ),
        isFalse,
      );
    });

    test('a silent video is still copied', () {
      expect(
        canRemux(
          kind: MediaKind.video,
          sourcePath: r'C:\clips\a.mp4',
          probe: _probe(audioCodec: null),
        ),
        isTrue,
      );
    });

    test('a video wider than 1920 pixels is re-encoded', () {
      expect(
        canRemux(
          kind: MediaKind.video,
          sourcePath: r'C:\clips\a.mp4',
          probe: _probe(width: 3840, height: 2160),
        ),
        isFalse,
      );
    });

    test('an image is never remuxed', () {
      expect(
        canRemux(
          kind: MediaKind.image,
          sourcePath: r'C:\clips\a.mp4',
          probe: _probe(),
        ),
        isFalse,
      );
    });
  });

  group('frameTimestamps', () {
    test('a six second clip yields two, three and four seconds', () {
      expect(frameTimestamps(const Duration(seconds: 6)), const [
        Duration(seconds: 2),
        Duration(seconds: 3),
        Duration(seconds: 4),
      ]);
    });

    test('a two second clip yields the same timestamp three times', () {
      expect(frameTimestamps(const Duration(seconds: 2)), const [
        Duration(seconds: 1),
        Duration(seconds: 1),
        Duration(seconds: 1),
      ]);
    });

    test('a long clip keeps the tail two seconds from the end', () {
      expect(frameTimestamps(const Duration(seconds: 10)), const [
        Duration(seconds: 2),
        Duration(seconds: 5),
        Duration(seconds: 8),
      ]);
    });

    test('an image produces a single frame at zero', () {
      expect(
        frameTimestampsForKind(MediaKind.image, const Duration(seconds: 6)),
        const [Duration.zero],
      );
    });

    test('a video produces three frames', () {
      expect(
        frameTimestampsForKind(MediaKind.video, const Duration(seconds: 6)),
        hasLength(3),
      );
    });
  });

  group('thumbnailTimestamp', () {
    test('a clip longer than two seconds is sampled at one second', () {
      expect(
        thumbnailTimestamp(const Duration(seconds: 6)),
        const Duration(seconds: 1),
      );
    });

    test('a short clip is sampled at half its length', () {
      expect(
        thumbnailTimestamp(const Duration(milliseconds: 500)),
        const Duration(milliseconds: 250),
      );
    });
  });

  group('argument builders', () {
    test('every command restricts protocols and never uses a shell', () {
      final commands = [
        remuxArguments(
          sourcePath: r'C:\clips\a.mp4',
          outputPath: r'C:\jobs\1\normalized.mp4',
        ),
        encodeArguments(
          sourcePath: r'C:\clips\a.webm',
          outputPath: r'C:\jobs\1\normalized.mp4',
        ),
        thumbnailArguments(
          sourcePath: r'C:\clips\a.mp4',
          outputPath: r'C:\jobs\1\thumb.jpg',
          at: const Duration(seconds: 1),
        ),
        frameArguments(
          sourcePath: r'C:\clips\a.mp4',
          outputPath: r'C:\jobs\1\frame_1.jpg',
          at: const Duration(seconds: 1),
        ),
        audioArguments(
          sourcePath: r'C:\clips\a.mp4',
          outputPath: r'C:\jobs\1\audio.mp3',
        ),
      ];

      for (final command in commands) {
        expect(command, containsAllInOrder(['-hide_banner', '-nostdin', '-y']));
        expect(command, containsAllInOrder(['-protocol_whitelist', 'file']));
        expect(command.any((argument) => argument.contains('&&')), isFalse);
        expect(command.any((argument) => argument.contains('|')), isFalse);
        expect(command.any((argument) => argument.contains(';')), isFalse);
      }
    });

    test('the remux copies streams and starts the file early', () {
      final command = remuxArguments(
        sourcePath: r'C:\clips\a.mp4',
        outputPath: r'C:\jobs\1\normalized.mp4',
      );

      expect(command, containsAllInOrder(['-c', 'copy']));
      expect(command, containsAllInOrder(['-movflags', '+faststart']));
      expect(command.last, r'C:\jobs\1\normalized.mp4');
    });

    test('the encode uses libopenh264 with the spec bitrate', () {
      final command = encodeArguments(
        sourcePath: r'C:\clips\a.webm',
        outputPath: r'C:\jobs\1\normalized.mp4',
      );

      expect(command, containsAllInOrder(['-c:v', 'libopenh264']));
      expect(command, containsAllInOrder(['-b:v', '4M']));
      expect(command, containsAllInOrder(['-pix_fmt', 'yuv420p']));
      expect(command, containsAllInOrder(['-c:a', 'aac']));
      expect(command, containsAllInOrder(['-ar', '48000']));
      expect(command, containsAllInOrder(['-movflags', '+faststart']));
    });

    test('the thumbnail is letterboxed into 640 by 360', () {
      final command = thumbnailArguments(
        sourcePath: r'C:\clips\a.mp4',
        outputPath: r'C:\jobs\1\thumb.jpg',
        at: const Duration(seconds: 1),
      );

      expect(command, containsAllInOrder(['-frames:v', '1']));
      expect(
        command,
        containsAllInOrder([
          '-vf',
          'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black',
        ]),
      );
    });

    test('a frame keeps its aspect ratio with a 640 pixel longest side', () {
      final command = frameArguments(
        sourcePath: r'C:\clips\a.mp4',
        outputPath: r'C:\jobs\1\frame_1.jpg',
        at: const Duration(seconds: 1),
      );

      expect(
        command,
        containsAllInOrder([
          '-vf',
          'scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2',
        ]),
      );
    });

    test('the audio is mono 16 kHz mp3 at 32 kbps', () {
      final command = audioArguments(
        sourcePath: r'C:\clips\a.mp4',
        outputPath: r'C:\jobs\1\audio.mp3',
      );

      expect(command, containsAllInOrder(['-c:a', 'libmp3lame']));
      expect(command, containsAllInOrder(['-b:a', '32k']));
      expect(command, containsAllInOrder(['-ar', '16000']));
      expect(command, containsAllInOrder(['-ac', '1']));
      expect(command, containsAllInOrder(['-vn']));
    });

    test('a still image is read whole instead of being seeked', () {
      final thumbnail = thumbnailArguments(
        sourcePath: r'C:\clips\a.png',
        outputPath: r'C:\jobs\1\thumb.jpg',
        at: null,
      );
      final frame = frameArguments(
        sourcePath: r'C:\clips\a.png',
        outputPath: r'C:\jobs\1\frame_1.jpg',
        at: null,
      );

      expect(thumbnail, isNot(contains('-ss')));
      expect(frame, isNot(contains('-ss')));
    });

    test('the probe reads streams as json without touching the network', () {
      final command = probeArguments(r'C:\clips\a.mp4');

      expect(command, containsAllInOrder(['-print_format', 'json']));
      expect(command, containsAllInOrder(['-show_streams']));
      expect(command, containsAllInOrder(['-protocol_whitelist', 'file']));
      expect(command.last, r'C:\clips\a.mp4');
    });
  });
}
