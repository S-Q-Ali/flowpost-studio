import 'dart:convert';
import 'dart:io';

import '../../domain/media_job.dart';
import '../domain/caption_processing.dart';
import '../domain/caption_prompt.dart';
import 'captions_client.dart';

/// Runs the three caption steps over one finished media job.
class CaptionGenerator {
  const CaptionGenerator({required this.api});

  final CaptionsApi api;

  /// Aborts the run in flight.
  void cancel() => api.cancel();

  /// Produces the captions for [job].
  ///
  /// The transcription is skipped when the source has no audio, and the
  /// frames are always described, so a silent video still gets captions.
  Future<CaptionResult> generate({
    required MediaJob job,
    List<String> platforms = const [],
    CaptionProgressCallback? onProgress,
  }) async {
    final outputs = job.outputs;
    if (outputs == null) {
      throw const CaptionException('The media is not ready yet.');
    }

    void report(CaptionStage stage, double fraction, String message) {
      onProgress?.call(
        CaptionProgress(stage: stage, fraction: fraction, message: message),
      );
    }

    report(CaptionStage.preparing, 0.05, 'Preparing...');

    String transcript = '';
    final audio = outputs.audio;
    if (audio != null) {
      report(CaptionStage.transcribing, 0.2, 'Transcribing audio...');
      transcript = await api.transcribe(
        audioBase64: await _base64(audio),
        filename: audio.uri.pathSegments.last,
      );
    }

    report(CaptionStage.analyzingVisuals, 0.5, 'Analyzing content...');
    final frames = <String>[];
    for (final frame in outputs.frames) {
      frames.add('data:image/jpeg;base64,${await _base64(frame)}');
    }
    final description = frames.isEmpty
        ? ''
        : await api.describeFrames(frames: frames);

    report(CaptionStage.generatingCaptions, 0.8, 'Creating captions...');
    final captions = await api.generateCaptions(
      systemPrompt: buildSystemPrompt(
        fileName: job.displayName,
        prompt: defaultMasterPrompt,
        platforms: platforms,
      ),
      userMessage: buildUserMessage(
        transcript: transcript,
        visualDescription: description,
      ),
      platforms: platforms,
    );

    report(CaptionStage.done, 1.0, 'Done!');
    return CaptionResult(
      captions: captions,
      transcript: transcript,
      visualDescription: description,
    );
  }
}

/// Reports one step of the caption pipeline.
typedef CaptionProgressCallback = void Function(CaptionProgress progress);

Future<String> _base64(File file) async {
  final bytes = await file.readAsBytes();
  return base64Encode(bytes);
}
