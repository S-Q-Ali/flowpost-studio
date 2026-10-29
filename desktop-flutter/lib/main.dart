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
import 'core/logging/error_handlers.dart';
import 'core/providers/app_providers.dart';
import 'core/router/app_router.dart' show deepLinkAllowlist;
import 'core/router/deep_link_dispatcher.dart';
import 'core/shell/flowpost_shell.dart';

final AppLinks _appLinks = AppLinks();

Future<void> main() async {
  await runZonedGuarded(
    () async {
      WidgetsFlutterBinding.ensureInitialized();
      final log = await initLogging();
      installErrorHandlers(log);

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
      final dispatcher = DeepLinkDispatcher(
        pendingRoute: pendingLink,
        showWindow: shell.showFromTray,
        log: log,
        allowedPaths: deepLinkAllowlist,
      );
      unawaited(_listenDeepLinks(dispatcher));

      runApp(
        ProviderScope(
          overrides: [appConfigProvider.overrideWithValue(config)],
          child: FlowPostApp(
            initialDeepLink: dispatcher.routeFor(initialLink),
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

      await shell.startIntentWatcher(dispatcher.handle);
    },
    (error, stackTrace) {
      // Logging may not be initialized yet; stderr keeps startup failures visible.
      Logger.root.severe('Unhandled zone error: $error', error, stackTrace);
      stderr.writeln('FlowPost failed to start: $error\n$stackTrace');
    },
  );
}

Future<String?> _getInitialLink() async {
  try {
    return await _appLinks.getInitialLinkString();
  } on PlatformException {
    return null;
  }
}

Future<void> _listenDeepLinks(DeepLinkDispatcher dispatcher) async {
  await for (final raw in _appLinks.uriLinkStream) {
    dispatcher.handle(raw.toString());
  }
}
