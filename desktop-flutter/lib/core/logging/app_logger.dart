import 'dart:io';

import 'package:logging/logging.dart';
import 'package:path_provider/path_provider.dart';

/// Never log raw tokens, cookies, or API keys — shell must keep secrets out
/// of `%APPDATA%\com.flowpost\FlowPost\logs` (SPEC-shell Boundaries).
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
  'code',
  'state',
};

/// Keys whose bare form is only redacted after an `=`. `Error code: 1` and
/// `state: MediaIdle` are ordinary words, not secrets, and the OAuth query
/// form is already handled by the first pass.
const Set<String> bareEqualsOnlyKeys = {'code', 'state'};

String redactSecrets(String message) {
  // OAuth callbacks put code/state in the query (or fragment). Redact them
  // before the generic key pass so a one-word key like `code` stays precise.
  var redacted = message.replaceAllMapped(
    RegExp(r'([?#&](?:code|state)=)[^&\s#]+', caseSensitive: false),
    (m) => '${m.group(1)}[redacted]',
  );
  for (final key in redactedKeys) {
    // Quoted "key": "value" first, then bare key=value; the capture group
    // keeps the log's original key casing.
    redacted = redacted.replaceAllMapped(
      RegExp('"($key)"\\s*:\\s*"[^"]*"', caseSensitive: false),
      (m) => '"${m.group(1)}":"[redacted]"',
    );
    final separator = bareEqualsOnlyKeys.contains(key) ? '=' : '[=:]';
    redacted = redacted.replaceAllMapped(
      RegExp(
        '\\b($key)\\b\\s*$separator\\s*"?[^&\\s,}"]+',
        caseSensitive: false,
      ),
      (m) => '${m.group(1)}=[redacted]',
    );
  }
  return redacted;
}

/// Drops the control characters that could forge a log record: a name that
/// carries a newline must not be able to write a second line into the log.
String stripControlCharacters(String text, {bool keepNewlines = false}) {
  final pattern = keepNewlines
      ? RegExp(r'[\x00-\x09\x0b-\x1f\x7f]')
      : RegExp(r'[\x00-\x1f\x7f]');
  return text.replaceAll(pattern, ' ');
}

/// Renames [log] to `<log>.1` once it exceeds [maxBytes]; the next append
/// recreates it. Keeps `%APPDATA%\com.flowpost\FlowPost\logs\app.log` bounded.
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
      try {
        final dir = await _logsDirectory();
        final file = File('${dir.path}${Platform.pathSeparator}app.log');
        await rotateLogIfNeeded(file);
        final line = StringBuffer(
          '${record.time.toIso8601String()} ${record.level.name} '
          '${record.loggerName}: '
          '${stripControlCharacters(redactSecrets(record.message))}',
        );
        if (record.error != null) {
          line.write(
            ' | error='
            '${stripControlCharacters(redactSecrets('${record.error}'))}',
          );
        }
        if (record.stackTrace != null) {
          line.write(
            '\n${stripControlCharacters(redactSecrets('${record.stackTrace}'), keepNewlines: true)}',
          );
        }
        line.write('\n');
        await file.writeAsString(line.toString(), mode: FileMode.append);
      } on Object {
        // Logging must never take the app down — and a rejected link would
        // skip every later callback and make flushLogging() throw before
        // exit(0), so nothing inside this body may escape.
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
