/// The stages the caption pipeline goes through (SPEC-media "Captions
/// contract").
enum CaptionStage {
  preparing,
  transcribing,
  analyzingVisuals,
  generatingCaptions,
  done,
}

/// One progress update for the caption pipeline.
class CaptionProgress {
  const CaptionProgress({
    required this.stage,
    required this.fraction,
    required this.message,
  });

  final CaptionStage stage;

  /// How far along the pipeline is, from 0 to 1.
  final double fraction;

  final String message;
}

/// A caption step failed in a way the user can act on.
class CaptionException implements Exception {
  const CaptionException(this.message);

  final String message;

  @override
  String toString() => 'CaptionException: $message';
}

/// What the caption pipeline produced.
class CaptionResult {
  const CaptionResult({
    required this.captions,
    required this.transcript,
    required this.visualDescription,
  });

  /// The caption for each key, such as `tiktok_caption`.
  final Map<String, String> captions;

  final String transcript;

  final String visualDescription;
}
