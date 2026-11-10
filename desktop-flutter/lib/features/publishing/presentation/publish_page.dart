import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/media_format.dart';
import '../../../core/providers/app_providers.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/time/time_zone.dart';
import '../../media/captions/captions_providers.dart';
import '../../media/media_providers.dart';
import '../../media/upload/upload_providers.dart';
import '../../offline/connectivity.dart';
import '../../offline/offline_providers.dart';
import '../domain/publish_selection.dart';
import '../domain/publish_target.dart';
import '../domain/publish_validation.dart';
import '../publishing_controller.dart';
import '../publishing_providers.dart';

class PublishPage extends ConsumerWidget {
  const PublishPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final media = ref.watch(publishedMediaProvider);
    final targetsState = ref.watch(publishTargetsProvider);
    final targets = targetsState.value ?? const [];
    final selection = ref.watch(publishSelectionProvider);
    final selected = ref.watch(selectedTargetsProvider);
    final validation = ref.watch(publishValidationProvider);
    final state = ref.watch(publishControllerProvider);
    final canPublish = ref.watch(canPublishProvider);
    final restore = ref.watch(draftRestoreProvider);
    final offline = ref.watch(connectivityProvider) == ConnectionStatus.offline;
    final running = state is PublishRunning;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Publish', style: theme.textTheme.headlineSmall),
              const SizedBox(height: 4),
              Text(
                'Choose the platforms, write the caption, and send it out.',
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: 16),
              if (media == null) ...[
                const _EmptyMediaHero(),
                const _SavedDrafts(),
              ] else ...[
                _MediaSummary(fileName: media.fileName, size: media.size),
                if (ref.watch(draftSaveWarningProvider))
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      'The draft could not be saved. The form stays here, '
                      'but it will not come back after a restart.',
                      key: const Key('draft-save-warning'),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.error,
                      ),
                    ),
                  ),
                if (restore != null) ...[
                  const SizedBox(height: 8),
                  _DraftBanner(restore: restore),
                ],
                const SizedBox(height: 24),
                if (targets.isEmpty) ...[
                  Text(_noTargetsMessage(targetsState)),
                  // The connect and the reconnect both live on the Accounts
                  // screen, so the sentence that names it is a button.
                  if (!targetsState.isLoading)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: TextButton(
                        key: const Key('open-accounts'),
                        onPressed: () => context.go(accountsRoute),
                        child: const Text('Open Accounts'),
                      ),
                    ),
                ] else ...[
                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    alignment: WrapAlignment.spaceBetween,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text('Platforms', style: theme.textTheme.titleSmall),
                      Wrap(
                        spacing: 4,
                        children: [
                          TextButton(
                            onPressed: () => ref
                                .read(publishSelectionProvider.notifier)
                                .selectAll(targets),
                            child: const Text('Select all'),
                          ),
                          TextButton(
                            onPressed: () => ref
                                .read(publishSelectionProvider.notifier)
                                .deselectAll(),
                            child: const Text('Deselect all'),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  for (final target in targets)
                    _TargetTile(
                      target: target,
                      selected: selection.targetIds.contains(target.id),
                    ),
                  if (selected.isNotEmpty && state is PublishIdle) ...[
                    const SizedBox(height: 16),
                    _SmartAiCaptionButton(selectedTargets: selected),
                  ],
                  const SizedBox(height: 16),
                  for (final target in selected)
                    _CaptionSection(
                      target: target,
                      caption: selection.captions[target.id] ?? '',
                      issues: validation.forTarget(target.id),
                    ),
                  if (selected.any(
                    (target) => target.platform == PublishPlatform.youtube,
                  )) ...[
                    _TitleField(title: selection.youtubeTitle),
                  ],
                  if (selected.isNotEmpty && state is PublishIdle) ...[
                    const SizedBox(height: 16),
                    _CreatorControls(
                      selection: selection,
                      selectedTargets: selected,
                    ),
                  ],
                  const SizedBox(height: 16),
                  _ModePicker(mode: selection.mode),
                  if (selection.isScheduled) ...[
                    const SizedBox(height: 12),
                    _ScheduleFields(
                      date: selection.scheduleDate,
                      time: selection.scheduleTime,
                    ),
                  ],
                ],
                const SizedBox(height: 16),
                ..._issueLines(context, validation),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 12,
                  runSpacing: 8,
                  children: [
                    FilledButton.icon(
                      onPressed:
                          canPublish &&
                              validation.isValid &&
                              !running &&
                              !_alreadySent(
                                state,
                                selection: selection,
                                targets: selected,
                                videoId: media.videoId,
                              )
                          ? () => ref
                                .read(publishControllerProvider.notifier)
                                .publish(
                                  selection: selection,
                                  targets: selected,
                                  videoId: media.videoId,
                                )
                          : null,
                      icon: const Icon(Icons.send),
                      label: Text(
                        selection.isScheduled ? 'Schedule' : 'Publish now',
                      ),
                    ),
                  ],
                ),
                if (_alreadySent(
                  state,
                  selection: selection,
                  targets: selected,
                  videoId: media.videoId,
                ))
                  const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: Text(
                      'This exact post is already sent. Change the file, the '
                      'caption or the time to send another.',
                      key: Key('publish-repeat-blocked'),
                    ),
                  ),
                if (!canPublish)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      offline
                          ? 'A connection is needed to publish.'
                          : 'Activate a license to publish.',
                      key: const Key('publish-blocked'),
                    ),
                  ),
              ],
              const SizedBox(height: 24),
              ..._statusSection(context, state),
            ],
          ),
        ),
      ),
    );
  }
}

