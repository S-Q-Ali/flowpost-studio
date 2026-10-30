/// When the post goes out.
enum PublishMode { now, schedule }

/// What the admin picked on the compose screen.
///
/// The selection is kept even when a publish fails, so a failed attempt
/// never loses the draft.
class PublishSelection {
  const PublishSelection({
    this.targetIds = const {},
    this.captions = const {},
    this.aiCaptions = const {},
    this.youtubeTitle = '',
    this.mode = PublishMode.now,
    this.scheduleDate = '',
    this.scheduleTime = '',
  });

  /// The ids of the picked targets.
  final Set<String> targetIds;

  /// The caption of each picked target, keyed by the target id.
  final Map<String, String> captions;

  /// The caption the AI wrote for each target, keyed by the target id.
  ///
  /// A target that is not in this map never carried an AI caption.
  final Map<String, String> aiCaptions;

  final String youtubeTitle;
  final PublishMode mode;

  /// The date and the time the admin typed, in their own timezone.
  final String scheduleDate;
  final String scheduleTime;

  bool get isScheduled => mode == PublishMode.schedule;

  /// The targets whose caption still is the one the AI wrote.
  ///
  /// The row tells the platform that the content is altered, so the flag
  /// follows the caption and not the file.
  Set<String> get aiCaptionTargetIds => {
    for (final entry in captions.entries)
      if (entry.value.isNotEmpty && entry.value == aiCaptions[entry.key])
        entry.key,
  };

  PublishSelection copyWith({
    Set<String>? targetIds,
    Map<String, String>? captions,
    Map<String, String>? aiCaptions,
    String? youtubeTitle,
    PublishMode? mode,
    String? scheduleDate,
    String? scheduleTime,
  }) {
    return PublishSelection(
      targetIds: targetIds ?? this.targetIds,
      captions: captions ?? this.captions,
      aiCaptions: aiCaptions ?? this.aiCaptions,
      youtubeTitle: youtubeTitle ?? this.youtubeTitle,
      mode: mode ?? this.mode,
      scheduleDate: scheduleDate ?? this.scheduleDate,
      scheduleTime: scheduleTime ?? this.scheduleTime,
    );
  }
}
