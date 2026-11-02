import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

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

/// Opens an address in the system browser, as a seam the tests answer.
///
/// A sign-in always happens in the admin's own browser, never inside this
/// window: the app must not see the platform's page, and a window it cannot
/// close would strand the connect.
final Provider<Future<bool> Function(Uri)> urlLauncherProvider =
    Provider<Future<bool> Function(Uri)>((ref) {
      return (url) => launchUrl(url, mode: LaunchMode.externalApplication);
    });

/// The session token the backend calls are made with.
///
/// Null until an active license opens the app, so the actions that need one
/// stay disabled with the license hint.
final Provider<String?> sessionTokenProvider = Provider<String?>(
  (ref) => ref.watch(sessionProvider)?.sessionToken,
);
