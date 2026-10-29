import 'dart:io';

/// The two kinds of input the client can publish (SPEC-media "Formats and
/// limits").
enum MediaKind { video, image }

const Set<String> videoMediaExtensions = {
  '.mp4',
  '.m4v',
  '.mov',
  '.webm',
  '.mkv',
};

const Set<String> imageMediaExtensions = {'.jpg', '.jpeg', '.png', '.webp'};

/// v1 keeps the input under the edge function's 256 MB multipart budget.
const int mediaMaxBytes = 100 * 1024 * 1024;

const String _unreadableMessage = "This file can't be read. It may be damaged.";
const String _emptyMessage = 'This file is empty.';
const String _unsupportedTypeMessage =
    'Unsupported file type. Use MP4, M4V, MOV, WEBM, MKV, JPG, PNG or WEBP.';

/// Returns the kind for a supported extension, or null when the extension is
/// not allowed. Matching is case-insensitive.
MediaKind? mediaKindForPath(String path) {
  final lower = path.toLowerCase();
  final dot = lower.lastIndexOf('.');
  if (dot < 0) return null;
  final extension = lower.substring(dot);
  if (videoMediaExtensions.contains(extension)) return MediaKind.video;
  if (imageMediaExtensions.contains(extension)) return MediaKind.image;
  return null;
}

enum MediaRejection { unsupportedType, tooLarge, empty, unreadable }

class MediaValidationError {
  const MediaValidationError({required this.reason, required this.message});

  final MediaRejection reason;
  final String message;
}

class MediaValidation {
  const MediaValidation._({this.kind, this.bytes, this.error});

  const MediaValidation.valid({required MediaKind kind, required int bytes})
    : this._(kind: kind, bytes: bytes);

  const MediaValidation.invalid(MediaValidationError error)
    : this._(error: error);

  final MediaKind? kind;
  final int? bytes;
  final MediaValidationError? error;

  bool get isValid => error == null;
}

/// Checks a picked file before any FFmpeg work starts: it must exist, be a
/// regular readable file, be non-empty, stay under [maxBytes], and carry an
/// allowed extension.
Future<MediaValidation> validateMediaFile(
  FileSystemEntity file, {
  int maxBytes = mediaMaxBytes,
}) async {
  try {
    if (!await file.exists()) {
      return _invalid(MediaRejection.unreadable, _unreadableMessage);
    }
    final stat = await file.stat();
    if (stat.type != FileSystemEntityType.file) {
      return _invalid(MediaRejection.unreadable, _unreadableMessage);
    }
    if (stat.size == 0) {
      return _invalid(MediaRejection.empty, _emptyMessage);
    }
    if (stat.size > maxBytes) {
      final megabytes = (maxBytes / (1024 * 1024)).ceil();
      return _invalid(
        MediaRejection.tooLarge,
        'File is too large (max $megabytes MB).',
      );
    }
    final kind = mediaKindForPath(file.path);
    if (kind == null) {
      return _invalid(MediaRejection.unsupportedType, _unsupportedTypeMessage);
    }
    if (file is File) {
      final handle = await file.open();
      await handle.close();
    }
    return MediaValidation.valid(kind: kind, bytes: stat.size);
  } on FileSystemException {
    return _invalid(MediaRejection.unreadable, _unreadableMessage);
  }
}

MediaValidation _invalid(MediaRejection reason, String message) =>
    MediaValidation.invalid(
      MediaValidationError(reason: reason, message: message),
    );
