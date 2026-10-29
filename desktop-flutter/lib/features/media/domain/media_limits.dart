import 'media_probe.dart';
import 'media_validation.dart';

/// Videos longer than this are rejected before any processing starts.
const int mediaMaxDurationSeconds = 180;

/// The most pixels the app will decode in one frame.
///
/// A crafted image declares its resolution in a few bytes, and the decoder
/// allocates the whole frame before the first pixel is touched, so the
/// resolution has to be capped and not just the file size.
const int mediaMaxPixels = 7680 * 4320;

enum MediaLimitRejection { unreadable, tooLong, noVideoTrack, tooLarge }

class MediaLimitError {
  const MediaLimitError({required this.reason, required this.message});

  final MediaLimitRejection reason;
  final String message;
}

const String _tooLongMessage = 'Videos must be 3 minutes or shorter.';
const String _noVideoTrackMessage = 'No video track found.';
const String _tooLargeMessage =
    "This file's resolution is too large to process.";

/// Checks the probe result against the spec's limits.
///
/// A still image has no duration, so the duration rules only apply to video.
/// A video with no duration at all is treated as unreadable rather than as an
/// empty clip, because ffprobe reports no duration for a broken container.
MediaLimitError? checkMediaLimits(
  MediaProbe probe, {
  required MediaKind kind,
  int maxDurationSeconds = mediaMaxDurationSeconds,
  int maxPixels = mediaMaxPixels,
}) {
  if (kind == MediaKind.video) {
    if (probe.duration <= Duration.zero) {
      return const MediaLimitError(
        reason: MediaLimitRejection.unreadable,
        message: mediaUnreadableMessage,
      );
    }
    if (probe.duration.inSeconds > maxDurationSeconds) {
      return const MediaLimitError(
        reason: MediaLimitRejection.tooLong,
        message: _tooLongMessage,
      );
    }
  }
  if (probe.width <= 0 || probe.height <= 0) {
    return const MediaLimitError(
      reason: MediaLimitRejection.noVideoTrack,
      message: _noVideoTrackMessage,
    );
  }
  if (probe.width * probe.height > maxPixels) {
    return const MediaLimitError(
      reason: MediaLimitRejection.tooLarge,
      message: _tooLargeMessage,
    );
  }
  return null;
}
