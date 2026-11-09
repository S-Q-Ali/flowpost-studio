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
    this.youtubeTags = '',
    this.mode = PublishMode.now,
    this.scheduleDate = '',
    this.scheduleTime = '',
    this.containsAlteredContent = false,
    this.shareToFeed = true,
    this.thumbOffsetMs,
    this.madeForKids = false,
    this.notifySubscribers = true,
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
  final String youtubeTags;
  final PublishMode mode;

  /// The date and the time the admin typed, in their own timezone.
  final String scheduleDate;
  final String scheduleTime;

  /// Whether the video contains synthetic/AI-altered media.
  final bool containsAlteredContent;

  /// Whether Instagram Reels also appear on the main profile grid.
  final bool shareToFeed;

  /// Video frame offset in milliseconds for Instagram cover/thumbnail.
  final int? thumbOffsetMs;

  /// YouTube: self-declared Made for Kids.
  final bool madeForKids;

  /// YouTube: send notifications to channel subscribers.
  final bool notifySubscribers;

  bool get isScheduled => mode == PublishMode.schedule;

  /// The targets whose caption still is the one the AI wrote.
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
    String? youtubeTags,
    PublishMode? mode,
    String? scheduleDate,
    String? scheduleTime,
    bool? containsAlteredContent,
    bool? shareToFeed,
    int? thumbOffsetMs,
    bool? madeForKids,
    bool? notifySubscribers,
  }) {
    return PublishSelection(
      targetIds: targetIds ?? this.targetIds,
      captions: captions ?? this.captions,
      aiCaptions: aiCaptions ?? this.aiCaptions,
      youtubeTitle: youtubeTitle ?? this.youtubeTitle,
      youtubeTags: youtubeTags ?? this.youtubeTags,
      mode: mode ?? this.mode,
      scheduleDate: scheduleDate ?? this.scheduleDate,
      scheduleTime: scheduleTime ?? this.scheduleTime,
      containsAlteredContent:
          containsAlteredContent ?? this.containsAlteredContent,
      shareToFeed: shareToFeed ?? this.shareToFeed,
      thumbOffsetMs: thumbOffsetMs ?? this.thumbOffsetMs,
      madeForKids: madeForKids ?? this.madeForKids,
      notifySubscribers: notifySubscribers ?? this.notifySubscribers,
    );
  }
}
