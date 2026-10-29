import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/scheduling/domain/calendar_range.dart';
import 'package:flowpost_desktop/features/scheduling/domain/scheduled_post.dart';
import 'package:flutter_test/flutter_test.dart';

ScheduledPost _post({String id = 'post-1', DateTime? scheduledAt}) {
  return ScheduledPost(
    id: id,
    status: PostStatus.scheduled,
    scheduledAt: scheduledAt,
  );
}

void main() {
  group('the visible range', () {
    test('a month starts on its first day and ends on the next month', () {
      final range = calendarRange(CalendarView.month, DateTime(2026, 10, 29));

      expect(range.start, DateTime(2026, 10, 1));
      expect(range.end, DateTime(2026, 11, 1));
    });

    test('the list uses the same month as the grid', () {
      final month = calendarRange(CalendarView.month, DateTime(2026, 10, 29));
      final list = calendarRange(CalendarView.list, DateTime(2026, 10, 29));

      expect(list.start, month.start);
      expect(list.end, month.end);
    });

    test('a week starts on the Sunday before and lasts seven days', () {
      // 29 October 2026 is a Thursday.
      final range = calendarRange(CalendarView.week, DateTime(2026, 10, 29));

      expect(range.start, DateTime(2026, 10, 25));
      expect(range.end, DateTime(2026, 11, 1));
    });

    test('a Sunday is the first day of its own week', () {
      final range = calendarRange(CalendarView.week, DateTime(2026, 10, 25));

      expect(range.start, DateTime(2026, 10, 25));
      expect(range.end, DateTime(2026, 11, 1));
    });
  });

  group('the month grid', () {
    test('the first week is padded with blanks', () {
      // 1 October 2026 is a Thursday, so four blanks come first.
      final cells = monthCells(DateTime(2026, 10, 29));

      expect(cells.take(4), everyElement(isNull));
      expect(cells[4], DateTime(2026, 10, 1));
      expect(cells.whereType<DateTime>(), hasLength(31));
      expect(cells, hasLength(35));
    });

    test('a month that ends a week is not padded further', () {
      // 31 October 2026 is a Saturday: four blanks plus 31 days is 35 cells.
      final cells = monthCells(DateTime(2026, 10, 29));

      expect(cells.length % 7, 0);
      expect(cells.last, DateTime(2026, 10, 31));
    });

    test('February in a leap year has 29 days', () {
      final days = monthCells(DateTime(2028, 2, 1)).whereType<DateTime>();

      expect(days, hasLength(29));
      expect(days.last, DateTime(2028, 2, 29));
    });
  });

  test('the week view lists seven days from the anchor Sunday', () {
    final days = weekDays(DateTime(2026, 10, 29));

    expect(days, hasLength(7));
    expect(days.first, DateTime(2026, 10, 25));
    expect(days.last, DateTime(2026, 10, 31));
  });

  group('moving the anchor', () {
    test('the month view moves a month at a time', () {
      expect(
        stepAnchor(CalendarView.month, DateTime(2026, 10, 29), 1),
        DateTime(2026, 11, 1),
      );
      expect(
        stepAnchor(CalendarView.month, DateTime(2026, 10, 29), -1),
        DateTime(2026, 9, 1),
      );
    });

    test('the list moves a month at a time', () {
      expect(
        stepAnchor(CalendarView.list, DateTime(2026, 12, 15), 1),
        DateTime(2027, 1, 1),
      );
    });

    test('the week view moves a week at a time', () {
      expect(
        stepAnchor(CalendarView.week, DateTime(2026, 10, 29), 1),
        DateTime(2026, 11, 5),
      );
    });
  });

  group('the title', () {
    test('names the month and the year', () {
      expect(
        calendarTitle(CalendarView.month, DateTime(2026, 10, 29)),
        'October 2026',
      );
    });

    test('names both ends of a week inside one month', () {
      expect(
        calendarTitle(CalendarView.week, DateTime(2026, 10, 8)),
        '4–10 October 2026',
      );
    });

    test('names both months of a week that straddles two', () {
      expect(
        calendarTitle(CalendarView.week, DateTime(2026, 10, 1)),
        '27 September – 3 October 2026',
      );
    });

    test('names both years of a week that straddles two', () {
      expect(
        calendarTitle(CalendarView.week, DateTime(2026, 12, 31)),
        '27 December 2026 – 2 January 2027',
      );
    });
  });

  test('a day is labelled in full', () {
    expect(dayLabel(DateTime(2026, 10, 29)), 'Thursday, 29 October 2026');
  });

  test('a time reads as the clock in the machine zone', () {
    expect(clockLabel(DateTime(2026, 10, 29, 9, 5)), '09:05');
    expect(clockLabel(null), '—');
  });

  test('a sentence names the day and the time', () {
    expect(
      longTimeLabel(DateTime(2026, 10, 29, 10)),
      '29 October 2026 at 10:00',
    );
    expect(longTimeLabel(null), 'no time set');
  });

  group('grouping by day', () {
    test('posts land on their own local day, in time order', () {
      final days = groupByDay([
        _post(id: 'b', scheduledAt: DateTime(2026, 10, 29, 15)),
        _post(id: 'a', scheduledAt: DateTime(2026, 10, 29, 9)),
        _post(id: 'c', scheduledAt: DateTime(2026, 10, 30, 8)),
      ]);

      expect(days.map((day) => day.day), [
        DateTime(2026, 10, 29),
        DateTime(2026, 10, 30),
      ]);
      expect(days.first.posts.map((post) => post.id), ['a', 'b']);
      expect(days.last.posts.map((post) => post.id), ['c']);
    });

    test('a post with no time is left out of the calendar', () {
      final days = groupByDay([_post(id: 'no-time', scheduledAt: null)]);

      expect(days, isEmpty);
    });

    test('a post is found on its own day only', () {
      final posts = [_post(scheduledAt: DateTime(2026, 10, 29, 15))];

      expect(postsOn(posts, DateTime(2026, 10, 29, 23)), hasLength(1));
      expect(postsOn(posts, DateTime(2026, 10, 30)), isEmpty);
    });
  });
}
