import '../../media/domain/media_validation.dart';
import 'publish_target.dart';

/// Why the compose form is not ready.
enum PublishRejection {
  noTarget,
  mediaNotSupported,
  captionTooLong,
  titleMissing,
  titleTooLong,
  scheduleIncomplete,
  scheduleInvalid,
  scheduleInPast,
}

/// One reason the compose form is not ready.
class PublishIssue {
  const PublishIssue({
    required this.reason,
    required this.message,
    this.targetId,
  });

  final PublishRejection reason;

  /// The sentence the screen shows.
  final String message;

  /// The target the issue belongs to. Null when it is about the form.
  final String? targetId;
}

/// The result of checking the compose form.
class PublishValidation {
  const PublishValidation(this.issues);

  final List<PublishIssue> issues;

  bool get isValid => issues.isEmpty;

  /// The issues that belong to one target.
  List<PublishIssue> forTarget(String targetId) =>
      issues.where((issue) => issue.targetId == targetId).toList();
}

/// Checks the compose form before anything is sent (SPEC-publishing "Limits
/// the client enforces").
///
/// The web app sends the caption and lets the function cut it. The client
/// refuses instead, because a cut caption can change what the post says.
PublishValidation validatePublish({
  required List<PublishTarget> targets,
  required Map<String, String> captions,
  required MediaKind? mediaKind,
  required String youtubeTitle,
  required bool schedule,
  required String scheduleDate,
  required String scheduleTime,
  DateTime? now,
}) {
  final issues = <PublishIssue>[];
  if (targets.isEmpty) {
    issues.add(
      const PublishIssue(
        reason: PublishRejection.noTarget,
        message: 'Choose at least one platform.',
      ),
    );
    return PublishValidation(issues);
  }
  for (final target in targets) {
    if (mediaKind == MediaKind.image && !target.acceptsImage) {
      issues.add(
        PublishIssue(
          reason: PublishRejection.mediaNotSupported,
          message: target.refusedMediaMessage,
          targetId: target.id,
        ),
      );
    }
    final limit = target.captionLimit;
    if (limit == null) continue;
    final caption = captions[target.id] ?? '';
    if (caption.length > limit) {
      issues.add(
        PublishIssue(
          reason: PublishRejection.captionTooLong,
          message:
              'The ${target.platform.label} caption is ${caption.length} '
              'characters. The limit is $limit.',
          targetId: target.id,
        ),
      );
    }
  }
  final wantsYouTube = targets.any(
    (target) => target.platform == PublishPlatform.youtube,
  );
  if (wantsYouTube && youtubeTitle.trim().isEmpty) {
    issues.add(
      const PublishIssue(
        reason: PublishRejection.titleMissing,
        message: 'A YouTube title is required.',
      ),
    );
  }
  final title = youtubeTitle.trim();
  if (wantsYouTube && title.length > youtubeTitleLimit) {
    issues.add(
      PublishIssue(
        reason: PublishRejection.titleTooLong,
        message:
            'The YouTube title is ${title.length} characters. '
            'The limit is $youtubeTitleLimit.',
      ),
    );
  }
  if (schedule) {
    final date = scheduleDate.trim();
    final time = scheduleTime.trim();
    if (date.isEmpty || time.isEmpty) {
      issues.add(
        const PublishIssue(
          reason: PublishRejection.scheduleIncomplete,
          message: 'Enter the date and the time to publish at.',
        ),
      );
    } else {
      final local = parseLocalSchedule(date: date, time: time);
      if (local == null) {
        issues.add(
          const PublishIssue(
            reason: PublishRejection.scheduleInvalid,
            message: scheduleFormatMessage,
          ),
        );
      } else if (!local.isAfter(now ?? DateTime.now())) {
        issues.add(
          const PublishIssue(
            reason: PublishRejection.scheduleInPast,
            message: 'The scheduled time is in the past.',
          ),
        );
      }
    }
  }
  return PublishValidation(issues);
}

/// The message shown when the date or the time cannot be read.
const String scheduleFormatMessage =
    'Enter the date as YYYY-MM-DD and the time as HH:MM.';

/// Reads the date and the time the admin typed, in their own timezone.
///
/// The row stores the UTC instant, so the local time is turned into one
/// here. Returns null when either part is not a date or a time.
DateTime? parseLocalSchedule({required String date, required String time}) {
  final dateParts = date.trim().split('-');
  if (dateParts.length != 3) return null;
  final year = int.tryParse(dateParts[0]);
  final month = int.tryParse(dateParts[1]);
  final day = int.tryParse(dateParts[2]);
  if (year == null || month == null || day == null) return null;
  final timeParts = time.trim().split(':');
  if (timeParts.length != 2) return null;
  final hour = int.tryParse(timeParts[0]);
  final minute = int.tryParse(timeParts[1]);
  if (hour == null || minute == null) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  final local = DateTime(year, month, day, hour, minute);
  // A day that does not exist, like the 31st of February, rolls over.
  if (local.month != month || local.day != day) return null;
  return local;
}

/// The date and the time as they are typed, in the admin's own timezone.
String formatLocalSchedule(DateTime local) {
  final date = local.year.toString().padLeft(4, '0');
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$date-$month-$day $hour:$minute';
}

/// The date and the time as two fields, in the admin's own timezone.
({String date, String time}) scheduleFields(DateTime local) {
  final text = formatLocalSchedule(local);
  return (date: text.substring(0, 10), time: text.substring(11));
}
