import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/app_providers.dart';
import '../../core/time/time_zone.dart';
import '../media/captions/captions_providers.dart';
import '../media/domain/media_validation.dart';
import '../media/upload/upload_providers.dart';
import '../offline/connectivity.dart';
import '../offline/drafts/compose_draft.dart';
import '../offline/offline_providers.dart';
import 'data/posts_repository.dart';
import 'data/publish_client.dart';
import 'domain/publish_selection.dart';
import 'domain/publish_target.dart';
import 'domain/publish_validation.dart';

/// The accounts the admin can publish to.
///
/// They come from the server's `connected_accounts` table, which needs the
/// identity module, so the list stays empty until that exists.
final publishTargetsProvider = Provider<List<PublishTarget>>((ref) => const []);

final publishClientProvider = Provider<PublishApi>((ref) {
  final config = ref.watch(appConfigProvider);
  return PublishClient(
    supabaseUrl: config.supabaseUrl,
    token: ref.watch(sessionTokenProvider),
  );
});

final postsRepositoryProvider = Provider<PostsRepository>((ref) {
  final config = ref.watch(appConfigProvider);
  return PostgrestPostsRepository(
    supabaseUrl: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    token: ref.watch(authAccessTokenProvider),
    transport: ref.watch(postsTransportProvider),
  );
});

/// Whether the client can publish at all.
///
/// The functions need the session token and the posts table needs the Auth
/// token, so both have to be there. A machine with no connection cannot
/// publish either: the row lives on the server (SPEC-offline).
final canPublishProvider = Provider<bool>(
  (ref) =>
      ref.watch(sessionTokenProvider) != null &&
      ref.watch(authAccessTokenProvider) != null &&
      ref.watch(connectivityProvider) != ConnectionStatus.offline,
);

/// The media that was uploaded and can be published.
class PublishedMedia {
  const PublishedMedia({
    required this.videoId,
    required this.fileName,
    required this.size,
    required this.kind,
  });

  /// The id of the `videos` row the upload wrote.
  final String videoId;

  final String fileName;
  final int size;

  /// The kind of the media, which decides what the platforms accept.
  final MediaKind? kind;
}

/// The media the compose screen publishes, or null when nothing was
/// uploaded yet.
final publishedMediaProvider = Provider<PublishedMedia?>((ref) {
  final state = ref.watch(uploadControllerProvider);
  if (state is UploadDone) {
    final result = state.result;
    return PublishedMedia(
      videoId: result.videoId,
      fileName: result.filename,
      size: result.size,
      kind: mediaKindForPath(result.filename),
    );
  }
  // A draft that was opened after a restart holds its media on its own,
  // because the upload that made it is no longer in memory.
  return ref.watch(restoredDraftMediaProvider);
});

/// The media of the draft that was opened after a restart.
final restoredDraftMediaProvider =
    NotifierProvider<RestoredDraftMediaController, PublishedMedia?>(
      RestoredDraftMediaController.new,
    );

class RestoredDraftMediaController extends Notifier<PublishedMedia?> {
  @override
  PublishedMedia? build() => null;

  void set(PublishedMedia? media) => state = media;
}

/// The drafts on the machine that can be opened again, newest first.
final savedDraftsProvider = FutureProvider<List<ComposeDraft>>((ref) async {
  final drafts = await ref.watch(draftsRepositoryProvider).all();
  // A draft from before the media was stored cannot be opened: the form has
  // no file to show.
  return [
    for (final draft in drafts)
      if (draft.fileName != null) draft,
  ];
});

/// Whether the last draft write failed, so the admin knows the form is not
/// being kept.
final draftSaveWarningProvider =
    NotifierProvider<DraftSaveWarningController, bool>(
      DraftSaveWarningController.new,
    );

class DraftSaveWarningController extends Notifier<bool> {
  @override
  bool build() => false;

  void set(bool failed) => state = failed;
}

