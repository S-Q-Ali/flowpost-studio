import 'dart:io';

import 'package:flowpost_desktop/features/media/captions/data/caption_generator.dart';
import 'package:flowpost_desktop/features/media/captions/data/captions_client.dart';
import 'package:flowpost_desktop/features/media/captions/domain/caption_processing.dart';
import 'package:flowpost_desktop/features/media/domain/media_job.dart';
import 'package:flowpost_desktop/features/media/domain/media_outputs.dart';
import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flutter_test/flutter_test.dart';

/// A caption service that answers from memory.
class _FakeApi implements CaptionsApi {
  String transcript = 'the words';
  String description = 'the picture';
  Map<String, String> captions = {'tiktok_caption': 'A caption'};
  Object? failure;

  int transcribeCalls = 0;
  String? audioBase64;
  String? audioFilename;
  List<String> frames = const [];
  List<String> platforms = const [];
  String? systemPrompt;
  String? userMessage;

  @override
  Future<String> transcribe({
    required String audioBase64,
    required String filename,
  }) async {
    transcribeCalls++;
    this.audioBase64 = audioBase64;
    audioFilename = filename;
    if (failure != null) throw failure!;
    return transcript;
  }

  @override
  Future<String> describeFrames({required List<String> frames}) async {
    this.frames = frames;
    if (failure != null) throw failure!;
    return description;
  }

  @override
  Future<Map<String, String>> generateCaptions({
    required String systemPrompt,
    required String userMessage,
    List<String> platforms = const [],
  }) async {
    this.systemPrompt = systemPrompt;
    this.userMessage = userMessage;
    this.platforms = platforms;
    if (failure != null) throw failure!;
    return captions;
  }

  @override
  void cancel() {}
}

void main() {
  late Directory workspace;

  setUp(() async {
    workspace = await Directory.systemTemp.createTemp('caption_generator');
  });

  tearDown(() async {
    if (await workspace.exists()) await workspace.delete(recursive: true);
  });

  File write(String name, String content) {
    final file = File('${workspace.path}${Platform.pathSeparator}$name');
    file.writeAsStringSync(content);
    return file;
  }

  MediaJob jobWith({File? audio, int frameCount = 2}) {
    final frames = [
      for (var index = 0; index < frameCount; index++)
        write('frame_${index + 1}.jpg', 'frame-$index'),
    ];
    return MediaJob(
      id: '20261029T140503-aaaaaa',
      sourcePath: r'C:\clips\holiday.mp4',
      displayName: 'holiday.mp4',
      kind: MediaKind.video,
      sourceBytes: 1024,
      workspacePath: workspace.path,
      outputs: MediaOutputs(
        thumbnail: write('thumb.jpg', 'thumb'),
        frames: frames,
        normalized: write('normalized.mp4', 'video'),
        audio: audio,
      ),
    );
  }

  test('the transcription is skipped when the source has no audio', () async {
    final api = _FakeApi();

    final result = await CaptionGenerator(api: api).generate(job: jobWith());

    expect(api.transcribeCalls, 0);
    expect(result.transcript, isEmpty);
  });

  test('the audio is sent as base64', () async {
    final api = _FakeApi();
    final audio = write('audio.mp3', 'sound');

    await CaptionGenerator(api: api).generate(job: jobWith(audio: audio));

    expect(api.transcribeCalls, 1);
    expect(api.audioBase64, 'c291bmQ=');
    expect(api.audioFilename, 'audio.mp3');
  });

  test('the frames are sent as base64 data URLs', () async {
    final api = _FakeApi();

    await CaptionGenerator(api: api).generate(job: jobWith());

    expect(api.frames, [
      'data:image/jpeg;base64,ZnJhbWUtMA==',
      'data:image/jpeg;base64,ZnJhbWUtMQ==',
    ]);
  });

  test('the stages are reported in order', () async {
    final stages = <CaptionStage>[];

    await CaptionGenerator(api: _FakeApi()).generate(
      job: jobWith(audio: write('audio.mp3', 'sound')),
      onProgress: (progress) => stages.add(progress.stage),
    );

    expect(stages, [
      CaptionStage.preparing,
      CaptionStage.transcribing,
      CaptionStage.analyzingVisuals,
      CaptionStage.generatingCaptions,
      CaptionStage.done,
    ]);
  });

  test('the progress never goes backwards', () async {
    final fractions = <double>[];

    await CaptionGenerator(api: _FakeApi()).generate(
      job: jobWith(audio: write('audio.mp3', 'sound')),
      onProgress: (progress) => fractions.add(progress.fraction),
    );

    for (var index = 1; index < fractions.length; index++) {
      expect(fractions[index], greaterThanOrEqualTo(fractions[index - 1]));
    }
    expect(fractions.last, 1.0);
  });

  test('the result carries the captions, transcript and description', () async {
    final api = _FakeApi();

    final result = await CaptionGenerator(api: api)
        .generate(job: jobWith(audio: write('audio.mp3', 'sound')));

    expect(result.captions, {'tiktok_caption': 'A caption'});
    expect(result.transcript, 'the words');
    expect(result.visualDescription, 'the picture');
  });

  test(
    'the caption call carries the prompt and the chosen platforms',
    () async {
      final api = _FakeApi();

      await CaptionGenerator(api: api)
          .generate(job: jobWith(), platforms: const ['tiktok']);

      expect(api.platforms, ['tiktok']);
      expect(api.systemPrompt, contains('holiday.mp4'));
      expect(api.userMessage, contains('the picture'));
    },
  );

  test('a failure stops the run and is passed on', () async {
    final api = _FakeApi()
      ..failure = const CaptionException('The service is down.');

    await expectLater(
      CaptionGenerator(api: api).generate(job: jobWith()),
      throwsA(
        isA<CaptionException>().having(
          (error) => error.message,
          'message',
          'The service is down.',
        ),
      ),
    );
  });
}
