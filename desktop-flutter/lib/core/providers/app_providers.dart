import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../config/config_controller.dart';
import '../session/session.dart';
import '../time/time_zone.dart';

/// The values the app is running on, from the file main loaded.
///
/// Null means the app belongs on the setup screen; a screen that reads this
/// with no values is a routing bug, not an empty state (SPEC-credentials).
final Provider<AppConfig> appConfigProvider = Provider<AppConfig>((ref) {
  final config = ref.watch(configControllerProvider).config;
  if (config == null) {
    throw StateError('No backend values yet; the app belongs on /setup.');
  }
  return config;
});

/// The timezone of the machine, as the wall-clock conversion needs it.
///
/// The tests override it with a zone that has a daylight-saving jump, so the
/// cases pin on every machine.
final Provider<TimeZone> timeZoneProvider = Provider<TimeZone>(
  (ref) => const SystemTimeZone(),
);

/// The session token the backend calls are made with.
///
/// Null until the identity module signs someone in, so the actions that need
/// one stay disabled with the sign-in hint.
final Provider<String?> sessionTokenProvider = Provider<String?>(
  (ref) => ref.watch(sessionProvider)?.sessionToken,
);

/// The Supabase Auth access token, for the table reads and writes.
///
/// The posts table only lets a user write their own rows, so the rows need
/// this one and not the session token. Null until the identity module signs
/// someone in.
final Provider<String?> authAccessTokenProvider = Provider<String?>(
  (ref) => ref.watch(sessionProvider)?.accessToken,
);