/// A draft that came back, and what its time means in the zone the machine
/// is in now (SPEC-offline "The conflict rule").
class DraftRestore {
  const DraftRestore({
    required this.savedAt,
    this.savedInstant,
    this.nowInstant,
  });

  /// When the draft was last written.
  final DateTime savedAt;

  /// The instant the typed time meant when the draft was saved.
  final DateTime? savedInstant;

  /// The instant the typed time means here and now. Null when the clock here
  /// skips that hour, which the time field itself reports.
  final DateTime? nowInstant;

  /// True when the same typed time now means another instant, so the admin
  /// has to choose before it is published.
  bool get timeMoved =>
      savedInstant != null &&
      nowInstant != null &&
      !savedInstant!.isAtSameMomentAs(nowInstant!);

  DraftRestore keepTyped() => DraftRestore(
    savedAt: savedAt,
    savedInstant: savedInstant,
    nowInstant: savedInstant,
  );
}

final draftRestoreProvider =
    NotifierProvider<DraftRestoreController, DraftRestore?>(
      DraftRestoreController.new,
    );

/// What the screen says about the draft it restored.
class DraftRestoreController extends Notifier<DraftRestore?> {
  @override
  DraftRestore? build() => null;

  void set(DraftRestore? restore) => state = restore;

  /// The admin keeps the time they typed; the notice about the other instant
  /// stops showing.
  void keepTyped() {
    final restore = state;
    if (restore == null) return;
    state = restore.keepTyped();
  }
}

final publishSelectionProvider =
    NotifierProvider<PublishComposer, PublishSelection>(PublishComposer.new);

/// Holds what the admin picked on the compose screen.
///
/// The form is saved 800 ms after the last change and restored when the
/// screen opens for the same media (SPEC-offline "The drafts").
class PublishComposer extends Notifier<PublishSelection> {
  /// How long the form waits for the typing to settle before it is written.
  static const Duration saveDelay = Duration(milliseconds: 800);

  Timer? _saveTimer;
  String? _videoId;
  int _loads = 0;

  @override
  PublishSelection build() {
    final media = ref.watch(publishedMediaProvider);
    _saveTimer?.cancel();
    _videoId = media?.videoId;
    ref.onDispose(() => _saveTimer?.cancel());
    if (media == null) return const PublishSelection();
    _restore(media.videoId);
    return const PublishSelection();
  }

  /// Reads the draft of this media, when there is one.
  Future<void> _restore(String videoId) async {
    final load = ++_loads;
    final ComposeDraft? draft;
    try {
      draft = await ref.read(draftsRepositoryProvider).load(videoId);
    } on Object {
      return;
    }
    // The media moved on while the draft was being read, or the screen was
    // opened again: the draft belongs to a form that is no longer here.
    if (load != _loads || _videoId != videoId) return;
    if (draft == null || draft.isEmpty) return;
    state = draft.toSelection();
    ref.read(draftRestoreProvider.notifier).set(_restoreOf(draft));
  }

  /// What the draft's time means in the zone the machine is in now.
  DraftRestore _restoreOf(ComposeDraft draft) {
    DateTime? now;
    if (draft.mode == PublishMode.schedule) {
      final wall = parseLocalSchedule(
        date: draft.scheduleDate,
        time: draft.scheduleTime,
      );
      if (wall != null) {
        now = resolveWallClock(
          wall: wall,
          zone: ref.read(timeZoneProvider),
        ).instant;
      }
    }
    return DraftRestore(
      savedAt: draft.savedAt,
      savedInstant: draft.resolvedAt,
      nowInstant: now,
    );
  }

  /// Opens a draft whose upload is no longer in memory.
  void openDraft(ComposeDraft draft) {
    ref.read(uploadControllerProvider.notifier).reset();
    ref.read(restoredDraftMediaProvider.notifier).set(_mediaOfDraft(draft));
  }

