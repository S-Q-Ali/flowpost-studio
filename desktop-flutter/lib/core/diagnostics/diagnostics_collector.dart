import 'dart:io';

import 'package:path/path.dart' as p;

import '../update/app_version.dart';
import 'diagnostics_report.dart';

/// The names the app itself gives a file it set aside (see
/// `setAsideCorruptFile`).
final RegExp _brokenFilePattern = RegExp(r'\.corrupt-\d{8}-\d{4}(-\d+)?\.db$');

/// Reads the machine's facts for the evidence file.
///
/// Every read swallows its failure: a folder that cannot be listed is a
/// "missing" row, not an export that cannot be written.
Future<DiagnosticsFacts> gatherDiagnostics({
  required Directory support,
  required Directory? logs,
  required AppVersionInfo? version,
  required bool signedIn,
  required bool draftsAvailable,
  required DateTime now,
  required String osVersion,
  required String locale,
  required String zoneName,
  required Duration utcOffset,
}) async {
  final files = [
    await _stat(File(p.join(support.path, 'cache.db'))),
    await _stat(
      File(p.join(support.path, 'drafts.db')),
      present: draftsAvailable ? LocalFileState.ok : LocalFileState.unreadable,
    ),
    if (logs != null) ...[
      await _stat(File(p.join(logs.path, 'app.log'))),
      await _stat(File(p.join(logs.path, 'app.log.1'))),
    ],
  ];

  final (logsRead, logLines) = await _readLogs(logs);

  return DiagnosticsFacts(
    generatedAt: now,
    version: version,
    osVersion: osVersion,
    locale: locale,
    zoneName: zoneName,
    utcOffset: utcOffset,
    signedIn: signedIn,
    files: files,
    brokenFiles: await _brokenFiles(support),
    logLines: logLines,
    logsRead: logsRead,
  );
}

Future<LocalFileFact> _stat(
  File file, {
  LocalFileState present = LocalFileState.ok,
}) async {
  final name = p.basename(file.path);
  try {
    final stat = await file.stat();
    if (stat.type == FileSystemEntityType.notFound) {
      return LocalFileFact(name: name, state: LocalFileState.missing);
    }
    return LocalFileFact(
      name: name,
      // A drafts file that is there but will not open is still a file with a
      // size; the state says the part that matters.
      state: present,
      bytes: stat.size,
      modifiedAt: stat.modified.toUtc(),
    );
  } on FileSystemException {
    return LocalFileFact(name: name, state: LocalFileState.missing);
  }
}

/// The archive first and the live file second, so the tail reads in time
/// order. The bound lives in the formatter, which is what promises it.
Future<(bool, List<String>)> _readLogs(Directory? folder) async {
  if (folder == null) return (false, const <String>[]);
  try {
    final lines = <String>[];
    var found = false;
    for (final name in ['app.log.1', 'app.log']) {
      final file = File(p.join(folder.path, name));
      if (!await file.exists()) continue;
      found = true;
      lines.addAll(
        (await file.readAsString())
            .split('\n')
            .where((line) => line.isNotEmpty),
      );
    }
    if (!found) return (false, const <String>[]);
    return (true, lines);
  } on FileSystemException {
    return (false, const <String>[]);
  }
}

Future<List<LocalFileFact>> _brokenFiles(Directory support) async {
  final found = <LocalFileFact>[];
  try {
    await for (final entry in support.list()) {
      if (entry is! File) continue;
      final name = p.basename(entry.path);
      if (!_brokenFilePattern.hasMatch(name)) continue;
      final stat = await entry.stat();
      found.add(
        LocalFileFact(
          name: name,
          state: LocalFileState.unreadable,
          bytes: stat.size,
          modifiedAt: stat.modified.toUtc(),
        ),
      );
    }
  } on FileSystemException {
    return const [];
  }
  found.sort((a, b) {
    final order = (b.modifiedAt ?? DateTime(0)).compareTo(
      a.modifiedAt ?? DateTime(0),
    );
    return order != 0 ? order : b.name.compareTo(a.name);
  });
  return found;
}
