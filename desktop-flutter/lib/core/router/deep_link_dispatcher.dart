import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:logging/logging.dart';

import 'deep_links.dart';

/// Turns trusted `flowpost://` links into router locations. Every accepted
/// link restores the window first: a hidden app that receives an OAuth
/// callback must reappear, not sit in the tray until the user clicks it.
class DeepLinkDispatcher {
  DeepLinkDispatcher({
    required this.pendingRoute,
    required this.showWindow,
    required this.log,
    required this.allowedPaths,
    this.pendingConnect,
  });

  final ValueNotifier<String?> pendingRoute;

  /// Where a browser connect's answer link goes, when anything waits for it.
  /// It names no screen, so it is handed over rather than routed.
  final ValueNotifier<String?>? pendingConnect;
  final Future<void> Function() showWindow;
  final Logger log;
  final List<String> allowedPaths;

  /// Resolves a cold-start link for the router; does not show the window
  /// because startup already does that.
  String? routeFor(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    final uri = Uri.tryParse(raw);
    if (uri == null || uri.scheme != 'flowpost') {
      log.warning('Rejected malformed deep link: ${describeDeepLink(raw)}');
      return null;
    }
    final connect = pendingConnect;
    if (connect != null && _isConnectCallback(uri)) {
      connect.value = raw;
      return null;
    }
    final route = resolveDeepLink(uri, allowedPaths: allowedPaths);
    if (route == null) {
      log.warning('Rejected unlisted deep link path: ${describeDeepLink(raw)}');
    }
    return route;
  }

  /// Handles a link from the stream or the single-instance intent file.
  /// Returns false when the link was rejected.
  bool handle(String raw) {
    final uri = Uri.tryParse(raw);
    if (uri != null && uri.scheme == 'flowpost' && uri.host == 'focus') {
      _restoreWindow();
      return true;
    }
    final connect = pendingConnect;
    if (connect != null && uri != null && _isConnectCallback(uri)) {
      _restoreWindow();
      connect.value = raw;
      return true;
    }
    final route = routeFor(raw);
    if (route == null) return false;
    _restoreWindow();
    pendingRoute.value = route;
    return true;
  }

  bool _isConnectCallback(Uri uri) =>
      uri.scheme == 'flowpost' &&
      uri.host == connectCallbackHost &&
      (uri.path.isEmpty || uri.path == '/');

  void _restoreWindow() {
    unawaited(
      showWindow().catchError((Object error, StackTrace stackTrace) {
        log.severe('Show from tray failed: $error', error, stackTrace);
      }),
    );
  }
}
