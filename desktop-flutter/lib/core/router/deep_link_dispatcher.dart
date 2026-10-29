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
  });

  final ValueNotifier<String?> pendingRoute;
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
    final route = routeFor(raw);
    if (route == null) return false;
    _restoreWindow();
    pendingRoute.value = route;
    return true;
  }

  void _restoreWindow() {
    unawaited(
      showWindow().catchError((Object error, StackTrace stackTrace) {
        log.severe('Show from tray failed: $error', error, stackTrace);
      }),
    );
  }
}