/// What the compose screen says when there is nothing to pick.
///
/// A list that is still being read, or could not be read, is not an empty
/// list: the admin would look for a connection that may already be there.
String _noTargetsMessage(AsyncValue<List<PublishTarget>> targets) {
  if (targets.isLoading) return 'Loading the accounts on your server.';
  if (targets.hasError) return 'The connected accounts could not be read.';
  return 'Nothing here can publish yet. Connect or reconnect an account in '
      'Accounts.';
}

/// Whether these exact inputs already went out in the finished run.
///
/// The button is off while this holds: the rows are written, and a second
/// click with the same file, picks, captions and time would only post the
/// same thing again.
bool _alreadySent(
  PublishState state, {
  required PublishSelection selection,
  required List<PublishTarget> targets,
  required String videoId,
}) =>
    state is PublishDone &&
    state.signature ==
        publishSignature(
          selection: selection,
          targets: targets,
          videoId: videoId,
        );

/// The reasons the form is not ready.
List<Widget> _issueLines(BuildContext context, PublishValidation validation) {
  if (validation.isValid) return const [];
  final scheme = Theme.of(context).colorScheme;
  return [
    // An issue of a target is already shown under that target's field, and
    // an issue of the schedule is already shown under the date and the time,
    // so only the issues of the form itself are listed here.
    for (final issue in validation.issues)
      if (issue.targetId == null && !issue.shownUnderField)
        Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.error_outline, size: 18, color: scheme.error),
              const SizedBox(width: 8),
              Expanded(child: Text(issue.message)),
            ],
          ),
        ),
  ];
}

