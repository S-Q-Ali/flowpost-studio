/// The stages the upload goes through (SPEC-media "Upload contract").
enum UploadStage { preparing, uploading }

/// One progress update for the upload.
class UploadProgress {
  const UploadProgress({
    required this.stage,
    required this.fraction,
    required this.message,
  });

  final UploadStage stage;

  /// How much of the file has been sent, from 0 to 1.
  final double fraction;

  final String message;
}

/// An upload failed in a way the user can act on.
class UploadException implements Exception {
  const UploadException(this.message);

  final String message;

  @override
  String toString() => 'UploadException: $message';
}

/// What the upload service answered.
class UploadResult {
  const UploadResult({
    required this.videoId,
    required this.url,
    required this.filename,
    required this.size,
  });

  /// The id of the stored video.
  final String videoId;

  /// Where the file was stored. Never logged.
  final String url;

  final String filename;

  /// The size of the stored file in bytes.
  final int size;
}
