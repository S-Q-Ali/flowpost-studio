import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';

import '../../core/providers/app_providers.dart';
import '../../core/time/time_zone.dart';
import '../offline/connectivity.dart';
import 'data/posts_repository.dart';
import 'data/publish_client.dart';
import 'domain/publish_errors.dart';
import 'domain/publish_selection.dart';
import 'domain/publish_target.dart';
import 'domain/publish_validation.dart';
import 'publishing_providers.dart';

/// What one platform's attempt is doing.
enum PublishPhase {
  waiting,
  publishing,
  published,
  failed,
  unconfirmed,
  scheduled,
}

/// The state of one platform's attempt.
class PublishTargetStatus {
  const PublishTargetStatus({
    required this.target,
    required this.phase,
    this.postId,
    this.platformId,
    this.message,
    this.canRetry = false,
    this.scheduledAt,
  });

  final PublishTarget target;
  final PublishPhase phase;

  /// The row that was written for this target.
  final String? postId;

  /// The id the platform gave the post.
  final String? platformId;

  /// Why it failed, in the words of the screen.
  final String? message;

  /// The row was read back and still says failed, so a retry cannot post
  /// something twice.
  final bool canRetry;

  /// When the post goes out, for a scheduled or a retried row.
  final DateTime? scheduledAt;

