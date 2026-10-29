import 'dart:async';

import 'package:flowpost_desktop/features/media/captions/captions_providers.dart';
import 'package:flowpost_desktop/features/media/captions/data/caption_generator.dart';
import 'package:flowpost_desktop/features/media/captions/data/captions_client.dart';
import 'package:flowpost_desktop/features/media/captions/domain/caption_processing.dart';
import 'package:flowpost_desktop/features/media/domain/media_job.dart';
import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// The generator is faked, so the service must never be reached.
class _UnusedApi implements CaptionsApi {
  @override
  Future<String> transcribe({
    required String audioBase64,
    required String filename,
  }) => throw StateError('The caption service must not be called.');

  @override
  Future<String> describeFrames({required List<String> frames}) =>
      throw StateError('The caption service must not be called.');

  @override
  Future<Map<String, String>> generateCaptions({
    required String systemPrompt,
    required String userMessage,
    List<String> platforms = const [],
  }) => throw StateError('The caption service must not be called.');

  @override
  void cancel() {}
}

/// A generator that answers from memory.
class _FakeGenerator extends CaptionGenerator {
  _FakeGenerator() : super(api: _UnusedApi());

  Object? failure;
  CaptionResult result = const CaptionResult(
    captions: {'tiktok_caption': 'A caption'},
    transcript: 'the words',
    visualDescription: 'the picture',
  );

  List<String> platforms = const [];

  @override
  Future<CaptionResult> generate({
    required MediaJob job,
    List<String> platforms = const [],
    CaptionProgressCallback? onProgress,
  }) async {
    this.platforms = platforms;
    onProgress?.call(
      const CaptionProgress(
        stage: CaptionStage.transcribing,
        fraction: 0.2,
        message: 'Transcribing audio...',
      ),
    );
    if (failure != null) throw failure!;
    return result;
  }
}

/// A generator that never finishes on its own, so the test can drive it.
class _PendingGenerator extends CaptionGenerator {
  _PendingGenerator() : super(api: _UnusedApi());

  final Completer<void> started = Completer();
  final Completer<CaptionResult> completer = Completer();
  int cancelCalls = 0;

  @override
  Future<CaptionResult> generate({
    required MediaJob job,
    List<String> platforms = const [],
    CaptionProgressCallback? onProgress,
  }) {
    onProgress?.call(
      const CaptionProgress(
        stage: CaptionStage.transcribing,
        fraction: 0.2,
        message: 'Transcribing audio...',
      ),
    );
    if (!started.isCompleted) started.complete();
    return completer.future;
  }

  @override
  void cancel() {
    cancelCalls++;
  }
}

const _job = MediaJob(
  id: 'job',
  sourcePath: r'C:\clips\first.mp4',
  displayName: 'first.mp4',
  kind: MediaKind.video,
  sourceBytes: 2048,
  workspacePath: 'job',
  stage: MediaStage.ready,
);

ProviderContainer _container(CaptionGenerator generator) {
  return ProviderContainer(
    overrides: [captionGeneratorProvider.overrideWithValue(generator)],
  );
}

