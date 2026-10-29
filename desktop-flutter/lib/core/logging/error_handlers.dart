import 'package:flutter/foundation.dart';
import 'package:logging/logging.dart';

/// Routes framework and unhandled async errors into the same rotating log as
/// shell events. Called once after [initLogging].
void installErrorHandlers(
  Logger log, {
  void Function(FlutterErrorDetails details)? presentError,
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
}
