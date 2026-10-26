import 'dart:io';

import 'package:logging/logging.dart';
import 'package:path_provider/path_provider.dart';

/// Never log raw tokens, cookies, or API keys — shell must keep secrets out
/// of `%APPDATA%\FlowPost\logs` (SPEC-shell Boundaries).
final Set<String> redactedKeys = {
  'token',
  'access_token',
  'refresh_token',
  'anon_key',
  'apikey',
  'api_key',
  'password',
  'secret',
  'fb_dtsg',
  'session',
};

String redactSecrets(String message) {
  var redacted = message;
  for (final key in redactedKeys) {
    // Quoted "key": "value" first, then bare key=value; the capture group
    // keeps the log's original key casing.
    redacted = redacted.replaceAllMapped(
      RegExp('"($key)"\\s*:\\s*"[^"]*"', caseSensitive: false),
      (m) => '"${m.group(1)}":"[redacted]"',
    );
    redacted = redacted.replaceAllMapped(
      RegExp('\\b($key)\\b\\s*[=:]\\s*"?[^&\\s,}\\]"]+', caseSensitive: false),
      (m) => '${m.group(1)}=[redacted]',
    );
  }
  return redacted;
}

/// Renames [log] to `<log>.1` once it exceeds [maxBytes]; the next append
/// recreates it. Keeps `%APPDATA%\FlowPost\logs\app.log` bounded.
Future<void> rotateLogIfNeeded(File log, {int maxBytes = 1 << 20}) async {
  int size;
  try {
    size = await log.length();
  } on FileSystemException {
    return;
  }
  if (size <= maxBytes) return;
  final archive = File('${log.path}.1');
  try {
    if (await archive.exists()) await archive.delete();
    await log.rename(archive.path);
  } on FileSystemException {
    // Best-effort: a locked archive must never break logging.
  }
}

/// Writes are chained FIFO so `flushLogging()` can await them all before a
/// short-lived (hand-off) process calls `exit()`.
Future<void> _lastWrite = Future<void>.value();

/// Resolves once every queued log record has been written to disk.
Future<void> flushLogging() => _lastWrite;

Future<Logger> initLogging() async {
  Logger.root.level = Level.INFO;
  Logger.root.onRecord.listen((record) {
    _lastWrite = _lastWrite.then((_) async {
      final dir = await _logsDirectory();
      final file = File('${dir.path}${Platform.pathSeparator}app.log');
      await rotateLogIfNeeded(file);
      final line =
          '${record.time.toIso8601String()} ${record.level.name} '
          '${record.loggerName}: ${redactSecrets(record.message)}\n';
      try {
        await file.writeAsString(line, mode: FileMode.append);
      } on FileSystemException {
        // Logging must never take the app down.
      }
    });
  });
  return Logger.root;
}

Future<Directory> _logsDirectory() async {
  final support = await getApplicationSupportDirectory();
  final dir = Directory('${support.path}${Platform.pathSeparator}logs');
  if (!await dir.exists()) {
    await dir.create(recursive: true);
  }
  return dir;
}
