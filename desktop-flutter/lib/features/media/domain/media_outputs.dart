import 'dart:io';

/// The files the pipeline produced for one job (SPEC-media "Model").
///
/// A missing output is null, never an empty path.
class MediaOutputs {
  const MediaOutputs({
    required this.thumbnail,
    required this.frames,
    this.normalized,
    this.audio,
  });

  /// The normalized MP4. Null for images, which pass through unchanged.
  final File? normalized;

  final File thumbnail;

  /// Three caption frames for a video, one for an image.
  final List<File> frames;

  /// The transcription audio. Null when the source has no audio stream.
  final File? audio;
}
