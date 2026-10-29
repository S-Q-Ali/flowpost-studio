import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../publishing/data/posts_repository.dart';
import '../domain/calendar_range.dart';
import '../domain/scheduled_post.dart';
import '../scheduling_controller.dart';

/// The admin's posts by day (SPEC-scheduling "The calendar").
class CalendarPage extends ConsumerWidget {
  const CalendarPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final view = ref.watch(calendarViewProvider);
    final anchor = ref.watch(calendarAnchorProvider);
    final state = ref.watch(calendarControllerProvider);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Calendar', style: theme.textTheme.headlineSmall),
              const SizedBox(height: 4),
              Text(
                'What is going out, by day. The times are in your own clock.',
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: 16),
              _Toolbar(view: view, anchor: anchor),
              const SizedBox(height: 16),
              Expanded(
                child: state.when(
                  data: (posts) => posts.isEmpty
                      ? _EmptyCalendar(view: view)
                      : switch (view) {
                          CalendarView.list => _DayList(posts: posts),
                          _ => _CalendarGrid(
                            view: view,
                            anchor: anchor,
                            posts: posts,
                          ),
                        },
                  loading: () => const _Skeleton(),
                  error: (error, stackTrace) => _CalendarError(
                    message: error is PostsException
                        ? error.message
                        : 'The calendar could not be read.',
                    onRetry: () => ref.invalidate(calendarControllerProvider),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The title, the three views and the arrows that move through time.
class _Toolbar extends ConsumerWidget {
  const _Toolbar({required this.view, required this.anchor});

  final CalendarView view;
  final DateTime anchor;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Row(
      children: [
        Expanded(
          child: Text(
            calendarTitle(view, anchor),
            style: Theme.of(context).textTheme.titleLarge,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        SegmentedButton<CalendarView>(
          segments: [
            for (final option in CalendarView.values)
              ButtonSegment(value: option, label: Text(option.label)),
          ],
          selected: {view},
          showSelectedIcon: false,
          onSelectionChanged: (selection) =>
              ref.read(calendarViewProvider.notifier).select(selection.first),
        ),
        const SizedBox(width: 8),
        IconButton(
          key: const Key('calendar-prev'),
          tooltip: 'Previous',
          onPressed: () => ref.read(calendarAnchorProvider.notifier).step(-1),
          icon: const Icon(Icons.chevron_left),
        ),
        IconButton(
          key: const Key('calendar-next'),
          tooltip: 'Next',
          onPressed: () => ref.read(calendarAnchorProvider.notifier).step(1),
          icon: const Icon(Icons.chevron_right),
        ),
        const SizedBox(width: 8),
        FilledButton.icon(
          key: const Key('calendar-new'),
          onPressed: () => context.go(uploadRoute),
          icon: const Icon(Icons.add),
          label: const Text('New post'),
        ),
      ],
    );
  }
}

/// The month or the week as a grid of days.
class _CalendarGrid extends StatelessWidget {
  const _CalendarGrid({
    required this.view,
    required this.anchor,
    required this.posts,
  });

  final CalendarView view;
  final DateTime anchor;
  final List<ScheduledPost> posts;

  @override
  Widget build(BuildContext context) {
    final weeks = view == CalendarView.week
        ? [weekDays(anchor)]
        : _chunks(monthCells(anchor));
    return Column(
      children: [
        if (view == CalendarView.month) const _WeekdayHeader(),
        Expanded(
          child: Column(
            children: [
              for (final week in weeks)
                Expanded(
                  child: Row(
                    children: [
                      for (final day in week)
                        Expanded(
                          child: _DayCell(
                            day: day,
                            posts: day == null ? const [] : postsOn(posts, day),
                            named: view == CalendarView.week,
                          ),
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

List<List<DateTime?>> _chunks(List<DateTime?> cells) => [
  for (var start = 0; start < cells.length; start += 7)
    cells.sublist(start, start + 7 > cells.length ? cells.length : start + 7),
];

class _WeekdayHeader extends StatelessWidget {
  const _WeekdayHeader();

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.labelSmall;
    return Row(
      children: [
        for (final name in _weekdayShort)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text(name, textAlign: TextAlign.center, style: style),
            ),
          ),
      ],
    );
  }
}

/// One day of the grid: its number, three posts at most, and a count.
class _DayCell extends StatelessWidget {
  const _DayCell({required this.day, required this.posts, required this.named});

  final DateTime? day;
  final List<ScheduledPost> posts;

  /// True in the week view, where each column is labelled with its weekday.
  final bool named;

  @override
  Widget build(BuildContext context) {
    final day = this.day;
    final border = Border.all(
      color: Theme.of(context).colorScheme.outlineVariant,
    );
    if (day == null) {
      return DecoratedBox(decoration: BoxDecoration(border: border));
    }
    final theme = Theme.of(context);
    final hidden = posts.length - 3;
    return Container(
      key: Key('calendar-day-${_dateKey(day)}'),
      decoration: BoxDecoration(border: border),
      padding: const EdgeInsets.all(4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            named
                ? '${_weekdayShort[day.weekday % 7]} ${day.day}'
                : '${day.day}',
            style: theme.textTheme.labelSmall,
          ),
          const SizedBox(height: 2),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final post in posts.take(3)) _PostChip(post: post),
                  if (hidden > 0)
                    Padding(
                      padding: const EdgeInsets.only(left: 2, top: 2),
                      child: Text(
                        '+$hidden more',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One post inside a day cell.
class _PostChip extends StatelessWidget {
  const _PostChip({required this.post});

  final ScheduledPost post;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = _statusColor(post.status, theme.colorScheme);
    return Container(
      key: Key('calendar-post-${post.id}'),
      margin: const EdgeInsets.only(bottom: 2),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        children: [
          Text(
            clockLabel(post.scheduledAt),
            style: theme.textTheme.labelSmall?.copyWith(color: color),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              post.videoTitle ?? 'Untitled media',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.labelSmall,
            ),
          ),
        ],
      ),
    );
  }
}

/// The same rows as the queue, grouped by day.
class _DayList extends StatelessWidget {
  const _DayList({required this.posts});

  final List<ScheduledPost> posts;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      children: [
        for (final day in groupByDay(posts)) ...[
          Padding(
            padding: const EdgeInsets.only(top: 12, bottom: 6),
            child: Text(dayLabel(day.day), style: theme.textTheme.titleSmall),
          ),
          for (final post in day.posts) _ListedPost(post: post),
        ],
      ],
    );
  }
}

/// One post in the list view.
class _ListedPost extends StatelessWidget {
  const _ListedPost({required this.post});

  final ScheduledPost post;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final where = post.accountName == null
        ? post.targetLabel
        : '${post.targetLabel} · ${post.accountName}';
    return Card(
      key: Key('calendar-post-${post.id}'),
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Text(
              clockLabel(post.scheduledAt),
              style: theme.textTheme.titleSmall,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    post.videoTitle ?? 'Untitled media',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium,
                  ),
                  Text(where, style: theme.textTheme.bodySmall),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              post.status.label,
              style: theme.textTheme.labelSmall?.copyWith(
                color: _statusColor(post.status, theme.colorScheme),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Color _statusColor(PostStatus status, ColorScheme scheme) => switch (status) {
  PostStatus.published => Colors.green.shade700,
  PostStatus.failed => FlowPostColors.destructive,
  _ => scheme.primary,
};

/// The date as the widget keys spell it.
String _dateKey(DateTime day) =>
    '${day.year}-${_two(day.month)}-${_two(day.day)}';

String _two(int value) => value.toString().padLeft(2, '0');

/// A month or a week with nothing on it.
class _EmptyCalendar extends StatelessWidget {
  const _EmptyCalendar({required this.view});

  final CalendarView view;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.calendar_month_outlined,
            size: 56,
            color: theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 12),
          Text(
            view == CalendarView.week
                ? 'No posts this week'
                : 'No posts this month',
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            'Schedule a post and it will show up here.',
            style: theme.textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}

/// The calendar could not be read.
class _CalendarError extends StatelessWidget {
  const _CalendarError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cloud_off, size: 48, color: theme.colorScheme.error),
          const SizedBox(height: 12),
          Text(
            message,
            key: const Key('calendar-error'),
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          OutlinedButton(
            key: const Key('calendar-retry'),
            onPressed: onRetry,
            child: const Text('Try again'),
          ),
        ],
      ),
    );
  }
}

/// The shape of the rows while the range is read.
class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      children: [
        for (var row = 0; row < 5; row++)
          Expanded(
            child: Row(
              children: [
                for (var column = 0; column < 7; column++)
                  Expanded(
                    child: Container(
                      margin: const EdgeInsets.all(2),
                      decoration: BoxDecoration(
                        color: scheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

const List<String> _weekdayShort = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
];
