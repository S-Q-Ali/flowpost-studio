import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format/media_format.dart';
import '../../../core/providers/app_providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/time/time_zone.dart';
import '../../offline/connectivity.dart';
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
    final targets = ref.watch(publishTargetsProvider);
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
              if (media == null)
                const Text('Upload a file first, then publish it from here.')
              else ...[
                _MediaSummary(fileName: media.fileName, size: media.size),
                if (restore != null) ...[
                  const SizedBox(height: 8),
                  _DraftBanner(restore: restore),
                ],
                const SizedBox(height: 24),
                if (targets.isEmpty)
                  const Text('No accounts are connected yet.')
                else ...[
                  Text('Platforms', style: theme.textTheme.titleSmall),
                  const SizedBox(height: 8),
                  for (final target in targets)
                    _TargetTile(
                      target: target,
                      selected: selection.targetIds.contains(target.id),
                    ),
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
                      onPressed: canPublish && validation.isValid && !running
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
                if (!canPublish)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      offline
                          ? 'A connection is needed to publish.'
                          : 'Sign in required to publish.',
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
  return [
    Text('Status', style: Theme.of(context).textTheme.titleSmall),
    const SizedBox(height: 8),
    for (final status in statuses)
      Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: _StatusRow(status: status),
      ),
  ];
}

/// The file that goes out.
class _MediaSummary extends StatelessWidget {
  const _MediaSummary({required this.fileName, required this.size});

  final String fileName;
  final int size;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(fileName, style: theme.textTheme.titleMedium),
        const SizedBox(height: 2),
        Text(formatMediaBytes(size), style: theme.textTheme.bodySmall),
      ],
    );
  }
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
            const Icon(
              Icons.restore,
              size: 18,
              color: FlowPostColors.primaryText,
            ),
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
    return CheckboxListTile(
      key: Key('target-${target.id}'),
      value: selected,
      onChanged: (_) =>
          ref.read(publishSelectionProvider.notifier).toggle(target),
      title: Text(target.label),
      subtitle: Text(target.accountName),
      controlAffinity: ListTileControlAffinity.leading,
      contentPadding: EdgeInsets.zero,
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (target.takesCaption) ...[
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
          ],
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
              width: 160,
              // A restored or re-chosen time has to replace the text in the
              // field, and `initialValue` only applies when the field is
              // built. The key is what rebuilds it.
              child: KeyedSubtree(
                key: ValueKey('date-$date'),
                child: TextFormField(
                  key: const Key('schedule-date'),
                  initialValue: date,
                  decoration: const InputDecoration(
                    labelText: 'Date',
                    hintText: 'YYYY-MM-DD',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (text) => ref
                      .read(publishSelectionProvider.notifier)
                      .setScheduleDate(text),
                ),
              ),
            ),
            SizedBox(
              width: 120,
              child: KeyedSubtree(
                key: ValueKey('time-$time'),
                child: TextFormField(
                  key: const Key('schedule-time'),
                  initialValue: time,
                  decoration: const InputDecoration(
                    labelText: 'Time',
                    hintText: 'HH:MM',
                    border: OutlineInputBorder(),
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
      PublishPhase.publishing => ('Publishing...', FlowPostColors.primaryText),
      PublishPhase.published => ('Published', Colors.green.shade900),
      PublishPhase.failed => ('Failed', theme.colorScheme.error),
      PublishPhase.unconfirmed => ('Not confirmed', theme.colorScheme.tertiary),
      PublishPhase.scheduled => ('Scheduled', FlowPostColors.primaryText),
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
