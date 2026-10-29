import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/app_providers.dart';
import '../media/captions/captions_providers.dart';
import '../media/domain/media_validation.dart';
import '../media/upload/upload_providers.dart';
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
  );
});

/// Whether the client can publish at all.
///
/// The functions need the session token and the posts table needs the Auth
/// token, so both have to be there.
final canPublishProvider = Provider<bool>(
  (ref) =>
      ref.watch(sessionTokenProvider) != null &&
      ref.watch(authAccessTokenProvider) != null,
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
  if (state is! UploadDone) return null;
  final result = state.result;
  return PublishedMedia(
    videoId: result.videoId,
    fileName: result.filename,
    size: result.size,
    kind: mediaKindForPath(result.filename),
  );
});

final publishSelectionProvider =
    NotifierProvider<PublishComposer, PublishSelection>(PublishComposer.new);

/// Holds what the admin picked on the compose screen.
class PublishComposer extends Notifier<PublishSelection> {
  @override
  PublishSelection build() => const PublishSelection();

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
    state = state.copyWith(
      targetIds: ids,
      captions: captions,
      aiCaptions: aiCaptions,
      youtubeTitle: title,
    );
  }

  void setCaption(String targetId, String caption) {
    state = state.copyWith(captions: {...state.captions, targetId: caption});
  }

  void setYouTubeTitle(String title) {
    state = state.copyWith(youtubeTitle: title);
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
      state = state.copyWith(
        mode: mode,
        scheduleDate: fields.date,
        scheduleTime: fields.time,
      );
      return;
    }
    state = state.copyWith(mode: mode);
  }

  void setScheduleDate(String date) {
    state = state.copyWith(scheduleDate: date);
  }

  void setScheduleTime(String time) {
    state = state.copyWith(scheduleTime: time);
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