  /// Picks a target, or drops it.
  ///
  /// A picked target starts with the caption the AI wrote for that platform.
  void toggle(PublishTarget target) {
    final ids = Set<String>.from(state.targetIds);
    final captions = Map<String, String>.from(state.captions);
    final aiCaptions = Map<String, String>.from(state.aiCaptions);
    var title = state.youtubeTitle;
    if (ids.contains(target.id)) {
      ids.remove(target.id);
      captions.remove(target.id);
      aiCaptions.remove(target.id);
    } else {
      ids.add(target.id);
      final aiCaption = _aiCaption(target);
      captions[target.id] = aiCaption;
      if (aiCaption.isNotEmpty) aiCaptions[target.id] = aiCaption;
      if (target.platform == PublishPlatform.youtube && title.isEmpty) {
        title = _aiTitle();
      }
    }
    _update(
      state.copyWith(
        targetIds: ids,
        captions: captions,
        aiCaptions: aiCaptions,
        youtubeTitle: title,
      ),
    );
  }

  void setCaption(String targetId, String caption) {
    _update(state.copyWith(captions: {...state.captions, targetId: caption}));
  }

  void setYouTubeTitle(String title) {
    _update(state.copyWith(youtubeTitle: title));
  }

  /// Switches between publishing now and publishing at a time.
  ///
  /// The schedule starts at the next full hour, so the field is never empty
  /// when it appears.
  void setMode(PublishMode mode) {
    if (mode == PublishMode.schedule &&
        state.scheduleDate.isEmpty &&
        state.scheduleTime.isEmpty) {
      final next = DateTime.now().add(const Duration(hours: 1));
      final fields = scheduleFields(
        DateTime(next.year, next.month, next.day, next.hour),
      );
      _update(
        state.copyWith(
          mode: mode,
          scheduleDate: fields.date,
          scheduleTime: fields.time,
        ),
      );
      return;
    }
    _update(state.copyWith(mode: mode));
  }

  void setScheduleDate(String date) {
    // The admin is choosing the time again, so the question about the saved
    // one no longer has an answer to wait for.
    ref.read(draftRestoreProvider.notifier).keepTyped();
    _update(state.copyWith(scheduleDate: date));
  }

  void setScheduleTime(String time) {
    ref.read(draftRestoreProvider.notifier).keepTyped();
    _update(state.copyWith(scheduleTime: time));
  }

  /// Takes the time the draft was saved with, as a wall clock here.
  void useSavedTime(DateTime savedInstant) {
    final fields = scheduleFields(savedInstant.toLocal());
    ref.read(draftRestoreProvider.notifier).set(null);
    _update(
      state.copyWith(scheduleDate: fields.date, scheduleTime: fields.time),
    );
  }

  /// Throws the form and the draft away.
  Future<void> discard() async {
    final videoId = _videoId;
    _saveTimer?.cancel();
    _loads++;
    ref.read(draftRestoreProvider.notifier).set(null);
    ref.read(restoredDraftMediaProvider.notifier).set(null);
    ref.read(draftSaveWarningProvider.notifier).set(false);
    state = const PublishSelection();
    if (videoId == null) return;
    await ref.read(draftsRepositoryProvider).delete(videoId);
    ref.invalidate(savedDraftsProvider);
  }

  /// The post was written, so the draft has done its job (SPEC-offline "The
  /// drafts").
  Future<void> draftPublished(String videoId) async {
    _saveTimer?.cancel();
    ref.read(draftRestoreProvider.notifier).set(null);
    ref.read(restoredDraftMediaProvider.notifier).set(null);
    await ref.read(draftsRepositoryProvider).delete(videoId);
    ref.invalidate(savedDraftsProvider);
  }

  void _update(PublishSelection next) {
    state = next;
    _scheduleSave();
  }

  void _scheduleSave() {
    final videoId = _videoId;
    if (videoId == null) return;
    _saveTimer?.cancel();
    _saveTimer = Timer(saveDelay, () => _save(videoId));
  }