/// What each platform answered.
List<Widget> _statusSection(BuildContext context, PublishState state) {
  final statuses = switch (state) {
    PublishIdle() => const <PublishTargetStatus>[],
    PublishRunning(statuses: final statuses) => statuses,
    PublishDone(statuses: final statuses) => statuses,
  };
  if (statuses.isEmpty) return const [];

  int completed = 0;
  String currentTargetName = '';
  for (final s in statuses) {
    if (s.phase == PublishPhase.published ||
        s.phase == PublishPhase.scheduled ||
        s.phase == PublishPhase.failed) {
      completed++;
    } else if (s.phase == PublishPhase.publishing) {
      currentTargetName = s.target.label;
    }
  }
  final double progress = statuses.isNotEmpty
      ? completed / statuses.length
      : 0.0;

  return [
    Text('Status', style: Theme.of(context).textTheme.titleSmall),
    const SizedBox(height: 8),
    if (state is PublishRunning) ...[
      Card(
        elevation: 0,
        color: Theme.of(context).colorScheme.primaryContainer
            .withValues(alpha: 0.3),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Publishing in progress ($completed of ${statuses.length} complete)...',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              LinearProgressIndicator(
                value: progress > 0 ? progress : null,
                minHeight: 6,
                borderRadius: BorderRadius.circular(4),
              ),
              if (currentTargetName.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  'Active target: $currentTargetName',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ],
          ),
        ),
      ),
      const SizedBox(height: 12),
    ],
    for (final status in statuses)
      Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: _StatusRow(status: status),
      ),
  ];
}

