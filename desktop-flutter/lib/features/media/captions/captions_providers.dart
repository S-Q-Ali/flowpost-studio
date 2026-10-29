import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';

import '../../../core/providers/app_providers.dart';
import '../domain/media_job.dart';
import 'data/caption_generator.dart';
import 'data/captions_client.dart';
import 'domain/caption_processing.dart';

/// The session token the caption service is called with.
///
/// Null until the identity module exists, so the caption action stays
/// disabled with the sign-in hint.
final captionTokenProvider = Provider<String?>((ref) => null);

final captionsClientProvider = Provider<CaptionsClient>((ref) {
  final config = ref.watch(appConfigProvider);
  return CaptionsClient(
    endpoint: Uri.parse(
      '${config.supabaseUrl}/functions/v1/generate-ai-captions',
    ),
    token: ref.watch(captionTokenProvider),
  );
});

final captionGeneratorProvider = Provider<CaptionGenerator>((ref) {
  return CaptionGenerator(api: ref.watch(captionsClientProvider));
});

sealed class CaptionState {
  const CaptionState();
}

class CaptionIdle extends CaptionState {
  const CaptionIdle();
}

class CaptionRunning extends CaptionState {
  const CaptionRunning(this.progress);

  final CaptionProgress progress;
}

class CaptionReady extends CaptionState {
  const CaptionReady(this.result);

  final CaptionResult result;
}

class CaptionFailed extends CaptionState {
  const CaptionFailed(this.message);

  final String message;
}

final captionControllerProvider =
    NotifierProvider<CaptionController, CaptionState>(CaptionController.new);

class CaptionController extends Notifier<CaptionState> {
  static final Logger _log = Logger('captions');

  /// The run that owns the state. A newer run or a cancel takes over, and
  /// the run that lost it writes nothing.
  int _run = 0;

  @override
  CaptionState build() => const CaptionIdle();

  /// Creates the captions for a finished media job.
  Future<void> generate(
    MediaJob job, {
    List<String> platforms = const [],
  }) async {
    final run = ++_run;
    state = const CaptionRunning(
      CaptionProgress(
        stage: CaptionStage.preparing,
        fraction: 0,
        message: 'Preparing...',
      ),
    );
    try {
      final result = await ref
          .read(captionGeneratorProvider)
          .generate(
            job: job,
            platforms: platforms,
            onProgress: (progress) {
              if (run == _run) state = CaptionRunning(progress);
            },
          );
      if (run != _run) return;
      state = CaptionReady(result);
    } on CaptionException catch (error) {
      if (run != _run) return;
      state = CaptionFailed(error.message);
      _log.warning('The caption run failed: ${error.message}');
    } on Object catch (error, stackTrace) {
      if (run != _run) return;
      state = const CaptionFailed(
        'Something went wrong while creating the captions.',
      );
      // The type and the stack trace are logged, never the message: a
      // message can carry the path of the user's file.
      _log.severe(
        'The caption run failed unexpectedly (${error.runtimeType}).',
        null,
        stackTrace,
      );
    }
  }

  /// Stops the run in flight.
  void cancel() {
    _run++;
    state = const CaptionIdle();
    ref.read(captionGeneratorProvider).cancel();
  }

  /// Keeps an edited caption.
  void edit(String key, String value) {
    final state = this.state;
    if (state is! CaptionReady) return;
    final captions = Map<String, String>.from(state.result.captions);
    captions[key] = value;
    this.state = CaptionReady(
      CaptionResult(
        captions: captions,
        transcript: state.result.transcript,
        visualDescription: state.result.visualDescription,
      ),
    );
  }

  /// Throws the captions away, for instance when another file is picked.
  void reset() {
    state = const CaptionIdle();
  }
}
