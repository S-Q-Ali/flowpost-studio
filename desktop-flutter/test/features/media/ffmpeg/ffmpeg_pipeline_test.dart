import 'dart:convert';
import 'dart:io';

import 'package:flowpost_desktop/features/media/data/ffmpeg_paths.dart';
import 'package:flowpost_desktop/features/media/data/ffmpeg_runner.dart';
import 'package:flowpost_desktop/features/media/data/media_processor.dart';
import 'package:flowpost_desktop/features/media/domain/ffmpeg_plan.dart';
import 'package:flowpost_desktop/features/media/domain/media_job.dart';
import 'package:flowpost_desktop/features/media/domain/media_probe.dart';
import 'package:flowpost_desktop/features/media/domain/media_processing.dart';
import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

/// These tests run the real bundled FFmpeg against the committed fixtures and
/// compare the result with `test/fixtures/media/expected.json`.
void main() {
  late FfmpegPaths paths;
  late FfmpegRunner runner;
  late Directory workspace;

  final expected = jsonDecode(
    File(p.join('test', 'fixtures', 'media', 'expected.json'))
        .readAsStringSync(),
  ) as Map<String, dynamic>;

  setUpAll(() async {
    final located = await FfmpegPaths.locate();
    if (located == null) {
      fail(
        'FFmpeg was not found.\n'
        'Run desktop-flutter/tool/fetch_ffmpeg.ps1, or point '
        'FLOWPOST_FFMPEG_DIR at the folder that holds ffmpeg.exe and '
        'ffprobe.exe.',
      );
    }
    paths = located;
    runner = FfmpegRunner(ffmpegPath: paths.ffmpeg, ffprobePath: paths.ffprobe);
    workspace = await Directory.systemTemp.createTemp('flowpost-ffmpeg-it');
  });

  tearDownAll(() async {
    if (await workspace.exists()) {
      await workspace.delete(recursive: true);
    }
  });

  double tolerance() =>
      (expected['durationToleranceSeconds'] as num).toDouble();

  String fixturePath(String name) =>
      File(p.join('test', 'fixtures', 'media', name)).absolute.path;

  Future<MediaJob> runPipeline(String name) async {
    final source = File(fixturePath(name));
    final jobDirectory = await workspace.createTemp('job-');
    final processor = FfmpegMediaProcessor(executor: runner, paths: paths);
    return processor.process(
      MediaJob(
        id: 'integration',
        sourcePath: source.path,
        displayName: name,
        kind: mediaKindForPath(source.path)!,
        sourceBytes: await source.length(),
        workspacePath: jobDirectory.path,
      ),
    );
  }

  Future<MediaProbe> probeOf(String path) async {
    final run = await runner.run(
      executable: paths.ffprobe,
      arguments: probeArguments(path),
    );
    expect(run.exitCode, 0, reason: 'ffprobe failed for the fixture');
    return parseProbeJson(run.stdout);
  }

  group('probe', () {
    final fixtures = expected['fixtures'] as Map<String, dynamic>;

    fixtures.forEach((name, spec) {
      final specMap = spec as Map<String, dynamic>;
      if (specMap['kind'] == 'invalid') return;

      test('$name probes to the expected values', () async {
        final path = fixturePath(name);
        expect(await File(path).length(), specMap['bytes']);

        final probe = await probeOf(path);
        final probeSpec = specMap['probe'] as Map<String, dynamic>;

        expect(probe.width, probeSpec['width']);
        expect(probe.height, probeSpec['height']);
        expect(probe.videoCodec, probeSpec['videoCodec']);
        expect(probe.pixelFormat, probeSpec['pixelFormat']);

        if (probeSpec.containsKey('durationSeconds')) {
          expect(
            probe.duration.inMilliseconds / 1000,
            closeTo(
              (probeSpec['durationSeconds'] as num).toDouble(),
              tolerance(),
            ),
          );
        }
        if (probeSpec.containsKey('fps')) {
          expect(
            probe.fps,
            closeTo((probeSpec['fps'] as num).toDouble(), 0.01),
          );
        }
        if (probeSpec.containsKey('audioCodec')) {
          expect(probe.audioCodec, probeSpec['audioCodec']);
          expect(probe.audioSampleRate, probeSpec['audioSampleRate']);
          expect(probe.audioChannels, probeSpec['audioChannels']);
        }
        if (probeSpec.containsKey('hasAudio')) {
          expect(probe.hasAudio, probeSpec['hasAudio']);
        }
      });
    });
  });

  group('rejections', () {
    test('a corrupt file is rejected with a readable message', () async {
      final run = await runner.run(
        executable: paths.ffprobe,
        arguments: probeArguments(fixturePath('corrupt.mp4')),
      );
      expect(run.exitCode, 1);

      await expectLater(
        runPipeline('corrupt.mp4'),
        throwsA(
          isA<MediaProcessingException>().having(
            (error) => error.message,
            'message',
            "This file can't be read. It may be damaged.",
          ),
        ),
      );
    });

    test('an unsupported extension is rejected before any work', () {
      expect(mediaKindForPath(fixturePath('unsupported.txt')), isNull);
    });
  });

  group('pipeline', () {
    final normalizations = expected['normalization'] as Map<String, dynamic>;
    final frames = expected['frames'] as Map<String, dynamic>;
    final audios = expected['audio'] as Map<String, dynamic>;
    final thumbnail = expected['thumbnail'] as Map<String, dynamic>;

    final names = <String>{
      ...normalizations.keys,
      ...frames.keys,
      ...audios.keys,
    };

    for (final name in names) {
      test('$name produces the expected outputs', () async {
        final result = await runPipeline(name);
        expect(result.stage, MediaStage.ready);

        final normalization = normalizations[name];
        if (normalization is Map<String, dynamic>) {
          final normalized = result.outputs!.normalized!;
          expect(await normalized.exists(), isTrue);
          final probe = await probeOf(normalized.absolute.path);
          final videoSpec = normalization['video'] as Map<String, dynamic>;

          expect(probe.videoCodec, videoSpec['codec']);
          expect(probe.pixelFormat, videoSpec['pixelFormat']);
          expect(probe.width, videoSpec['width']);
          expect(probe.height, videoSpec['height']);
          expect(
            probe.duration.inMilliseconds / 1000,
            closeTo(
              (videoSpec['durationSeconds'] as num).toDouble(),
              tolerance(),
            ),
          );

          final audioSpec = normalization['audio'] as Map<String, dynamic>;
          expect(probe.audioCodec, audioSpec['codec']);
          expect(probe.audioSampleRate, audioSpec['sampleRate']);
        } else {
          expect(result.outputs!.normalized, isNull);
        }

        final thumbnailFile = result.outputs!.thumbnail;
        expect(await thumbnailFile.exists(), isTrue);
        expect(
          await thumbnailFile.length(),
          lessThanOrEqualTo(thumbnail['maxBytes'] as int),
        );
        final thumbnailProbe = await probeOf(thumbnailFile.absolute.path);
        expect(thumbnailProbe.width, thumbnail['width']);
        expect(thumbnailProbe.height, thumbnail['height']);

        final frameSpec = frames[name];
        if (frameSpec is Map<String, dynamic>) {
          final produced = result.outputs!.frames;
          expect(produced, hasLength(frameSpec['count'] as int));

          for (final frame in produced) {
            expect(await frame.exists(), isTrue);
            expect(
              await frame.length(),
              lessThanOrEqualTo(frameSpec['maxBytes'] as int),
            );
            final frameProbe = await probeOf(frame.absolute.path);
            expect(frameProbe.width, frameSpec['width']);
            expect(frameProbe.height, frameSpec['height']);
          }

          final bytes = await Future.wait(
            produced.map((frame) => frame.readAsBytes()),
          );
          final distinct = bytes.map(_digest).toSet().length;
          expect(distinct, frameSpec['distinct'] == true ? greaterThan(1) : 1);
        }

        final audioSpec = audios[name];
        if (audioSpec is Map<String, dynamic>) {
          final audio = result.outputs!.audio!;
          expect(await audio.exists(), isTrue);
          expect(
            await audio.length(),
            lessThanOrEqualTo(audioSpec['maxBytes'] as int),
          );
          final audioRun = await runner.run(
            executable: paths.ffprobe,
            arguments: probeArguments(audio.absolute.path),
          );
          expect(audioRun.exitCode, 0);
          final audioProbe = parseAudioProbeJson(audioRun.stdout);
          expect(audioProbe.codec, audioSpec['format']);
          expect(audioProbe.sampleRate, audioSpec['sampleRate']);
          expect(audioProbe.channels, audioSpec['channels']);
          expect(
            audioProbe.duration.inMilliseconds / 1000,
            closeTo(
              (audioSpec['durationSeconds'] as num).toDouble(),
              tolerance(),
            ),
          );
        } else {
          expect(result.outputs!.audio, isNull);
        }
      });
    }
  });

  test('a unicode path is processed like any other', () async {
    final result = await runPipeline('still ünicode space.png');

    expect(result.stage, MediaStage.ready);
    expect(result.outputs!.frames, hasLength(1));
    expect(await result.outputs!.thumbnail.exists(), isTrue);
  });
}

String _digest(List<int> bytes) {
  var hash = 0;
  for (final byte in bytes) {
    hash = (hash * 31 + byte) & 0x7fffffff;
  }
  return hash.toRadixString(16);
}
