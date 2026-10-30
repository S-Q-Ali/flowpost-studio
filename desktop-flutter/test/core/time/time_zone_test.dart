import 'package:flowpost_desktop/core/time/time_zone.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_time_zone.dart';

void main() {
  group('a wall-clock time', () {
    test('the clock skips is refused and the message names the jump', () {
      final clock = resolveWallClock(
        wall: DateTime(2026, 3, 8, 2, 30),
        zone: easternSpringForward(),
      );

      expect(clock, isA<SkippedClock>());
      final skipped = clock as SkippedClock;
      expect(skipped.jumpFrom, DateTime(2026, 3, 8, 1, 59));
      expect(skipped.jumpTo, DateTime(2026, 3, 8, 3, 0));
      expect(
        skippedTimeMessage(jumpFrom: skipped.jumpFrom, jumpTo: skipped.jumpTo),
        'That time does not exist today. The clock jumps from 01:59 to 03:00.',
      );
    });

    test('that happens twice uses the first occurrence', () {
      final clock = resolveWallClock(
        wall: DateTime(2026, 11, 1, 1, 30),
        zone: easternFallBack(),
      );

      expect(clock, isA<RepeatedClock>());
      expect(
        (clock as RepeatedClock).instant,
        DateTime.utc(2026, 11, 1, 5, 30),
      );
      expect(repeatedTimeMessage(), contains('happens twice'));
    });

    test('that is ordinary resolves to the instant the zone gives', () {
      final clock = resolveWallClock(
        wall: DateTime(2026, 11, 1, 3, 30),
        zone: easternFallBack(),
      );

      expect(clock, isA<OrdinaryClock>());
      expect(
        (clock as OrdinaryClock).instant,
        DateTime.utc(2026, 11, 1, 8, 30),
      );
    });

    test('in a zone without daylight saving is ordinary too', () {
      final clock = resolveWallClock(
        wall: DateTime(2026, 6, 15, 12, 0),
        zone: fixedZone(),
      );

      expect(clock, isA<OrdinaryClock>());
      expect(
        (clock as OrdinaryClock).instant,
        DateTime.utc(2026, 6, 15, 11, 0),
      );
    });

    test('the same wall clock in two zones is two different instants', () {
      final wall = DateTime(2026, 6, 15, 12, 0);

      final eastern = resolveWallClock(
        wall: wall,
        zone: FakeTimeZone(
          transitionUtc: DateTime.utc(2026, 1, 1),
          offsetBefore: -240,
          offsetAfter: -240,
        ),
      );
      final berlin = resolveWallClock(wall: wall, zone: fixedZone());

      expect((eastern as OrdinaryClock).instant, DateTime.utc(2026, 6, 15, 16));
      expect((berlin as OrdinaryClock).instant, DateTime.utc(2026, 6, 15, 11));
    });

    test('comes back to the same instant when it is resolved again', () {
      const zone = SystemTimeZone();
      final wall = DateTime(2026, 6, 15, 12, 0);

      final instant = zone.resolve(wall);

      expect(instant, isNotNull);
      final back = zone.resolve(instant!.toLocal());
      expect(back, instant);
    });

    test('of the machine resolves to the wall clock it was given', () {
      const zone = SystemTimeZone();
      final wall = DateTime(2026, 6, 15, 12, 0);

      final instant = zone.resolve(wall);

      expect(instant, isNotNull);
      expect(instant!.toLocal().hour, 12);
      expect(instant.toLocal().minute, 0);
      expect(zone.offsetAt(wall), wall.timeZoneOffset.inMinutes);
    });
  });

  group('the zone label', () {
    test('reads as the offset the admin is in', () {
      expect(formatZoneOffset(0), 'UTC+00:00');
      expect(formatZoneOffset(330), 'UTC+05:30');
      expect(formatZoneOffset(-240), 'UTC-04:00');
    });
  });
}
