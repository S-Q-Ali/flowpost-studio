import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../time/time_zone.dart';

/// Config is provided as an instance by `main.dart` after parsing; the app
/// never reads `String.fromEnvironment` deeper in the tree.
final Provider<AppConfig> appConfigProvider = Provider<AppConfig>(
  (ref) => throw UnimplementedError('appConfigProvider must be overridden'),
);

/// The timezone of the machine, as the wall-clock conversion needs it.
///
/// The tests override it with a zone that has a daylight-saving jump, so the
/// cases pin on every machine.
final Provider<TimeZone> timeZoneProvider = Provider<TimeZone>(
  (ref) => const SystemTimeZone(),
);

/// The session token the backend calls are made with.
///
/// Null until the identity module exists, so the actions that need one stay
/// disabled with the sign-in hint.
final Provider<String?> sessionTokenProvider = Provider<String?>((ref) => null);

/// The Supabase Auth access token, for the table reads and writes.
///
/// The posts table only lets a user write their own rows, so the rows need
/// this one and not the session token. Null until the identity module
/// exists.
final Provider<String?> authAccessTokenProvider = Provider<String?>(
  (ref) => null,
);
