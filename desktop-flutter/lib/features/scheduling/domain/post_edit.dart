import '../../../core/time/time_zone.dart';
import '../../publishing/data/posts_repository.dart';
import '../../publishing/domain/publish_target.dart';
import '../../publishing/domain/publish_validation.dart';
import 'calendar_range.dart';
import 'scheduled_post.dart';

/// What the edit form changes on a scheduled row.
class PostEdit {
  const PostEdit({
    required this.caption,
    required this.hashtags,
    required this.containsAlteredContent,
    required this.scheduledAt,
  });

  final String? caption;
  final String? hashtags;
  final bool containsAlteredContent;

  /// The UTC instant the post goes out at.
  final DateTime scheduledAt;

  Map<String, Object?> toRow() => {
    'caption': caption,
    'hashtags': hashtags,
    'contains_altered_content': containsAlteredContent,
    'scheduled_at': scheduledAt.toUtc().toIso8601String(),
  };
}

/// The result of checking an edit before it is sent.
class EditCheck {
  const EditCheck({this.message, this.instant});

  /// Why the edit cannot be saved. Null when it can.
  final String? message;

  /// The instant the typed wall clock resolved to, when it could be read.
  final DateTime? instant;

  bool get isValid => message == null;
}

/// Checks the edit form (SPEC-scheduling "Editing a scheduled post").
///
/// The time is resolved through the same seam the compose form uses, so a
/// post can never be moved onto an hour the clock skips. The past is only
/// refused when the time actually moved: an admin fixing the caption of a
/// row that is already waiting is not blocked by its old time.
EditCheck checkScheduleEdit({
  required PublishPlatform? platform,
  required String caption,
  required String date,
  required String time,
  required DateTime? previousScheduledAt,
  DateTime? now,
  TimeZone zone = const SystemTimeZone(),
}) {
  final limit = platform?.captionLimit;
  if (limit != null && caption.length > limit) {
    return EditCheck(
      message:
          'The ${platform!.label} caption is ${caption.length} characters. '
          'The limit is $limit.',
    );
  }
  final local = parseLocalSchedule(date: date, time: time);
  if (local == null) return const EditCheck(message: scheduleFormatMessage);
  final clock = resolveWallClock(wall: local, zone: zone);
  if (clock is SkippedClock) {
    return EditCheck(
      message: skippedTimeMessage(
        jumpFrom: clock.jumpFrom,
        jumpTo: clock.jumpTo,
      ),
    );
  }
  final instant = clock.instant!;
  final moved = previousScheduledAt == null || instant != previousScheduledAt;
  if (moved && !instant.isAfter(now ?? DateTime.now())) {
    return const EditCheck(message: 'The scheduled time is in the past.');
  }
  return EditCheck(instant: instant);
}

/// The sentence the confirmation puts in front of the admin.
///
/// A scheduled row is cancelled, a failed one is thrown away, and a published
/// one is an explicit delete — the screen says which, so nobody deletes a row
/// that already went out thinking they stopped it.
String deleteSentence(ScheduledPost post) {
  final time = longTimeLabel(post.scheduledAt);
  return switch (post.status) {
    PostStatus.published =>
      'Delete the ${post.targetLabel} post that went out on $time? '
          'The caption is deleted with it and it cannot be recovered.',
    PostStatus.failed =>
      'Delete the failed ${post.targetLabel} post for $time? '
          'The caption is deleted with it and it cannot be recovered.',
    _ =>
      'Delete the ${post.targetLabel} post for $time? '
          'The caption is deleted with it and it cannot be recovered.',
  };
}
