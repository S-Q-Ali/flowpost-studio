import 'package:flowpost_desktop/features/media/domain/media_probe.dart';
import 'package:flutter_test/flutter_test.dart';

const String _portraitMp4Probe = '''
{
  "streams": [
    {
      "index": 0,
      "codec_name": "h264",
      "codec_type": "video",
      "width": 1080,
      "height": 1920,
      "pix_fmt": "yuv420p",
      "r_frame_rate": "30/1",
      "avg_frame_rate": "30/1",
      "duration": "2.000000"
    },
    {
      "index": 1,
      "codec_name": "aac",
      "codec_type": "audio",
      "sample_rate": "48000",
      "channels": 1,
      "duration": "2.000000"
    }
  ],  "format": {
    "duration": "2.000000",
    "size": "623666",
    "bit_rate": "2494664"
  }
}
''';

const String _stillPngProbe = '''
{
  "streams": [
    {
      "index": 0,
      "codec_name": "png",
      "codec_type": "video",
      "width": 640,
      "height": 360,
      "pix_fmt": "rgb24",
      "r_frame_rate": "25/1",
      "avg_frame_rate": "25/1"
    }
  ],
  "format": {
    "size": "1509"
  }
}
''';

void main() {
  group('parseProbeJson', () {
    test('reads duration, dimensions, codecs and frame rate', () {
      final probe = parseProbeJson(_portraitMp4Probe);

      expect(probe.duration, const Duration(seconds: 2));
      expect(probe.width, 1080);
      expect(probe.height, 1920);
      expect(probe.videoCodec, 'h264');
      expect(probe.pixelFormat, 'yuv420p');
      expect(probe.fps, 30);
      expect(probe.audioCodec, 'aac');
      expect(probe.audioSampleRate, 48000);
      expect(probe.audioChannels, 1);
      expect(probe.bitrate, 2494664);
      expect(probe.hasAudio, isTrue);
    });

    test('a still image has no duration and no audio', () {
      final probe = parseProbeJson(_stillPngProbe);

      expect(probe.duration, Duration.zero);
      expect(probe.width, 640);
      expect(probe.height, 360);
      expect(probe.videoCodec, 'png');
      expect(probe.pixelFormat, 'rgb24');
      expect(probe.audioCodec, isNull);
      expect(probe.audioSampleRate, isNull);
      expect(probe.audioChannels, isNull);
      expect(probe.hasAudio, isFalse);
    });

    test('throws when the file carries no video stream', () {
      const json = '''
{
  "streams": [
    { "index": 0, "codec_name": "aac", "codec_type": "audio" }
  ],
  "format": { "duration": "2.000000" }
}
''';

      expect(
        () => parseProbeJson(json),
        throwsA(
          isA<MediaProbeException>().having(
            (error) => error.message,
            'message',
            'No video track found.',
          ),
        ),
      );
    });

    test('throws when the output is not JSON', () {
      expect(
        () => parseProbeJson('not json'),
        throwsA(isA<MediaProbeException>()),
      );
    });

    test('an unreadable frame rate becomes zero', () {
      const json = '''
{
  "streams": [
    {
      "codec_type": "video",
      "width": 320,
      "height": 240,
      "avg_frame_rate": "0/0",
      "r_frame_rate": "0/0"
    }
  ],
  "format": { "duration": "1.000000" }
}
''';

      expect(parseProbeJson(json).fps, 0);
    });

    test('missing dimensions become zero instead of throwing', () {
      const json = '''
{
  "streams": [
    { "codec_type": "video" }
  ],
  "format": {}
}
''';

      final probe = parseProbeJson(json);
      expect(probe.width, 0);
      expect(probe.height, 0);
      expect(probe.duration, Duration.zero);
    });
  });

  group('parseAudioProbeJson', () {
    test('reads the codec, sample rate and channels', () {
      const json = '''
{
  "streams": [
    {
      "codec_name": "mp3",
      "codec_type": "audio",
      "sample_rate": "16000",
      "channels": 1,
      "duration": "2.000000"
    }
  ],
  "format": { "duration": "2.000000" }
}
''';

      final probe = parseAudioProbeJson(json);

      expect(probe.codec, 'mp3');
      expect(probe.sampleRate, 16000);
      expect(probe.channels, 1);
      expect(probe.duration, const Duration(seconds: 2));
    });

    test('throws when the file carries no audio stream', () {
      const json = '''
{
  "streams": [
    { "codec_name": "h264", "codec_type": "video" }
  ],
  "format": {}
}
''';

      expect(
        () => parseAudioProbeJson(json),
        throwsA(
          isA<MediaProbeException>().having(
            (error) => error.message,
            'message',
            'No audio track found.',
          ),
        ),
      );
    });
  });
}
