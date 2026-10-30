import '../logging/app_logger.dart';
import '../update/app_version.dart';

/// How much of the log the evidence file carries. The file stays small
/// however long the log has grown.
const int logTailLines = 200;

/// What a local file looked like when the evidence was gathered.
enum LocalFileState {
  ok('ok'),
  missing('missing'),
  unreadable('cannot be opened');

  const LocalFileState(this.label);

  final String label;
}

/// One row of the evidence file's file list.
class LocalFileFact {
  const LocalFileFact({
    required this.name,
    required this.state,
    this.bytes,
    this.modifiedAt,
  });

  final String name;
  final LocalFileState state;
  final int? bytes;
  final DateTime? modifiedAt;
}

/// Everything the evidence file says, gathered once so the formatter has no
/// clock, no disk and no session of its own.
class DiagnosticsFacts {
  const DiagnosticsFacts({
    required this.generatedAt,
    required this.version,
    required this.osVersion,
    required this.locale,
    required this.zoneName,
    required this.utcOffset,
    required this.signedIn,
    required this.files,
    required this.brokenFiles,
    required this.logLines,
    required this.logsRead,
  });

  final DateTime generatedAt;
  final AppVersionInfo? version;
  final String osVersion;
  final String locale;
  final String zoneName;
  final Duration utcOffset;

  /// Whether a session exists — never which one.
  final bool signedIn;

  final List<LocalFileFact> files;
  final List<LocalFileFact> brokenFiles;
  final List<String> logLines;
  final bool logsRead;
}

/// The evidence file the admin sends when something went wrong
/// (SPEC-diagnostics "The evidence file").
///
/// Built from the facts alone, then sanitized whole: a log line reaches the
/// file only after [redactSecrets] and [maskPaths] have run over it.
String buildDiagnosticsReport(DiagnosticsFacts facts) {
  final version = facts.version;
  final buffer = StringBuffer()
    ..writeln('FlowPost Studio diagnostics')
    ..writeln('Generated ${isoStamp(facts.generatedAt)}')
    ..writeln()
    ..writeln(
      '${_label('App')}'
      '${version == null ? 'unknown' : '${version.version} (${version.buildNumber})'}, '
      '${facts.osVersion}, ${facts.locale}',
    )
    ..writeln(
      '${_label('Clock')}${_offset(facts.utcOffset)}, ${facts.zoneName}',
    )
    ..writeln(
      '${_label('Session')}${facts.signedIn ? 'signed in' : 'signed out'}',
    );

  if (facts.files.isEmpty) {
    buffer.writeln('${_label('Files')}(none)');
  } else {
    for (var i = 0; i < facts.files.length; i++) {
      buffer.writeln(
        '${i == 0 ? _label('Files') : ' ' * 10}${_file(facts.files[i])}',
      );
    }
  }
  for (var i = 0; i < facts.brokenFiles.length; i++) {
    final file = facts.brokenFiles[i];
    buffer.writeln(
      '${i == 0 ? _label('Broken') : ' ' * 10}'
      '${file.name}: ${formatBytes(file.bytes)}, ${isoStamp(file.modifiedAt)}',
    );
  }

  buffer.writeln();
  if (!facts.logsRead) {
    buffer.writeln('--- app.log: could not be read ---');
  } else {
    buffer.writeln('--- app.log (last $logTailLines lines) ---');
    final tail = facts.logLines.length > logTailLines
        ? facts.logLines.sublist(facts.logLines.length - logTailLines)
        : facts.logLines;
    for (final line in tail) {
      buffer.writeln(line);
    }
  }

  buffer
    ..writeln()
    ..writeln('This file holds no tokens, no captions and no file paths.');
  return sanitizeDiagnostics(buffer.toString());
}

/// Runs the logger's own rules again at export time, so a line that reached
/// the file through another path cannot carry a secret or a path.
String sanitizeDiagnostics(String text) => maskPaths(redactSecrets(text));

/// `2026-10-29T14:30:12Z`, the form both the file and the rows use.
String isoStamp(DateTime? at) {
  if (at == null) return 'unknown time';
  final utc = at.toUtc();
  String two(int value) => value.toString().padLeft(2, '0');
  return '${utc.year}-${two(utc.month)}-${two(utc.day)}T'
      '${two(utc.hour)}:${two(utc.minute)}:${two(utc.second)}Z';
}

/// `20261029-1430`, the form the export file name uses.
String fileStamp(DateTime at) {
  final utc = at.toUtc();
  String two(int value) => value.toString().padLeft(2, '0');
  return '${utc.year}${two(utc.month)}${two(utc.day)}-'
      '${two(utc.hour)}${two(utc.minute)}';
}

String _label(String label) => label.padRight(10);

String _file(LocalFileFact file) {
  if (file.state == LocalFileState.missing) return '${file.name}: missing';
  final written = file.modifiedAt == null
      ? ''
      : ', written ${isoStamp(file.modifiedAt)}';
  return '${file.name}: ${formatBytes(file.bytes)}$written, ${file.state.label}';
}

String formatBytes(int? bytes) {
  if (bytes == null) return 'size unknown';
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1 << 20) return '${(bytes / 1024).round()} KB';
  return '${(bytes / (1 << 20)).toStringAsFixed(1)} MB';
}

String _offset(Duration offset) {
  final minutes = offset.inMinutes;
  final sign = minutes < 0 ? '-' : '+';
  final absolute = minutes.abs();
  String two(int value) => value.toString().padLeft(2, '0');
  return 'UTC$sign${two(absolute ~/ 60)}:${two(absolute % 60)}';
}
