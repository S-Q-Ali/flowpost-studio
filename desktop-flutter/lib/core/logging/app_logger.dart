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
    // Quoted "key": "value" first, then bare key=value; \b on the bare
    // form keeps `token` from re-firing inside an already-redacted match.
    redacted = redacted.replaceAllMapped(
      RegExp('"\\b$key\\b"\\s*:\\s*"[^"]*"', caseSensitive: false),
      (m) => '"$key":"[redacted]"',
    );
    redacted = redacted.replaceAllMapped(
      RegExp('\\b$key\\b\\s*[=:]\\s*"?[^&\\s,}\\]"]+', caseSensitive: false),
      (m) => '$key=[redacted]',
    );
  }
  return redacted;
}

Future<Logger> initLogging() async {
  Logger.root.level = Level.INFO;
  Logger.root.onRecord.listen((record) async {
    final dir = await _logsDirectory();
    final line =
        '${record.time.toIso8601String()} ${record.level.name} '
        '${record.loggerName}: ${redactSecrets(record.message)}\n';
    try {
      await File('${dir.path}${Platform.pathSeparator}app.log')
          .writeAsString(line, mode: FileMode.append);
    } on FileSystemException {
      // Logging must never take the app down.
    }
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
