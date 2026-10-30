import 'media_job.dart';

/// One progress update for the running pipeline.
class MediaProcessingProgress {
  const MediaProcessingProgress({
    required this.stage,
    required this.fraction,
    this.message,
  });

  final MediaStage stage;

  /// How far along the job is, from 0 to 1.
  final double fraction;

  final String? message;
}

/// A processing step failed in a way the user can act on.
class MediaProcessingException implements Exception {
  const MediaProcessingException(this.message);

  final String message;

  @override
  String toString() => 'MediaProcessingException: $message';
}

/// The user cancelled the job.
class MediaCancelled implements Exception {
  const MediaCancelled();

  @override
  String toString() => 'MediaCancelled';
}
