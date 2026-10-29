import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';

import 'data/posts_repository.dart';
import 'data/publish_client.dart';
import 'domain/publish_selection.dart';
import 'domain/publish_target.dart';
import 'publishing_providers.dart';

/// What one platform's attempt is doing.
enum PublishPhase { waiting, publishing, published, failed }

/// The state of one platform's attempt.
class PublishTargetStatus {
  const PublishTargetStatus({
    required this.target,
    required this.phase,
    this.postId,
    this.platformId,
    this.message,
  });

  final PublishTarget target;
  final PublishPhase phase;

  /// The row that was written for this target.
  final String? postId;

  /// The id the platform gave the post.
  final String? platformId;

  /// Why it failed, in the words of the screen.
  final String? message;

  PublishTargetStatus copyWith({
    PublishPhase? phase,
    String? postId,
    String? platformId,
    String? message,
  }) {
    return PublishTargetStatus(
      target: target,
      phase: phase ?? this.phase,
      postId: postId ?? this.postId,
      platformId: platformId ?? this.platformId,
      message: message ?? this.message,
    );
  }
}

sealed class PublishState {
  const PublishState();
}

/// Nothing was published yet.
class PublishIdle extends PublishState {
  const PublishIdle();
}

/// The attempt is in flight.
class PublishRunning extends PublishState {
  const PublishRunning(this.statuses);

  final List<PublishTargetStatus> statuses;
}

/// The attempt is over. Every target carries its own outcome.
class PublishDone extends PublishState {
  const PublishDone(this.statuses);

  final List<PublishTargetStatus> statuses;
}

final publishControllerProvider =
    NotifierProvider<PublishController, PublishState>(PublishController.new);

/// Writes the rows and calls the publish functions.
class PublishController extends Notifier<PublishState> {
  static final Logger _log = Logger('publish');

  /// The run that owns the state. A newer run takes over, and the run that
  /// lost it writes nothing.
  int _run = 0;

  @override
  PublishState build() => const PublishIdle();

  /// Publishes the picked targets now.
  ///
  /// One row per target, then one call per row. A target that fails does not
  /// stop the others: each carries its own outcome.
  Future<void> publish({
    required PublishSelection selection,
    required List<PublishTarget> targets,
    required String videoId,
  }) async {
    final run = ++_run;
    final statuses = [
      for (final target in targets)
        PublishTargetStatus(target: target, phase: PublishPhase.waiting),
    ];
    state = PublishRunning(statuses);
    for (var index = 0; index < targets.length; index++) {
      if (run != _run) return;
      final target = targets[index];
      statuses[index] = statuses[index].copyWith(
        phase: PublishPhase.publishing,
      );
      state = PublishRunning([...statuses]);
      try {
        final postId = await ref
            .read(postsRepositoryProvider)
            .insert(_draft(target, selection, videoId));
        statuses[index] = statuses[index].copyWith(postId: postId);
        final result = await ref
            .read(publishClientProvider)
            .publish(target: target, postId: postId);
        statuses[index] = statuses[index].copyWith(
          phase: PublishPhase.published,
          platformId: result.platformId,
        );
      } on PublishException catch (error) {
        statuses[index] = statuses[index].copyWith(
          phase: PublishPhase.failed,
          message: error.failure.message,
        );
        _log.warning(
          'The publish to ${target.platform.name} failed '
          '(${error.failure.code.name}).',
        );
      } on PostsException catch (error) {
        statuses[index] = statuses[index].copyWith(
          phase: PublishPhase.failed,
          message: error.message,
        );
        _log.warning('The queue refused the ${target.platform.name} post.');
      } on Object catch (error, stackTrace) {
        statuses[index] = statuses[index].copyWith(
          phase: PublishPhase.failed,
          message: 'The publish failed. Try again.',
        );
        // The type and the stack trace are logged, never the message: a
        // message can carry the path of the user's file.
        _log.severe(
          'The publish to ${target.platform.name} failed unexpectedly '
          '(${error.runtimeType}).',
          null,
          stackTrace,
        );
      }
      state = PublishRunning([...statuses]);
    }
    if (run != _run) return;
    state = PublishDone(statuses);
  }

  /// Forgets the last attempt.
  void reset() {
    _run++;
    state = const PublishIdle();
  }

  /// The row one target needs.
  ///
  /// The caption, the account and the media stay on the server; the row only
  /// points at them.
  PostDraft _draft(
    PublishTarget target,
    PublishSelection selection,
    String videoId,
  ) {
    final caption = (selection.captions[target.id] ?? '').trim();
    final title = selection.youtubeTitle.trim();
    return PostDraft(
      videoId: videoId,
      platform: target.platform.name,
      accountId: target.accountId,
      postType: target.postType.name,
      scheduledAt: DateTime.now(),
      status: 'processing',
      caption: caption.isEmpty ? null : caption,
      hashtags: null,
      containsAlteredContent: selection.aiCaptionTargetIds.contains(target.id),
      metadata: target.platform == PublishPlatform.youtube && title.isNotEmpty
          ? {'youtube_video_title': title}
          : null,
    );
  }
}