/// Hero card when no media has been selected yet.
class _EmptyMediaHero extends ConsumerWidget {
  const _EmptyMediaHero();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 24),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.cloud_upload_outlined,
                  size: 36,
                  color: theme.colorScheme.primary,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'Upload a file first, then publish it from here.',
                style: theme.textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 4),
              Text(
                'Pick a video (MP4, MOV, MKV) or image to publish across platforms.',
                style: theme.textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                icon: const Icon(Icons.file_open_outlined, size: 18),
                label: const Text('Choose file'),
                onPressed: () =>
                    ref.read(mediaControllerProvider.notifier).pickFile(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The file that goes out.
class _MediaSummary extends ConsumerWidget {
  const _MediaSummary({required this.fileName, required this.size});

  final String fileName;
  final int size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final uploadState = ref.watch(uploadControllerProvider);
    final isUploading = uploadState is UploadRunning;
    final progressFraction = isUploading ? uploadState.progress.fraction : 1.0;

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    Icons.movie_outlined,
                    color: theme.colorScheme.primary,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        fileName,
                        key: const Key('media-filename'),
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        formatMediaBytes(size),
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                if (isUploading)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.amber.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const SizedBox(
                          width: 12,
                          height: 12,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.amber,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'Uploading ${(progressFraction * 100).toInt()}%',
                          style: const TextStyle(
                            fontSize: 12,
                            color: Colors.amber,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  )
                else
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.green.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.check_circle, size: 14, color: Colors.green),
                        SizedBox(width: 4),
                        Text(
                          'Ready',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.green,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            if (isUploading) ...[
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progressFraction > 0 ? progressFraction : null,
                  minHeight: 4,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// The drafts a restart kept, so a form written yesterday is not lost with
/// the upload that made it.
class _SavedDrafts extends ConsumerWidget {
  const _SavedDrafts();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final drafts = ref.watch(savedDraftsProvider);
    return drafts.maybeWhen(
      data: (drafts) {
        if (drafts.isEmpty) return const SizedBox.shrink();
        final theme = Theme.of(context);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 24),
            Text('Saved drafts', style: theme.textTheme.titleSmall),
            const SizedBox(height: 4),
            Text(
              'A draft keeps the form and its media. Open one to carry on.',
              style: theme.textTheme.bodySmall,
            ),
            for (final draft in drafts)
              ListTile(
                key: Key('draft-${draft.videoId}'),
                contentPadding: EdgeInsets.zero,
                title: Text(draft.fileName ?? 'Draft'),
                subtitle: Text(_savedLabel(draft.savedAt)),
                trailing: Wrap(
                  children: [
                    TextButton(
                      key: Key('draft-open-${draft.videoId}'),
                      onPressed: () => ref
                          .read(publishSelectionProvider.notifier)
                          .openDraft(draft),
                      child: const Text('Open'),
                    ),
                    IconButton(
                      key: Key('draft-delete-${draft.videoId}'),
                      tooltip: 'Delete draft',
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () async {
                        await ref
                            .read(draftsRepositoryProvider)
                            .delete(draft.videoId);
                        ref.invalidate(savedDraftsProvider);
                      },
                    ),
                  ],
                ),
              ),
          ],
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}

String _savedLabel(DateTime savedAt) {
  final local = savedAt.toLocal();
  String two(int value) => value.toString().padLeft(2, '0');
  return 'Saved ${local.year}-${two(local.month)}-${two(local.day)} '
      '${two(local.hour)}:${two(local.minute)}';
}

/// What came back from the machine, and whether its time still means what it
/// did (SPEC-offline "The conflict rule").
class _DraftBanner extends ConsumerWidget {
  const _DraftBanner({required this.restore});

  final DraftRestore restore;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final saved = restore.savedInstant;
    final now = restore.nowInstant;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.restore, size: 18, color: theme.primaryText),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Restored from ${_clock(restore.savedAt.toLocal())}',
                key: const Key('draft-restored'),
                style: theme.textTheme.bodyMedium,
              ),
            ),
            TextButton(
              key: const Key('draft-discard'),
              onPressed: () =>
                  ref.read(publishSelectionProvider.notifier).discard(),
              child: const Text('Discard draft'),
            ),
          ],
        ),
        if (restore.timeMoved) ...[
          Text(
            'The time you typed is ${formatLocalSchedule(now!.toLocal())} '
            'here. The draft was saved for '
            '${formatLocalSchedule(saved!.toLocal())}. Which one did you '
            'mean?',
            key: const Key('draft-time-moved'),
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.error,
            ),
          ),
          Wrap(
            spacing: 8,
            children: [
              OutlinedButton(
                key: const Key('draft-keep-typed'),
                onPressed: () =>
                    ref.read(draftRestoreProvider.notifier).keepTyped(),
                child: const Text('Keep the time I typed'),
              ),
              TextButton(
                key: const Key('draft-use-saved'),
                onPressed: () => ref
                    .read(publishSelectionProvider.notifier)
                    .useSavedTime(saved),
                child: const Text('Use the saved time'),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

String _clock(DateTime local) =>
    '${local.hour.toString().padLeft(2, '0')}:'
    '${local.minute.toString().padLeft(2, '0')}';

/// One account to publish to.
class _TargetTile extends ConsumerWidget {
  const _TargetTile({required this.target, required this.selected});

  final PublishTarget target;
  final bool selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isStory = target.postType == PostType.story;

    final (Color brandColor, IconData brandIcon) = switch (target.platform) {
      PublishPlatform.instagram => (
        const Color(0xFFE1306C),
        isStory ? Icons.auto_stories_rounded : Icons.camera_alt_outlined,
      ),
      PublishPlatform.youtube => (
        const Color(0xFFFF0000),
        Icons.play_circle_fill_rounded,
      ),
      PublishPlatform.facebook => (const Color(0xFF1877F2), Icons.facebook),
      PublishPlatform.tiktok => (
        const Color(0xFF00F2FE),
        Icons.music_note_rounded,
      ),
      PublishPlatform.linkedin => (
        const Color(0xFF0A66C2),
        Icons.business_rounded,
      ),
    };

    return Padding(
      padding: EdgeInsets.only(left: isStory ? 24.0 : 0.0, bottom: 8.0),
      child: Card(
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: selected
                ? brandColor.withValues(alpha: 0.7)
                : theme.colorScheme.outlineVariant.withValues(alpha: 0.35),
            width: selected ? 1.5 : 1.0,
          ),
        ),
        color: selected
            ? brandColor.withValues(alpha: 0.08)
            : theme.colorScheme.surfaceContainerLow,
        child: CheckboxListTile(
          key: Key('target-${target.id}'),
          value: selected,
          activeColor: brandColor,
          checkboxShape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(4),
          ),
          onChanged: (_) =>
              ref.read(publishSelectionProvider.notifier).toggle(target),
          secondary: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: brandColor.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(brandIcon, color: brandColor, size: 20),
          ),
          title: Row(
            children: [
              Text(
                target.label,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
              if (isStory) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: brandColor.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    '24h Story',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: brandColor,
                    ),
                  ),
                ),
              ],
            ],
          ),
          subtitle: Text(
            isStory
                ? '@${target.accountName} • Disappears in 24 hours'
                : '@${target.accountName}',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.8),
            ),
          ),
          controlAffinity: ListTileControlAffinity.trailing,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 4,
          ),
        ),
      ),
    );
  }
}

