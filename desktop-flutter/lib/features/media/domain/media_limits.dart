import 'media_probe.dart';
import 'media_validation.dart';

/// Videos longer than this are rejected before any processing starts.
const int mediaMaxDurationSeconds = 180;

enum MediaLimitRejection { unreadable, tooLong, noVideoTrack }

class MediaLimitError {
  const MediaLimitError({required this.reason, required this.message});

  final MediaLimitRejection reason;
  final String message;
}

const String _unreadableMessage = "This file can't be read. It may be damaged.";
const String _tooLongMessage = 'Videos must be 3 minutes or shorter.';
const String _noVideoTrackMessage = 'No video track found.';

/// Checks the probe result against the spec's limits.
///
/// A still image has no duration, so the duration rules only apply to video.
/// A video with no duration at all is treated as unreadable rather than as an
/// empty clip, because ffprobe reports no duration for a broken container.
MediaLimitError? checkMediaLimits(
  MediaProbe probe, {
  required MediaKind kind,
  int maxDurationSeconds = mediaMaxDurationSeconds,
}) {
  if (kind == MediaKind.video) {
    if (probe.duration <= Duration.zero) {
      return const MediaLimitError(
        reason: MediaLimitRejection.unreadable,
        message: _unreadableMessage,
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
  return null;
}
