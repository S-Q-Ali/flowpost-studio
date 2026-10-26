import 'dart:async';
import 'dart:io';

import 'package:app_links/app_links.dart';
import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';

import 'app.dart';
import 'core/config/app_config.dart';
import 'core/logging/app_logger.dart';
import 'core/providers/app_providers.dart';
import 'core/router/app_router.dart' show deepLinkAllowlist;
import 'core/router/deep_links.dart';
import 'core/shell/flowpost_shell.dart';

final AppLinks _appLinks = AppLinks();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final log = await initLogging();

  AppConfig config;
  try {
    config = AppConfig.fromEnvironment();
  } on ConfigException catch (e) {
    log.severe('Invalid configuration: ${e.message}');
    runApp(ConfigErrorApp(message: e.message));
    return;
  }

  final initialLink = await _getInitialLink();
  final shell = FlowPostShell(
    trayIconPath:
        '${File(Platform.resolvedExecutable).parent.path}${Platform.pathSeparator}resources${Platform.pathSeparator}tray.ico',
  );
  await shell.prepareGuard();
  if (!await shell.acquireSingleInstance(initialLink)) {
    await flushLogging();
    exit(0);
  }
  await shell.startWindowAndTray();

  final pendingLink = ValueNotifier<String?>(null);
  unawaited(_listenDeepLinks(pendingLink, shell, log));

  runApp(
    ProviderScope(
      overrides: [appConfigProvider.overrideWithValue(config)],
      child: FlowPostApp(
        initialDeepLink: _routeFor(initialLink, log),
        refreshListenable: pendingLink,
        pendingDeepLink: () {
          final route = pendingLink.value;
          if (route == null) return null;
          pendingLink.value = null;
          return route;
        },
      ),
    ),
  );

  await shell.startIntentWatcher(
    (link) => _pushRoute(link, pendingLink, shell, log),
  );
}

Future<String?> _getInitialLink() async {
  try {
    return await _appLinks.getInitialLinkString();
  } on PlatformException {
    return null;
  }
}

Future<void> _listenDeepLinks(
  ValueNotifier<String?> pendingLink,
  FlowPostShell shell,
  Logger log,
) async {
  await for (final raw in _appLinks.uriLinkStream) {
    _pushRoute(raw.toString(), pendingLink, shell, log);
  }
}

void _pushRoute(
  String raw,
  ValueNotifier<String?> notifier,
  FlowPostShell? shell,
  Logger log,
) {
  if (raw == 'flowpost://focus') {
    unawaited(shell?.showFromTray() ?? Future<void>.value());
    return;
  }
  final route = _routeFor(raw, log);
  if (route != null) {
    notifier.value = route;
  }
}

String? _routeFor(String? raw, Logger log) {
  if (raw == null || raw.isEmpty || raw == 'flowpost://focus') return null;
  Uri uri;
  try {
    uri = Uri.parse(raw);
  } on FormatException {
    log.warning('Rejected malformed deep link');
    return null;
  }
  final route = resolveDeepLink(uri, allowedPaths: deepLinkAllowlist);
  if (route == null) {
    log.warning('Rejected unlisted deep link path: ${uri.path}');
  }
  return route;
}