/// The caption of one platform, with the limit it has to stay under.
class _CaptionSection extends ConsumerWidget {
  const _CaptionSection({
    required this.target,
    required this.caption,
    required this.issues,
  });

  final PublishTarget target;
  final String caption;
  final List<PublishIssue> issues;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final limit = target.captionLimit;

    if (!target.takesCaption) {
      if (issues.isEmpty) return const SizedBox.shrink();
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final issue in issues)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  issue.message,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.error,
                  ),
                ),
              ),
          ],
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextFormField(
            key: Key('caption-${target.id}'),
            initialValue: caption,
            maxLines: null,
            decoration: InputDecoration(
              labelText: '${target.label} caption',
              border: const OutlineInputBorder(),
              helperText: limit == null
                  ? '${caption.length} characters'
                  : '${caption.length} / $limit',
            ),
            onChanged: (text) => ref
                .read(publishSelectionProvider.notifier)
                .setCaption(target.id, text),
          ),
          for (final issue in issues)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                issue.message,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.error,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// The title of a YouTube video.
class _TitleField extends ConsumerWidget {
  const _TitleField({required this.title});

  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextFormField(
        key: const Key('youtube-title'),
        initialValue: title,
        maxLines: null,
        decoration: const InputDecoration(
          labelText: 'YouTube title',
          border: OutlineInputBorder(),
        ),
        onChanged: (text) =>
            ref.read(publishSelectionProvider.notifier).setYouTubeTitle(text),
      ),
    );
  }
}

/// Publish now, or at a time.
class _ModePicker extends ConsumerWidget {
  const _ModePicker({required this.mode});

  final PublishMode mode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SegmentedButton<PublishMode>(
          segments: const [
            ButtonSegment(
              value: PublishMode.now,
              label: Text('Now'),
              icon: Icon(Icons.send),
            ),
            ButtonSegment(
              value: PublishMode.schedule,
              label: Text('Later'),
              icon: Icon(Icons.schedule),
            ),
          ],
          selected: {mode},
          onSelectionChanged: (selection) => ref
              .read(publishSelectionProvider.notifier)
              .setMode(selection.first),
        ),
        const SizedBox(height: 4),
        Text(
          mode == PublishMode.now
              ? 'The post goes out as soon as the publish call returns.'
              : 'The scheduler sends the post at the time you set.',
          style: theme.textTheme.bodySmall,
        ),
      ],
    );
  }
}

/// The time the post goes out, in the admin's own timezone.
class _ScheduleFields extends ConsumerWidget {
  const _ScheduleFields({required this.date, required this.time});

