import 'package:flowpost_desktop/core/time/time_zone.dart';

/// A timezone with a daylight-saving jump, so the cases pin on every
/// machine, including one whose own zone has no daylight saving.
class FakeTimeZone implements TimeZone {
  FakeTimeZone({
    required this.transitionUtc,
    required this.offsetBefore,
    required this.offsetAfter,
  });

  /// The instant the clock jumps.
  final DateTime transitionUtc;

  /// The offset in minutes in effect before the jump.
  final int offsetBefore;

  /// The offset in minutes in effect after the jump.
  final int offsetAfter;

  /// The clock jumps forward, so the wall times in the window do not exist.
  bool get skips => offsetAfter > offsetBefore;

  late final DateTime _windowStart = asWallFields(transitionUtc).add(
    Duration(minutes: offsetBefore < offsetAfter ? offsetBefore : offsetAfter),
  );

  late final DateTime _windowEnd = asWallFields(transitionUtc).add(
    Duration(minutes: offsetBefore > offsetAfter ? offsetBefore : offsetAfter),
  );

  bool _inWindow(DateTime wall) {
    final fields = asWallFields(wall);
    return !fields.isBefore(_windowStart) && fields.isBefore(_windowEnd);
  }

  @override
  DateTime? resolve(DateTime wall) {
    if (_inWindow(wall) && skips) return null;
    return asWallFields(wall).subtract(Duration(minutes: offsetAt(wall)));
  }

  @override
  int offsetAt(DateTime wall) =>
      asWallFields(wall).isBefore(_windowEnd) ? offsetBefore : offsetAfter;
}

/// US Eastern: the clock jumps from 02:00 to 03:00 on 8 March 2026.
FakeTimeZone easternSpringForward() => FakeTimeZone(
  transitionUtc: DateTime.utc(2026, 3, 8, 7),
  offsetBefore: -300,
  offsetAfter: -240,
);

/// US Eastern: the clock goes back from 02:00 to 01:00 on 1 November 2026.
FakeTimeZone easternFallBack() => FakeTimeZone(
  transitionUtc: DateTime.utc(2026, 11, 1, 6),
  offsetBefore: -240,
  offsetAfter: -300,
);

/// A zone without daylight saving, an hour ahead of UTC.
FakeTimeZone fixedZone() => FakeTimeZone(
  transitionUtc: DateTime.utc(2026, 1, 1),
  offsetBefore: 60,
  offsetAfter: 60,
);