  /// Writes the form, or drops the draft when the form holds nothing.
  Future<void> _save(String videoId) async {
    if (_videoId != videoId) return;
    final selection = state;
    final zone = ref.read(timeZoneProvider);
    DateTime? resolved;
    int? offset;
    if (selection.isScheduled) {
      final wall = parseLocalSchedule(
        date: selection.scheduleDate,
        time: selection.scheduleTime,
      );
      if (wall != null) {
        offset = zone.offsetAt(wall);
        resolved = resolveWallClock(wall: wall, zone: zone).instant;
      }
    }
    final media = ref.read(publishedMediaProvider);
    final ownMedia = media?.videoId == videoId ? media : null;
    final draft = ComposeDraft.fromSelection(
      selection,
      videoId: videoId,
      savedAt: DateTime.now(),
      resolvedAt: resolved,
      offsetMinutes: offset,
      fileName: ownMedia?.fileName,
      size: ownMedia?.size,
      mediaKind: ownMedia?.kind?.name,
    );
    final drafts = ref.read(draftsRepositoryProvider);
    if (draft.isEmpty) {
      await drafts.delete(videoId);
      ref.read(draftSaveWarningProvider.notifier).set(false);
      ref.invalidate(savedDraftsProvider);
      return;
    }
    final saved = await drafts.save(draft);
    ref.read(draftSaveWarningProvider.notifier).set(!saved);
    ref.invalidate(savedDraftsProvider);
  }

  String _aiCaption(PublishTarget target) {
    final state = ref.read(captionControllerProvider);
    if (state is! CaptionReady) return '';
    return state.result.captions[captionKeyFor(target.platform)] ?? '';
  }

  String _aiTitle() {
    final state = ref.read(captionControllerProvider);
    if (state is! CaptionReady) return '';
    return state.result.captions[youtubeTitleCaptionKey] ?? '';
  }
}

/// The targets the admin picked.
final selectedTargetsProvider = Provider<List<PublishTarget>>((ref) {
  final targets = ref.watch(publishTargetsProvider);
  final ids = ref.watch(publishSelectionProvider.select((s) => s.targetIds));
  return [
    for (final target in targets)
      if (ids.contains(target.id)) target,
  ];
});

/// The reason the compose form is not ready.
final publishValidationProvider = Provider<PublishValidation>((ref) {
  final selection = ref.watch(publishSelectionProvider);
  return validatePublish(
    targets: ref.watch(selectedTargetsProvider),
    captions: selection.captions,
    mediaKind: ref.watch(publishedMediaProvider)?.kind,
    youtubeTitle: selection.youtubeTitle,
    schedule: selection.isScheduled,
    scheduleDate: selection.scheduleDate,
    scheduleTime: selection.scheduleTime,
    zone: ref.watch(timeZoneProvider),
  );
});

/// How long the client waits for a row to settle after an unknown outcome.
class PublishPollPolicy {
  const PublishPollPolicy({
    this.interval = const Duration(seconds: 5),
    this.attempts = 12,
  });

  /// The gap between two reads of the row.
  final Duration interval;

  /// How many times the row is read before the client gives up on it.
  final int attempts;
}

/// The wait after a publish call that never came back.
final publishPollPolicyProvider = Provider<PublishPollPolicy>(
  (ref) => const PublishPollPolicy(),
);

/// The media a stored draft was written for, or null for a draft from before
/// the media was stored.
PublishedMedia? _mediaOfDraft(ComposeDraft draft) {
  final fileName = draft.fileName;
  if (fileName == null) return null;
  return PublishedMedia(
    videoId: draft.videoId,
    fileName: fileName,
    size: draft.size ?? 0,
    kind: switch (draft.mediaKind) {
      'video' => MediaKind.video,
      'image' => MediaKind.image,
      _ => null,
    },
  );
}