  final String date;
  final String time;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final local = parseLocalSchedule(date: date, time: time);
    final zone = ref.watch(timeZoneProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 12,
          runSpacing: 12,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SizedBox(
              width: 175,
              // A restored or re-chosen time has to replace the text in the
              // field, and `initialValue` only applies when the field is
              // built. The key is what rebuilds it.
              child: KeyedSubtree(
                key: ValueKey('date-$date'),
                child: TextFormField(
                  key: const Key('schedule-date'),
                  initialValue: date,
                  decoration: InputDecoration(
                    labelText: 'Date',
                    hintText: 'YYYY-MM-DD',
                    border: const OutlineInputBorder(),
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.calendar_month_outlined, size: 20),
                      tooltip: 'Select date',
                      onPressed: () async {
                        final parsed =
                            DateTime.tryParse(date) ?? DateTime.now();
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: parsed,
                          firstDate: DateTime.now().subtract(
                            const Duration(days: 1),
                          ),
                          lastDate: DateTime.now().add(
                            const Duration(days: 365),
                          ),
                        );
                        if (picked != null) {
                          final formatted =
                              '${picked.year.toString().padLeft(4, '0')}-'
                              '${picked.month.toString().padLeft(2, '0')}-'
                              '${picked.day.toString().padLeft(2, '0')}';
                          ref
                              .read(publishSelectionProvider.notifier)
                              .setScheduleDate(formatted);
                        }
                      },
                    ),
                  ),
                  onChanged: (text) => ref
                      .read(publishSelectionProvider.notifier)
                      .setScheduleDate(text),
                ),
              ),
            ),
            SizedBox(
              width: 145,
              child: KeyedSubtree(
                key: ValueKey('time-$time'),
                child: TextFormField(
                  key: const Key('schedule-time'),
                  initialValue: time,
                  decoration: InputDecoration(
                    labelText: 'Time',
                    hintText: 'HH:MM',
                    border: const OutlineInputBorder(),
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.access_time_rounded, size: 20),
                      tooltip: 'Select time',
                      onPressed: () async {
                        var initial = const TimeOfDay(hour: 12, minute: 0);
                        final parts = time.split(':');
                        if (parts.length == 2) {
                          final h = int.tryParse(parts[0]);
                          final m = int.tryParse(parts[1]);
                          if (h != null && m != null) {
                            initial = TimeOfDay(hour: h, minute: m);
                          }
                        }
                        final picked = await showTimePicker(
                          context: context,
                          initialTime: initial,
                        );
                        if (picked != null) {
                          final formatted =
                              '${picked.hour.toString().padLeft(2, '0')}:'
                              '${picked.minute.toString().padLeft(2, '0')}';
                          ref
                              .read(publishSelectionProvider.notifier)
                              .setScheduleTime(formatted);
                        }
                      },
                    ),
                  ),
                  onChanged: (text) => ref
                      .read(publishSelectionProvider.notifier)
                      .setScheduleTime(text),
                ),
              ),
            ),
          ],
        ),
        if (local != null) ...[
          const SizedBox(height: 8),
          ..._zoneLines(context, local, zone),
        ],
      ],
    );
  }

  /// What the typed time turned out to be, in the admin's own timezone.
  List<Widget> _zoneLines(BuildContext context, DateTime local, TimeZone zone) {
    final theme = Theme.of(context);
    final clock = resolveWallClock(wall: local, zone: zone);
    if (clock is SkippedClock) {
      return [
        Text(
          skippedTimeMessage(jumpFrom: clock.jumpFrom, jumpTo: clock.jumpTo),
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.error,
          ),
        ),
      ];
    }
    return [
      Text(
        'Your time: ${formatLocalSchedule(local)} '
        '(${formatZoneOffset(zone.offsetAt(local))})',
        style: theme.textTheme.bodySmall,
      ),
      Text(
        'Stored as ${clock.instant!.toIso8601String()}',
        style: theme.textTheme.bodySmall,
      ),
      if (clock is RepeatedClock)
        Text(repeatedTimeMessage(), style: theme.textTheme.bodySmall),
    ];
  }
}

/// What one platform's attempt did.
class _StatusRow extends ConsumerWidget {
  const _StatusRow({required this.status});