  PublishTargetStatus copyWith({
    PublishPhase? phase,
    String? postId,
    String? platformId,
    String? message,
    bool? canRetry,
    DateTime? scheduledAt,
  }) {
    return PublishTargetStatus(
      target: target,
      phase: phase ?? this.phase,
      postId: postId ?? this.postId,
      platformId: platformId ?? this.platformId,
      message: message ?? this.message,
      canRetry: canRetry ?? this.canRetry,
      scheduledAt: scheduledAt ?? this.scheduledAt,
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

  /// The run that is working right now.
  ///
  /// A second click while it works does nothing: the first one has already
  /// written the row, and a second row would post the same thing twice.
  bool _inFlight = false;

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
    if (_inFlight) return;
    _inFlight = true;
    try {
      await _publish(selection: selection, targets: targets, videoId: videoId);
    } finally {
      _inFlight = false;
    }
  }

  Future<void> _publish({
    required PublishSelection selection,
    required List<PublishTarget> targets,
    required String videoId,
  }) async {
    final statuses = [
      for (final target in targets)
        PublishTargetStatus(target: target, phase: PublishPhase.waiting),
    ];
    state = PublishRunning(statuses);
    for (var index = 0; index < targets.length; index++) {
      final target = targets[index];
      if (!selection.isScheduled) {
        statuses[index] = statuses[index].copyWith(
          phase: PublishPhase.publishing,
        );
      }
      state = PublishRunning([...statuses]);
      statuses[index] = selection.isScheduled
          ? await _schedule(target, selection, videoId)
          : await _attempt(target, selection, videoId);
      state = PublishRunning([...statuses]);
    }
    state = PublishDone(statuses);
    // Every target wrote its row, so the draft has done its job. A run with a
    // failed target keeps the draft: the admin may want to try it again.
    final written =
        statuses.isNotEmpty &&
        statuses.every(
          (status) =>
              status.phase == PublishPhase.published ||
              status.phase == PublishPhase.scheduled,
        );
    if (written) {
      await ref.read(publishSelectionProvider.notifier).draftPublished(videoId);
    }
  }

  /// Writes the row of a post that goes out later.
  ///
  /// The client does not publish it: the scheduler does, so one publisher is
  /// always in charge (SPEC-publishing "Scheduling").
  Future<PublishTargetStatus> _schedule(
    PublishTarget target,
    PublishSelection selection,
    String videoId,
  ) async {
    final wall = parseLocalSchedule(
      date: selection.scheduleDate,
      time: selection.scheduleTime,
    );
    if (wall == null) {
      return PublishTargetStatus(
        target: target,
        phase: PublishPhase.failed,
        message: scheduleFormatMessage,
      );
    }
    final clock = resolveWallClock(
      wall: wall,
      zone: ref.read(timeZoneProvider),
    );
    if (clock is SkippedClock) {
      // The clock skips that hour, so the time names no instant and no row
      // may be written for it.
      return PublishTargetStatus(
        target: target,
        phase: PublishPhase.failed,
        message: skippedTimeMessage(
          jumpFrom: clock.jumpFrom,
          jumpTo: clock.jumpTo,
        ),
      );
    }
    final draft = _draft(
      target,
      selection,
      videoId,
      id: newPostId(),
      when: clock.instant!,
    );
    final inserted = await _insert(draft);
    if (!inserted.queued) {
      return PublishTargetStatus(
        target: target,
        phase: PublishPhase.failed,
        message: inserted.message,
      );
    }
    return PublishTargetStatus(
      target: target,
      phase: PublishPhase.scheduled,
      postId: inserted.id,
      scheduledAt: wall,
    );
  }

  /// Writes the row of one target and sends it out.
  Future<PublishTargetStatus> _attempt(
    PublishTarget target,
    PublishSelection selection,
    String videoId,
  ) async {
    final draft = _draft(target, selection, videoId, id: newPostId());
    final inserted = await _insert(draft);
    if (!inserted.queued) {
      return PublishTargetStatus(
        target: target,
        phase: PublishPhase.failed,
        message: inserted.message,
      );
    }
    return _publishRow(target, inserted.id);
  }

  /// Writes the row and says whether it is in the queue.
  ///
  /// An insert whose answer was lost may still have landed, so the row is
  /// asked for by the id the client chose. Without this the next try would
  /// write a second row, and a scheduled post would go out twice.
  Future<({bool queued, String id, String message})> _insert(
    PostDraft draft,
  ) async {
    try {
      final id = await ref.read(postsRepositoryProvider).insert(draft);
      return (queued: true, id: id, message: '');
    } on PostsException catch (error) {
      final landed = await _readRow(draft.id);
      if (landed != null) {
        return (queued: true, id: draft.id, message: '');
      }
      _log.warning('The queue refused the ${draft.platform} post.');
      return (queued: false, id: draft.id, message: error.message);
    } on Object catch (error, stackTrace) {
      final landed = await _readRow(draft.id);
      if (landed != null) {
        return (queued: true, id: draft.id, message: '');
      }
      // The type and the stack trace are logged, never the message: a
      // message can carry the path of the user's file.
      _log.severe(
        'The ${draft.platform} post could not be queued '
        '(${error.runtimeType}).',
        null,
        stackTrace,
      );
      return (
        queued: false,
        id: draft.id,
        message: 'The post could not be prepared.',
      );
    }
  }

  /// Calls the function for one row and reads the row back.
  ///
  /// The row is the truth: the function writes `published` or `failed`
  /// itself, and the client cannot tell what happened to the platform when
  /// the call never came back.
  Future<PublishTargetStatus> _publishRow(
    PublishTarget target,
    String postId,
  ) async {
    PublishResult? result;
    PublishFailure? failure;
    try {
      result = await ref
          .read(publishClientProvider)
          .publish(target: target, postId: postId);
    } on PublishException catch (error) {
      failure = error.failure;
      _log.warning(
        'The publish to ${target.platform.name} failed '
        '(${error.failure.code.name}).',
      );
    }

    // The app learns the state of the connection from the calls it makes.
    // A call that never reached the server is offline; an answer, even a
    // refusal, is not (SPEC-offline Decision 2).
    if (failure?.code == PublishErrorCode.network) {
      ref.read(connectivityProvider.notifier).lost();
    } else {
      ref.read(connectivityProvider.notifier).reached();
    }

    final row = await _readRow(postId);
    final phase = _phaseOf(row);

    if (phase == PublishPhase.published) {
      return PublishTargetStatus(
        target: target,
        phase: PublishPhase.published,
        postId: postId,
        platformId: result?.platformId,
      );
    }
    if (failure == null) {
      // The function answered with the platform's own id: the post went out.
      return PublishTargetStatus(
        target: target,
        phase: PublishPhase.published,
        postId: postId,
        platformId: result?.platformId,
      );
    }
    if (failure.code == PublishErrorCode.uploadSucceeded) {
      // The platform took the post and the row could not be written, so the
      // row's own "failed" is stale and a retry would post twice.
      return PublishTargetStatus(
        target: target,
        phase: PublishPhase.unconfirmed,
        postId: postId,
        message: failure.message,
      );
    }
    if (!failure.code.isUnknownOutcome || phase == PublishPhase.failed) {
      return PublishTargetStatus(
        target: target,
        phase: PublishPhase.failed,
        postId: postId,
        message: failure.message,
        canRetry: phase == PublishPhase.failed,
      );
    }

    // The call never came back: the platform may have taken the post, so the
    // row is asked until it settles.
    final settled = await _settle(postId);
    final settledPhase = settled == null ? null : _phaseOf(settled);
    if (settledPhase == PublishPhase.published) {
      return PublishTargetStatus(
        target: target,
        phase: PublishPhase.published,
        postId: postId,
        platformId: result?.platformId,
      );
    }
    if (settledPhase == PublishPhase.failed) {
      // The row is read once more before a retry is offered: the row is the
      // only proof that the post did not go out.
      final fresh = await _readRow(postId);
      final freshPhase = _phaseOf(fresh);
      if (freshPhase == PublishPhase.published) {
        return PublishTargetStatus(
          target: target,
          phase: PublishPhase.published,
          postId: postId,
          platformId: result?.platformId,
        );
      }
      return PublishTargetStatus(
        target: target,
        phase: PublishPhase.failed,
        postId: postId,
        message: failure.message,
        canRetry: freshPhase == PublishPhase.failed,
      );
    }
    return PublishTargetStatus(
      target: target,
      phase: PublishPhase.unconfirmed,
      postId: postId,
      message: failure.message,
    );
  }

  /// What the row says about the post's fate.
  ///
  /// A row with a published time went out even when its status says
  /// otherwise: the functions write the time when the platform takes the
  /// post, and a later failure does not clear it.
  PublishPhase? _phaseOf(PostRow? row) {
    if (row == null) return null;
    if (row.publishedAt != null || row.status == PostStatus.published) {
      return PublishPhase.published;
    }
    if (row.status == PostStatus.failed) return PublishPhase.failed;
    if (row.status == PostStatus.scheduled) return PublishPhase.scheduled;
    return null;
  }

  /// The row as it is now. Null when the row is gone or the queue did not
  /// answer.
  Future<PostRow?> _readRow(String postId) async {
    try {
      return await ref.read(postsRepositoryProvider).read(postId);
    } on PostsException {
      _log.warning('The queue did not answer about the row.');
      return null;
    }
  }

  /// Waits for the row to settle after an unknown outcome.
  ///
  /// The wait is bounded: the function is still working, and the admin must
  /// not watch a spinner forever.
  Future<PostRow?> _settle(String postId) async {
    final policy = ref.read(publishPollPolicyProvider);
    for (var attempt = 0; attempt < policy.attempts; attempt++) {
      await Future<void>.delayed(policy.interval);
      final PostRow? row;
      try {
        row = await ref.read(postsRepositoryProvider).read(postId);
      } on PostsException {
        // The queue is not answering, so the row will not settle either.
        // Waiting longer would only keep the admin in front of a spinner.
        return null;
      }
      if (row == null) continue;
      if (_phaseOf(row) != null) return row;
    }
    return null;
  }

  /// Puts a failed row back into the queue.
  ///
  /// The retry never sends the call again: the row goes back to `scheduled`
  /// and the scheduler publishes it, so one publisher is always in charge.
  /// The move only happens where the row is still failed, so a row that went
  /// out in the meantime is never published twice.
  Future<void> retry(PublishTargetStatus status) async {
    final postId = status.postId;
    if (postId == null || !status.canRetry) return;
    final when = DateTime.now().add(const Duration(seconds: 60));
    final bool changed;
    try {
      changed = await ref
          .read(postsRepositoryProvider)
          .rescheduleFailed(postId, when);
    } on PostsException catch (error) {
      _log.warning('The queue refused to move the failed post back.');
      _replace(
        PublishTargetStatus(
          target: status.target,
          phase: PublishPhase.failed,
          postId: postId,
          message: error.message,
          canRetry: true,
        ),
      );
      return;
    }
    if (changed) {
      _replace(
        PublishTargetStatus(
          target: status.target,
          phase: PublishPhase.scheduled,
          postId: postId,
          scheduledAt: when,
          message: 'It goes out in a minute.',
        ),
      );
      return;
    }
    // The row is not failed any more, so the truth is read again.
    final row = await _readRow(postId);
    final phase = _phaseOf(row);
    _replace(
      PublishTargetStatus(
        target: status.target,
        phase: phase ?? PublishPhase.failed,
        postId: postId,
        message: phase == PublishPhase.failed
            ? status.message
            : 'The row changed. Its status is now ${_labelOf(phase)}.',
        canRetry: phase == PublishPhase.failed,
      ),
    );
  }

  /// The name of a status, for the sentence the screen shows.
  String _labelOf(PublishPhase? phase) => switch (phase) {
    PublishPhase.published => 'published',
    PublishPhase.scheduled => 'scheduled',
    PublishPhase.failed => 'failed',
    PublishPhase.unconfirmed => 'not confirmed',
    PublishPhase.waiting => 'waiting',
    PublishPhase.publishing => 'publishing',
    null => 'unknown',
  };

  /// Puts one target's new state into the list the screen shows.
  void _replace(PublishTargetStatus updated) {
    final current = state;
    if (current is PublishRunning) {
      state = PublishRunning(_replaced(current.statuses, updated));
    } else if (current is PublishDone) {
      state = PublishDone(_replaced(current.statuses, updated));
    }
  }

  List<PublishTargetStatus> _replaced(
    List<PublishTargetStatus> statuses,
    PublishTargetStatus updated,
  ) => [
    for (final status in statuses)
      if (status.target.id == updated.target.id) updated else status,
  ];

  /// The row one target needs.
  ///
  /// The caption, the account and the media stay on the server; the row only
  /// points at them.
  PostDraft _draft(
    PublishTarget target,
    PublishSelection selection,
    String videoId, {
    required String id,
    DateTime? when,
  }) {
    final caption = (selection.captions[target.id] ?? '').trim();
    final title = selection.youtubeTitle.trim();
    return PostDraft(
      id: id,
      videoId: videoId,
      platform: target.platform.name,
      accountId: target.accountId,
      postType: target.postType.name,
      scheduledAt: when ?? DateTime.now(),
      status: when == null ? 'processing' : 'scheduled',
      caption: caption.isEmpty ? null : caption,
      hashtags: null,
      containsAlteredContent: selection.aiCaptionTargetIds.contains(target.id),
      metadata: target.platform == PublishPlatform.youtube && title.isNotEmpty
          ? {'youtube_video_title': title}
          : null,
    );
  }
}
