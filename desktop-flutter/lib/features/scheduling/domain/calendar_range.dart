import 'scheduled_post.dart';

/// The three ways the calendar shows the same rows.
enum CalendarView {
  month('Month'),
  week('Week'),
  list('List');

  const CalendarView(this.label);

  final String label;
}

/// The days the calendar is showing, as local midnights.
///
/// [start] is the first day, [end] the day after the last one, so a range is
/// asked for as `start <= day < end`.
class CalendarRange {
  const CalendarRange({required this.start, required this.end});

  final DateTime start;
  final DateTime end;
}

/// The same date without its time.
DateTime dateOnly(DateTime value) =>
    DateTime(value.year, value.month, value.day);

/// The days the view is showing for the anchor the admin is standing on.
CalendarRange calendarRange(CalendarView view, DateTime anchor) {
  if (view == CalendarView.week) {
    final start = _weekStart(anchor);
    return CalendarRange(start: start, end: _addDays(start, 7));
  }
  final start = DateTime(anchor.year, anchor.month, 1);
  return CalendarRange(
    start: start,
    end: DateTime(start.year, start.month + 1),
  );
}

/// The month's cells, Sunday first, padded with nulls so every row is seven
/// days long.
List<DateTime?> monthCells(DateTime anchor) {
  final start = DateTime(anchor.year, anchor.month, 1);
  final days = DateTime(start.year, start.month + 1, 0).day;
  final cells = <DateTime?>[
    for (var blank = 0; blank < start.weekday % 7; blank++) null,
    for (var day = 1; day <= days; day++)
      DateTime(start.year, start.month, day),
  ];
  while (cells.length % 7 != 0) {
    cells.add(null);
  }
  return cells;
}

/// The seven days of the anchor's week, Sunday first.
List<DateTime> weekDays(DateTime anchor) {
  final start = _weekStart(anchor);
  return [for (var day = 0; day < 7; day++) _addDays(start, day)];
}

/// The anchor [steps] views away: a month, or a week.
DateTime stepAnchor(CalendarView view, DateTime anchor, int steps) {
  if (view == CalendarView.week) {
    return _addDays(dateOnly(anchor), steps * 7);
  }
  return DateTime(anchor.year, anchor.month + steps, 1);
}

/// What the screen says it is showing.
String calendarTitle(CalendarView view, DateTime anchor) {
  if (view != CalendarView.week) {
    return '${_monthNames[anchor.month - 1]} ${anchor.year}';
  }
  final first = _weekStart(anchor);
  final last = _addDays(first, 6);
  final firstMonth = _monthNames[first.month - 1];
  final lastMonth = _monthNames[last.month - 1];
  if (first.year == last.year && first.month == last.month) {
    return '${first.day}–${last.day} $firstMonth ${first.year}';
  }
  if (first.year == last.year) {
    return '${first.day} $firstMonth – ${last.day} $lastMonth ${first.year}';
  }
  return '${first.day} $firstMonth ${first.year} – '
      '${last.day} $lastMonth ${last.year}';
}

/// A day in full, for the list view's headings.
String dayLabel(DateTime day) =>
    '${_weekdayNames[day.weekday - 1]}, ${day.day} '
    '${_monthNames[day.month - 1]} ${day.year}';

/// The clock time of an instant, in the machine's zone.
String clockLabel(DateTime? instant) {
  if (instant == null) return '—';
  final local = instant.toLocal();
  return '${_two(local.hour)}:${_two(local.minute)}';
}

/// One day of the list view.
class CalendarDay {
  const CalendarDay({required this.day, required this.posts});

  final DateTime day;
  final List<ScheduledPost> posts;
}

/// The posts on each day they go out, days in order and posts in time order.
///
/// A row with no time cannot be placed on a calendar, so it is left out.
List<CalendarDay> groupByDay(Iterable<ScheduledPost> posts) {
  final byDay = <DateTime, List<ScheduledPost>>{};
  for (final post in posts) {
    final at = post.scheduledAt;
    if (at == null) continue;
    (byDay[dateOnly(at.toLocal())] ??= []).add(post);
  }
  final days = byDay.keys.toList()..sort();
  return [
    for (final day in days)
      CalendarDay(
        day: day,
        posts: byDay[day]!
          ..sort((a, b) => a.scheduledAt!.compareTo(b.scheduledAt!)),
      ),
  ];
}

/// The posts that go out on [day], in the local clock.
List<ScheduledPost> postsOn(Iterable<ScheduledPost> posts, DateTime day) {
  final target = dateOnly(day);
  return [
    for (final post in posts)
      if (post.scheduledAt != null &&
          dateOnly(post.scheduledAt!.toLocal()) == target)
        post,
  ];
}

DateTime _weekStart(DateTime anchor) {
  final day = dateOnly(anchor);
  return _addDays(day, -(day.weekday % 7));
}

DateTime _addDays(DateTime day, int days) =>
    DateTime(day.year, day.month, day.day + days);

String _two(int value) => value.toString().padLeft(2, '0');

const List<String> _monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const List<String> _weekdayNames = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
