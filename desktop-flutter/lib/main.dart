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
import 'features/media/data/media_file_picker.dart';
import 'features/media/data/media_workspace.dart';
import 'features/media/media_providers.dart';

final AppLinks _appLinks = AppLinks();

/// [picker] replaces the native file dialog so the upload screen can be
/// driven end to end in a test.
Future<void> main({MediaFilePicker? picker}) async {
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
      await _removeStaleMediaJobs(log);
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
          overrides: [
            appConfigProvider.overrideWithValue(config),
            if (picker != null) mediaPickerProvider.overrideWithValue(picker),
          ],
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

/// v1 never resumes a media job, so anything left in the jobs root is dead
/// weight from a crash or a hard kill.
Future<void> _removeStaleMediaJobs(Logger log) async {
  try {
    final workspace = await MediaWorkspace.forApplication(log: log);
    await workspace.deleteAllJobs();
  } on Object catch (error) {
    log.warning('Stale media cleanup failed: $error');
  }
}

Future<void> _listenDeepLinks(DeepLinkDispatcher dispatcher) async {
  await for (final raw in _appLinks.uriLinkStream) {
    dispatcher.handle(raw.toString());
  }
}