  final PublishTargetStatus status;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final (label, color) = switch (status.phase) {
      PublishPhase.waiting => ('Waiting', theme.colorScheme.onSurfaceVariant),
      PublishPhase.publishing => ('Publishing...', theme.primaryText),
      PublishPhase.published => ('Published', theme.success),
      PublishPhase.failed => ('Failed', theme.colorScheme.error),
      PublishPhase.unconfirmed => ('Not confirmed', theme.colorScheme.tertiary),
      PublishPhase.scheduled => ('Scheduled', theme.primaryText),
    };
    final messageColor = switch (status.phase) {
      PublishPhase.failed => theme.colorScheme.error,
      PublishPhase.unconfirmed => theme.colorScheme.tertiary,
      _ => theme.colorScheme.onSurfaceVariant,
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '${status.target.label}: $label',
          style: theme.textTheme.bodyMedium?.copyWith(color: color),
        ),
        if (status.platformId != null)
          Text(
            'Platform id: ${status.platformId}',
            style: theme.textTheme.bodySmall,
          ),
        if (status.scheduledAt != null)
          Text(
            'Goes out at ${formatLocalSchedule(status.scheduledAt!)}',
            style: theme.textTheme.bodySmall,
          ),
        if (status.message != null)
          Text(
            status.message!,
            style: theme.textTheme.bodySmall?.copyWith(color: messageColor),
          ),
        if (status.phase == PublishPhase.failed) ...[
          TextButton.icon(
            key: Key('retry-${status.target.id}'),
            onPressed: status.canRetry
                ? () =>
                      ref.read(publishControllerProvider.notifier).retry(status)
                : null,
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
          if (!status.canRetry)
            Text(
              'The queue is asked again before a retry, so the post is not '
              'sent twice.',
              style: theme.textTheme.bodySmall,
            ),
        ],
      ],
    );
  }
}

class _SmartAiCaptionButton extends ConsumerWidget {
  const _SmartAiCaptionButton({required this.selectedTargets});

  final List<PublishTarget> selectedTargets;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (selectedTargets.isEmpty) return const SizedBox.shrink();

    final captionState = ref.watch(captionControllerProvider);
    final mediaState = ref.watch(mediaControllerProvider);
    final job = mediaState is MediaReady ? mediaState.job : null;

