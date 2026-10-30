import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:logging/logging.dart';

import 'calm_error_panel.dart';

/// Routes framework and unhandled async errors into the same rotating log as
/// shell events. Called once after [initLogging].
///
/// [calmPanel] defaults to release builds: a debug build keeps the framework's
/// red box, which names the widget and the error in place.
void installErrorHandlers(
  Logger log, {
  void Function(FlutterErrorDetails details)? presentError,
  bool calmPanel = kReleaseMode,
}) {
  final present = presentError ?? FlutterError.presentError;
  FlutterError.onError = (details) {
    log.severe(
      'Flutter framework error: ${details.exceptionAsString()}',
      details.exception,
      details.stack,
    );
    present(details);
  };
  PlatformDispatcher.instance.onError = (error, stackTrace) {
    log.severe('Unhandled async error: $error', error, stackTrace);
    return true;
  };
  if (calmPanel) ErrorWidget.builder = calmErrorPanel;
}
