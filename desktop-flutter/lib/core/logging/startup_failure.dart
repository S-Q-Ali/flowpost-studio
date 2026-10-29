import 'dart:io';

import 'package:ffi/ffi.dart';
import 'package:logging/logging.dart';
import 'package:win32/win32.dart';

const String _caption = 'FlowPost Studio';
const String _fallbackFolder = 'the FlowPost app data folder';

/// What the message box says when the app dies before the window exists.
///
/// The path is not masked here: the admin has to be able to open it.
String startupFailureMessage(String logFolder) =>
    'FlowPost Studio could not start.\n\n'
    'The log file is in:\n$logFolder\n\n'
    'Send that file with a description of what happened.';

typedef StartupFailureReporter = Future<void> Function(String message);

/// Logs [error], then shows [startupFailureMessage] naming the log folder.
///
/// Nothing in here may throw: the caller's next step is `exit(1)`, and an
/// exception would replace the message with nothing at all.
Future<void> reportStartupFailure({
  required Object error,
  required StackTrace stackTrace,
  required Logger log,
  required Future<Directory> Function() logs,
  required StartupFailureReporter showMessage,
}) async {
  log.severe('FlowPost failed to start: $error', error, stackTrace);
  var folder = _fallbackFolder;
  try {
    folder = (await logs()).path;
  } on Object {
    log.warning('The log folder could not be found for the startup message.');
  }
  try {
    await showMessage(startupFailureMessage(folder));
  } on Object catch (messageError) {
    log.warning(
      'The startup message could not be shown '
      '(${messageError.runtimeType}).',
      messageError,
    );
  }
}

Future<void> showStartupMessageBox(String message) async {
  final text = message.toNativeUtf16();
  final caption = _caption.toNativeUtf16();
  try {
    MessageBox(null, PCWSTR(text), PCWSTR(caption), MB_OK | MB_ICONERROR);
  } finally {
    calloc.free(text);
    calloc.free(caption);
  }
}
