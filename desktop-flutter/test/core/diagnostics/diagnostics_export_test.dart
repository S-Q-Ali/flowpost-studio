import 'dart:io';

import 'package:flowpost_desktop/core/diagnostics/diagnostics_export.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

void main() {
  late Directory folder;

  setUp(() async {
    folder = await Directory.systemTemp.createTemp('flowpost_diagnostics_test');
  });

  tearDown(() async {
    if (await folder.exists()) await folder.delete(recursive: true);
  });

  test('the file is named for the minute it was written', () async {
    final written = await exportDiagnostics(
      folder: folder,
      report: 'hello',
      at: DateTime.utc(2026, 10, 29, 14, 30, 12),
    );

    expect(written, isNotNull);
    expect(p.basename(written!.path), 'flowpost-diagnostics-20261029-1430.txt');
    expect(written.readAsStringSync(), 'hello');
  });

  test('nothing is left behind under the temporary name', () async {
    await exportDiagnostics(
      folder: folder,
      report: 'hello',
      at: DateTime.utc(2026, 10, 29, 14, 30, 12),
    );

    expect(folder.listSync().map((entry) => p.basename(entry.path)), [
      'flowpost-diagnostics-20261029-1430.txt',
    ]);
  });

  test('a temporary file from an earlier attempt is replaced', () async {
    File(p.join(folder.path, 'flowpost-diagnostics-20261029-1430.txt.tmp'))
        .writeAsStringSync('stale');

    final written = await exportDiagnostics(
      folder: folder,
      report: 'fresh',
      at: DateTime.utc(2026, 10, 29, 14, 30, 12),
    );

    expect(written!.readAsStringSync(), 'fresh');
    expect(folder.listSync().map((entry) => p.basename(entry.path)), [
      'flowpost-diagnostics-20261029-1430.txt',
    ]);
  });

  test('a second export in the same minute replaces the first', () async {
    final at = DateTime.utc(2026, 10, 29, 14, 30, 12);
    await exportDiagnostics(folder: folder, report: 'first', at: at);
    final second = await exportDiagnostics(
      folder: folder,
      report: 'second',
      at: at,
    );

    expect(second!.readAsStringSync(), 'second');
  });

  test('a folder that cannot be written answers null', () async {
    final missing = Directory(p.join(folder.path, 'gone'));

    final written = await exportDiagnostics(
      folder: missing,
      report: 'hello',
      at: DateTime.utc(2026, 10, 29, 14, 30, 12),
    );

    expect(written, isNull);
  });
}
