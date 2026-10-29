import '../../publishing/domain/publish_selection.dart';

/// The compose form as the admin left it (SPEC-offline "The drafts").
///
/// The typed date and time are kept exactly as typed. [resolvedAt] and
/// [offsetMinutes] record what they meant when the draft was saved, so a
/// restore in another timezone can show the difference and ask, instead of
/// silently moving the post.
class ComposeDraft {
  const ComposeDraft({
    required this.videoId,
    required this.savedAt,
    this.targetIds = const {},
    this.captions = const {},
    this.aiCaptions = const {},
    this.youtubeTitle = '',
    this.mode = PublishMode.now,
    this.scheduleDate = '',
    this.scheduleTime = '',
    this.resolvedAt,
    this.offsetMinutes,
  });

  factory ComposeDraft.fromSelection(
    PublishSelection selection, {
    required String videoId,
    required DateTime savedAt,
    DateTime? resolvedAt,
    int? offsetMinutes,
  }) {
    return ComposeDraft(
      videoId: videoId,
      savedAt: savedAt,
      targetIds: selection.targetIds,
      captions: selection.captions,
      aiCaptions: selection.aiCaptions,
      youtubeTitle: selection.youtubeTitle,
      mode: selection.mode,
      scheduleDate: selection.scheduleDate,
      scheduleTime: selection.scheduleTime,
      resolvedAt: resolvedAt,
      offsetMinutes: offsetMinutes,
    );
  }

  /// The media the form was opened for.
  final String videoId;

  /// When the draft was last written.
  final DateTime savedAt;

  final Set<String> targetIds;
  final Map<String, String> captions;
  final Map<String, String> aiCaptions;
  final String youtubeTitle;
  final PublishMode mode;

  /// The date and the time as the admin typed them.
  final String scheduleDate;
  final String scheduleTime;

  /// The instant the typed time meant when the draft was saved. Null when the
  /// typed time named no instant, or when the draft was not scheduled.
  final DateTime? resolvedAt;

  /// The machine's offset in minutes at that moment.
  final int? offsetMinutes;

  /// True when the form holds nothing worth keeping.
  bool get isEmpty =>
      targetIds.isEmpty &&
      youtubeTitle.trim().isEmpty &&
      scheduleDate.isEmpty &&
      scheduleTime.isEmpty &&
      captions.values.every((caption) => caption.isEmpty);

  PublishSelection toSelection() {
    return PublishSelection(
      targetIds: targetIds,
      captions: captions,
      aiCaptions: aiCaptions,
      youtubeTitle: youtubeTitle,
      mode: mode,
      scheduleDate: scheduleDate,
      scheduleTime: scheduleTime,
    );
  }
}