    final theme = Theme.of(context);
    final isRunning = captionState is CaptionRunning;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          OutlinedButton.icon(
            onPressed: isRunning || job == null
                ? null
                : () async {
                    final platforms = selectedTargets
                        .map((t) => t.platform.name)
                        .toSet()
                        .toList();

                    await ref
                        .read(captionControllerProvider.notifier)
                        .generate(job, platforms: platforms);

                    final updated = ref.read(captionControllerProvider);
                    if (updated is CaptionReady) {
                      final captions = updated.result.captions;
                      for (final target in selectedTargets) {
                        String? text;
                        if (target.platform == PublishPlatform.youtube) {
                          text = captions['yt_video_description'];
                          final title = captions['yt_video_title'];
                          if (title != null && title.isNotEmpty) {
                            ref
                                .read(publishSelectionProvider.notifier)
                                .setYouTubeTitle(title);
                          }
                        } else if (target.platform ==
                                PublishPlatform.instagram ||
                            target.platform == PublishPlatform.facebook) {
                          final body =
                              captions['fb_ig_caption'] ??
                              captions['caption'] ??
                              '';
                          final tags = captions['hashtags'] ?? '';
                          text = [
                            body,
                            tags,
                          ].where((s) => s.isNotEmpty).join('\n\n');
                        } else if (target.platform == PublishPlatform.tiktok) {
                          final body = captions['tiktok_caption'] ?? '';
                          final tags = captions['hashtags'] ?? '';
                          text = [
                            body,
                            tags,
                          ].where((s) => s.isNotEmpty).join('\n\n');
                        }
                        if (text != null && text.isNotEmpty) {
                          ref
                              .read(publishSelectionProvider.notifier)
                              .setCaption(target.id, text);
                        }
                      }
                    }
                  },
            icon: isRunning
                ? const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.auto_awesome, size: 16),
            label: Text(
              isRunning
                  ? 'Writing captions...'
                  : 'Generate AI Captions (${selectedTargets.length} platform${selectedTargets.length == 1 ? '' : 's'})',
            ),
          ),
          if (captionState is CaptionRunning) ...[
            const SizedBox(height: 8),
            LinearProgressIndicator(
              value: captionState.progress.fraction > 0
                  ? captionState.progress.fraction
                  : null,
            ),
            const SizedBox(height: 4),
            Text(
              captionState.progress.message,
              style: theme.textTheme.bodySmall,
            ),
          ] else if (captionState is CaptionFailed) ...[
            const SizedBox(height: 8),
            Text(
              captionState.message,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _CreatorControls extends ConsumerWidget {
  const _CreatorControls({
    required this.selection,
    required this.selectedTargets,
  });

  final PublishSelection selection;
  final List<PublishTarget> selectedTargets;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (selectedTargets.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final hasIg = selectedTargets.any(
      (t) => t.platform == PublishPlatform.instagram,
    );
    final hasYt = selectedTargets.any(
      (t) => t.platform == PublishPlatform.youtube,
    );

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: theme.dividerColor.withValues(alpha: 0.2)),
      ),
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 16),
        leading: Icon(Icons.tune, size: 20, color: theme.colorScheme.primary),
        title: Text(
          'Platform Options & AI Disclosure',
          style: theme.textTheme.titleSmall,
        ),
        subtitle: selection.containsAlteredContent
            ? Text(
                'AI Content disclosed',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.primary,
                ),
              )
            : null,
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            secondary: const Icon(Icons.auto_awesome),
            title: const Text('AI-Generated / Altered Content'),
            subtitle: const Text(
              'Discloses synthetic or AI-altered media to Instagram, Facebook and YouTube per platform policies.',
            ),
            value: selection.containsAlteredContent,
            onChanged: (v) => ref
                .read(publishSelectionProvider.notifier)
                .setContainsAlteredContent(v),
          ),
          if (hasIg) ...[
            const Divider(),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              secondary: const Icon(Icons.grid_on),
              title: const Text('Instagram: Share Reel to Profile Grid'),
              subtitle: const Text(
                'Shows the published Reel on your main profile feed as well as the Reels tab.',
              ),
              value: selection.shareToFeed,
              onChanged: (v) =>
                  ref.read(publishSelectionProvider.notifier).setShareToFeed(v),
            ),
            const SizedBox(height: 8),
            TextFormField(
              initialValue: selection.thumbOffsetMs != null
                  ? (selection.thumbOffsetMs! / 1000).toString()
                  : '',
              decoration: const InputDecoration(
                labelText: 'Instagram: Cover Frame Offset (seconds)',
                border: OutlineInputBorder(),
                helperText:
                    'Pick video timestamp for cover thumbnail (e.g. 1.5)',
              ),
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              onChanged: (v) {
                final sec = double.tryParse(v.trim());
                ref
                    .read(publishSelectionProvider.notifier)
                    .setThumbOffsetMs(
                      sec != null ? (sec * 1000).round() : null,
                    );
              },
            ),
          ],
          if (hasYt) ...[
            const Divider(),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              secondary: const Icon(Icons.child_care),
              title: const Text('YouTube: Made for Kids'),
              subtitle: const Text(
                'Mark whether this video is directed to children (COPPA).',
              ),
              value: selection.madeForKids,
              onChanged: (v) =>
                  ref.read(publishSelectionProvider.notifier).setMadeForKids(v),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              secondary: const Icon(Icons.notifications_active_outlined),
              title: const Text('YouTube: Notify Subscribers'),
              subtitle: const Text(
                'Send notification to channel subscribers on publish.',
              ),
              value: selection.notifySubscribers,
              onChanged: (v) => ref
                  .read(publishSelectionProvider.notifier)
                  .setNotifySubscribers(v),
            ),
            const SizedBox(height: 8),
            TextFormField(
              initialValue: selection.youtubeTags,
              decoration: const InputDecoration(
                labelText: 'YouTube SEO Tags',
                border: OutlineInputBorder(),
                helperText: 'Comma-separated search tags (e.g. tutorial, coding, flutter)',
              ),
              onChanged: (v) =>
                  ref.read(publishSelectionProvider.notifier).setYoutubeTags(v),
            ),
          ],
        ],
      ),
    );
  }
}