void main() {
  test('a finished run shows the captions', () async {
    final generator = _FakeGenerator();
    final container = _container(generator);
    addTearDown(container.dispose);

    await container.read(captionControllerProvider.notifier).generate(_job);

    final state = container.read(captionControllerProvider);
    expect(state, isA<CaptionReady>());
    expect(
      (state as CaptionReady).result.captions['tiktok_caption'],
      'A caption',
    );
  });

  test('the progress is reported while the run lasts', () async {
    final generator = _FakeGenerator();
    final container = _container(generator);
    addTearDown(container.dispose);
    final states = <CaptionState>[];
    container.listen(captionControllerProvider, (_, next) => states.add(next));

    await container.read(captionControllerProvider.notifier).generate(_job);

    final running = states.whereType<CaptionRunning>().toList();
    expect(running, isNotEmpty);
    expect(running.last.progress.fraction, 0.2);
    expect(running.last.progress.message, 'Transcribing audio...');
  });

  test('the platforms are handed to the generator', () async {
    final generator = _FakeGenerator();
    final container = _container(generator);
    addTearDown(container.dispose);

    await container
        .read(captionControllerProvider.notifier)
        .generate(_job, platforms: ['tiktok', 'youtube_shorts']);

    expect(generator.platforms, ['tiktok', 'youtube_shorts']);
  });

  test('a failure shows the message of the service', () async {
    final generator = _FakeGenerator()
      ..failure = const CaptionException('The caption service said no.');
    final container = _container(generator);
    addTearDown(container.dispose);

    await container.read(captionControllerProvider.notifier).generate(_job);

    final state = container.read(captionControllerProvider);
    expect(state, isA<CaptionFailed>());
    expect((state as CaptionFailed).message, 'The caption service said no.');
  });

  test('an unexpected failure does not show the raw error', () async {
    final generator = _FakeGenerator()
      ..failure = StateError(r'C:\Users\Someone\private\clip.mp4');
    final container = _container(generator);
    addTearDown(container.dispose);

    await container.read(captionControllerProvider.notifier).generate(_job);

    final state = container.read(captionControllerProvider);
    expect(state, isA<CaptionFailed>());
    expect((state as CaptionFailed).message, isNot(contains('private')));
  });

  test('an edited caption is kept and the rest stays', () async {
    final generator = _FakeGenerator()
      ..result = const CaptionResult(
        captions: {
          'tiktok_caption': 'A caption',
          'youtube_shorts_caption': 'B',
        },
        transcript: 'the words',
        visualDescription: 'the picture',
      );
    final container = _container(generator);
    addTearDown(container.dispose);
    final controller = container.read(captionControllerProvider.notifier);

    await controller.generate(_job);
    controller.edit('tiktok_caption', 'My own words');

    final state = container.read(captionControllerProvider) as CaptionReady;
    expect(state.result.captions['tiktok_caption'], 'My own words');
    expect(state.result.captions['youtube_shorts_caption'], 'B');
    expect(state.result.transcript, 'the words');
  });

  test('an edit before the run is ignored', () async {
    final container = _container(_FakeGenerator());
    addTearDown(container.dispose);

    container
        .read(captionControllerProvider.notifier)
        .edit('tiktok_caption', 'My own words');

    expect(container.read(captionControllerProvider), isA<CaptionIdle>());
  });

  test('reset throws the captions away', () async {
    final container = _container(_FakeGenerator());
    addTearDown(container.dispose);
    final controller = container.read(captionControllerProvider.notifier);

    await controller.generate(_job);
    controller.reset();

    expect(container.read(captionControllerProvider), isA<CaptionIdle>());
  });

  test('a cancelled run shows no error', () async {
    final generator = _PendingGenerator();
    final container = _container(generator);
    addTearDown(container.dispose);
    final controller = container.read(captionControllerProvider.notifier);

    final run = controller.generate(_job);
    await generator.started.future;
    controller.cancel();
    // The aborted request fails after the cancel.
    generator.completer.completeError(
      const CaptionException('The request was aborted.'),
    );
    await run;

    expect(generator.cancelCalls, 1);
    expect(container.read(captionControllerProvider), isA<CaptionIdle>());
  });

  test('a cancelled run leaves the progress', () async {
    final generator = _PendingGenerator();
    final container = _container(generator);
    addTearDown(container.dispose);
    final controller = container.read(captionControllerProvider.notifier);

    final run = controller.generate(_job);
    await generator.started.future;
    expect(container.read(captionControllerProvider), isA<CaptionRunning>());

    controller.cancel();

    expect(container.read(captionControllerProvider), isA<CaptionIdle>());
    generator.completer.completeError(
      const CaptionException('The request was aborted.'),
    );
    await run;
  });
}
