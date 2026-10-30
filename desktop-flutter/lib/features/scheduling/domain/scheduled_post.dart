import '../../../core/time/time_zone.dart';
import '../../publishing/data/posts_repository.dart';
import '../../publishing/domain/publish_target.dart';
import '../../publishing/domain/publish_validation.dart';

/// The status of a row, as the screen names it (SPEC-scheduling "The status of
/// a row").
extension PostStatusLabel on PostStatus {
  String get label => switch (this) {
    PostStatus.scheduled => 'Scheduled',
    PostStatus.processing => 'Processing',
    PostStatus.publishing => 'Publishing',
    PostStatus.published => 'Published',
    PostStatus.failed => 'Failed',
  };
}

/// The status filter of the queue.
enum QueueFilter {
  all('All', null),
  scheduled('Scheduled', PostStatus.scheduled),
  processing('Processing', PostStatus.processing),
  publishing('Publishing', PostStatus.publishing),
  published('Published', PostStatus.published),
  failed('Failed', PostStatus.failed);

  const QueueFilter(this.label, this.status);

  final String label;

  /// The status the filter asks the table for. Null for the whole queue.
  final PostStatus? status;
}

/// One post, as the queue and the calendar show it.
class ScheduledPost {
  const ScheduledPost({
    required this.id,
    required this.status,
    this.platform,
    this.postType = 'feed',
    this.accountName,
    this.caption,
    this.hashtags,
    this.scheduledAt,
    this.publishedAt,
    this.videoTitle,
    this.thumbnailUrl,
    this.containsAlteredContent = false,
  });

  final String id;

  /// The platform of the row. Null when the row names one this build does
  /// not know, so an unknown platform is never shown as a known one.
  final PublishPlatform? platform;

  final PostStatus status;

  /// `feed` or `story`.
  final String postType;

  final String? accountName;
  final String? caption;
  final String? hashtags;

  /// The UTC instant the post goes out at.
  final DateTime? scheduledAt;

  /// The UTC instant the platform took the post.
  final DateTime? publishedAt;

  final String? videoTitle;
  final String? thumbnailUrl;
  final bool containsAlteredContent;

  /// The time the row shows: when it went out, otherwise when it goes out.
  DateTime? get shownAt => publishedAt ?? scheduledAt;

  /// Only a row the publisher has not claimed can be stopped.
  bool get canCancel => status == PostStatus.scheduled;

  /// A row the publisher claimed and never finished.
  ///
  /// The scheduler and the functions settle a row within minutes, so one that
  /// has been "processing" for half an hour was cut off. It can be removed,
  /// but the platform may already have the post.
  bool isStaleProcessing([DateTime? now]) {
    final at = scheduledAt;
    if (status != PostStatus.processing || at == null) return false;
    return (now ?? DateTime.now()).difference(at) > const Duration(minutes: 30);
  }

  /// The platform and the post type, as the screen names them.
  String get targetLabel {
    final platform = this.platform;
    if (platform == null) return 'Unknown platform';
    return postType == PostType.story.name
        ? '${platform.label} story'
        : platform.label;
  }
}

/// A row's time in the admin's own clock, with the zone next to it.
///
/// The row stores an instant, so it is shown through `toLocal()`: that is the
/// same conversion the OS made when the time was typed.
String postTimeLabel(DateTime? instant) {
  if (instant == null) return '—';
  final local = instant.toLocal();
  return '${formatLocalSchedule(local)} '
      '(${formatZoneOffset(local.timeZoneOffset.inMinutes)})';
}
