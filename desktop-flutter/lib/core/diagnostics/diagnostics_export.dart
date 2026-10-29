import 'dart:io';

import 'package:path/path.dart' as p;

import 'diagnostics_report.dart';

/// Writes the evidence file into [folder] under the minute it was written.
///
/// The content lands in `.tmp` first and is renamed into place, so a write
/// that fails leaves no half file; null means nothing was written.
Future<File?> exportDiagnostics({
  required Directory folder,
  required String report,
  required DateTime at,
}) async {
  final target = File(
    p.join(folder.path, 'flowpost-diagnostics-${fileStamp(at)}.txt'),
  );
  final temporary = File('${target.path}.tmp');
  try {
    await temporary.writeAsString(report, flush: true);
    await temporary.rename(target.path);
    return target;
  } on FileSystemException {
    try {
      if (await temporary.exists()) await temporary.delete();
    } on FileSystemException {
      // The report was never complete, so nothing useful is left behind.
    }
    return null;
  }
}
