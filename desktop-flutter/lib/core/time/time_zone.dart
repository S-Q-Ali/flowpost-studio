/// The machine's timezone, as the wall-clock conversion needs it.
///
/// The three cases a typed time can have — ordinary, skipped, repeated —
/// depend on the machine's timezone, so the rules are written against this
/// seam instead of against `DateTime`. The production zone asks the
/// operating system; the tests use a fake with a synthetic daylight-saving
/// jump, so the cases pin on every machine, including one whose zone has no
/// daylight saving at all.
abstract class TimeZone {
  /// The instant the zone gives for a wall-clock time, or null when the zone
  /// cannot make one — the clock skipped that hour.
  DateTime? resolve(DateTime wall);

  /// The offset in minutes in effect at a wall-clock time.
  ///
  /// A time that happens twice reports the offset of its first occurrence,
  /// and a time the clock skips reports the offset from before the jump.
  int offsetAt(DateTime wall);
}

/// The zone of the machine the app runs on.
class SystemTimeZone implements TimeZone {
  const SystemTimeZone();

  @override
  DateTime? resolve(DateTime wall) {
    final offsets = _offsetsThatFit(wall);
    if (offsets.isEmpty) return null;
    // The first occurrence of a repeated time is the earlier instant, and the
    // earlier instant is the one with the larger offset.
    return _instant(wall, offsets.first);
  }

  @override
  int offsetAt(DateTime wall) {
    final offsets = _offsetsThatFit(wall);
    if (offsets.isNotEmpty) return offsets.first;
    // The clock skips this hour. The offset from before the jump still
    // applies to it, so the jump itself is still measurable.
    for (var hours = 1; hours <= 3; hours++) {
      final earlier = _offsetsThatFit(wallHoursAway(wall, -hours));
      if (earlier.isNotEmpty) return earlier.first;
    }
    return _localOffset(wall);
  }

  /// The offsets under which the wall clock really names that instant.
  ///
  /// Two offsets fit when the time happens twice, none fits when the clock
  /// skips it, and one fits for an ordinary time.
  List<int> _offsetsThatFit(DateTime wall) {
    final candidates = <int>{
      _localOffset(wall),
      _localOffset(wallHoursAway(wall, -1)),
      _localOffset(wallHoursAway(wall, 1)),
    };
    final fitting = <int>[];
    for (final offset in candidates) {
      final instant = _instant(wall, offset);
      if (instant.toLocal().hour == wall.hour &&
          instant.toLocal().minute == wall.minute &&
          instant.toLocal().day == wall.day) {
        fitting.add(offset);
      }
    }
    fitting.sort((a, b) => b.compareTo(a));
    return fitting;
  }

  /// The offset the operating system gives a wall-clock time.
  int _localOffset(DateTime wall) => DateTime(
    wall.year,
    wall.month,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  ).timeZoneOffset.inMinutes;

  /// The instant a wall clock names under one offset.
  DateTime _instant(DateTime wall, int offsetMinutes) => DateTime.utc(
    wall.year,
    wall.month,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  ).subtract(Duration(minutes: offsetMinutes));
}

/// The wall-clock time [hours] away from [wall], as calendar fields.
///
/// The fields are rebuilt rather than added to, because adding to a local
/// `DateTime` moves the instant and not the clock.
DateTime wallHoursAway(DateTime wall, int hours) => DateTime(
  wall.year,
  wall.month,
  wall.day,
  wall.hour + hours,
  wall.minute,
  wall.second,
);

/// The wall-clock time [minutes] away from [wall], as calendar fields.
DateTime wallMinutesAway(DateTime wall, int minutes) => DateTime(
  wall.year,
  wall.month,
  wall.day,
  wall.hour,
  wall.minute + minutes,
  wall.second,
);

/// The wall-clock fields of a time, as an instant that carries no zone.
DateTime asWallFields(DateTime value) => DateTime.utc(
  value.year,
  value.month,
  value.day,
  value.hour,
  value.minute,
  value.second,
);

/// What a wall-clock time turned out to be.
sealed class WallClock {
  const WallClock();

  /// The instant the time names, or null when the clock skips it.
  DateTime? get instant;
}

/// An ordinary time: one instant, and the clock does what it says.
class OrdinaryClock extends WallClock {
  const OrdinaryClock(this.instant);

  @override
  final DateTime instant;
}

/// A time that happens twice. The first occurrence is the one that is used.
class RepeatedClock extends WallClock {
  const RepeatedClock(this.instant);

  @override
  final DateTime instant;
}

/// A time the clock skips, so it names no instant at all.
class SkippedClock extends WallClock {
  const SkippedClock({required this.jumpFrom, required this.jumpTo});

  @override
  DateTime? get instant => null;

  /// The last wall time before the jump.
  final DateTime jumpFrom;

  /// The first wall time after the jump.
  final DateTime jumpTo;
}

/// Turns a wall-clock time into the instant it names.
WallClock resolveWallClock({required DateTime wall, required TimeZone zone}) {
  final instant = zone.resolve(wall);
  if (instant == null) {
    final jumpFrom = _lastValidWall(wall, zone);
    return SkippedClock(
      jumpFrom: jumpFrom,
      jumpTo: _jumpEnd(wall, zone, jumpFrom),
    );
  }
  // The clock goes back within the hour when the offset drops. A jump
  // forward would raise it instead, and a time the clock skips never gets
  // this far.
  final repeated = zone.offsetAt(wall) > zone.offsetAt(wallHoursAway(wall, 1));
  return repeated ? RepeatedClock(instant) : OrdinaryClock(instant);
}

/// The last wall time before the clock jumped over [wall].
DateTime _lastValidWall(DateTime wall, TimeZone zone) {
  for (var minutes = 1; minutes <= 180; minutes++) {
    final earlier = wallMinutesAway(wall, -minutes);
    if (zone.resolve(earlier) != null) return earlier;
  }
  return wall;
}

/// The first wall time after the clock jumped over [wall].
///
/// The gap starts the minute after the last wall time that resolved, and it
/// is as long as the difference between the two offsets.
DateTime _jumpEnd(DateTime wall, TimeZone zone, DateTime jumpFrom) {
  final before = zone.offsetAt(wall);
  final after = zone.offsetAt(wallHoursAway(wall, 1));
  final jump = after - before;
  if (jump <= 0) return wall;
  return wallMinutesAway(jumpFrom, jump + 1);
}

/// The zone of the machine, as it is shown next to a time.
String formatZoneOffset(int minutes) {
  final sign = minutes < 0 ? '-' : '+';
  final absolute = minutes.abs();
  final hours = (absolute ~/ 60).toString().padLeft(2, '0');
  final rest = (absolute % 60).toString().padLeft(2, '0');
  return 'UTC$sign$hours:$rest';
}

/// The sentence for a time the clock skips.
String skippedTimeMessage({
  required DateTime jumpFrom,
  required DateTime jumpTo,
}) =>
    'That time does not exist today. The clock jumps from '
    '${formatWallTime(jumpFrom)} to ${formatWallTime(jumpTo)}.';

/// The sentence for a time that happens twice.
String repeatedTimeMessage() =>
    'That time happens twice today. The post goes out at the first one.';

/// A wall-clock time as the screen shows it.
String formatWallTime(DateTime wall) =>
    '${wall.hour.toString().padLeft(2, '0')}:${wall.minute.toString().padLeft(2, '0')}';
