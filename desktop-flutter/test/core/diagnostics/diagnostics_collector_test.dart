import 'dart:io';

import 'package:flowpost_desktop/core/diagnostics/diagnostics_collector.dart';
import 'package:flowpost_desktop/core/diagnostics/diagnostics_report.dart';
import 'package:flowpost_desktop/core/update/app_version.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

const AppVersionInfo _version = AppVersionInfo(
  version: '1.0.0',
  buildNumber: '1',
);

void main() {
  late Directory support;
  late Directory logs;

  setUp(() async {
    support = await Directory.systemTemp.createTemp('flowpost_support_test');
    logs = Directory(p.join(support.path, 'logs'))..createSync();
  });

  tearDown(() async {
    if (await support.exists()) await support.delete(recursive: true);
  });

  Future<DiagnosticsFacts> gather({
    bool draftsAvailable = true,
    Directory? logsFolder,
  }) => gatherDiagnostics(
    support: support,
    logs: logsFolder ?? logs,
    version: _version,
    signedIn: false,
    draftsAvailable: draftsAvailable,
    now: DateTime.utc(2026, 10, 29, 14, 30, 12),
    osVersion: 'Windows 10.0.26300',
    locale: 'en-US',
    zoneName: 'Asia/Karachi',
    utcOffset: const Duration(hours: 5),
  );

  LocalFileFact fact(DiagnosticsFacts facts, String name) =>
      facts.files.firstWhere((file) => file.name == name);

  test('a file that is there carries its size and time', () async {
    File(p.join(support.path, 'cache.db'))
        .writeAsBytesSync(List.filled(2048, 0));

    final facts = await gather();

    expect(fact(facts, 'cache.db').state, LocalFileState.ok);
    expect(fact(facts, 'cache.db').bytes, 2048);
    expect(facts.generatedAt, DateTime.utc(2026, 10, 29, 14, 30, 12));
  });

  test('a file that is not there says missing, not zero bytes', () async {
    final facts = await gather();

    expect(fact(facts, 'drafts.db').state, LocalFileState.missing);
    expect(fact(facts, 'cache.db').state, LocalFileState.missing);
  });

  test('a drafts file the store refused says it cannot be opened', () async {
    File(p.join(support.path, 'drafts.db')).writeAsBytesSync([1, 2, 3]);

    final facts = await gather(draftsAvailable: false);

    expect(fact(facts, 'drafts.db').state, LocalFileState.unreadable);
    expect(fact(facts, 'drafts.db').bytes, 3);
  });

  test('the renamed-broken files are listed newest first', () async {
    final older = File(p.join(support.path, 'cache.corrupt-20261029-1432.db'))
      ..writeAsBytesSync(List.filled(10, 0));
    final newer = File(p.join(support.path, 'drafts.corrupt-20261029-1500.db'))
      ..writeAsBytesSync(List.filled(20, 0));
    older.setLastModifiedSync(DateTime.utc(2026, 10, 29, 14, 32));
    newer.setLastModifiedSync(DateTime.utc(2026, 10, 29, 15, 0));

    final facts = await gather();

    expect(facts.brokenFiles.map((file) => file.name), [
      'drafts.corrupt-20261029-1500.db',
      'cache.corrupt-20261029-1432.db',
    ]);
  });

  test('an ordinary file is not mistaken for a broken one', () async {
    File(p.join(support.path, 'accounts.json')).writeAsStringSync('{}');

    final facts = await gather();

    expect(facts.brokenFiles, isEmpty);
  });

  test(
    'the log tail holds the archive and the live file, newest last',
    () async {
      File(p.join(logs.path, 'app.log.1')).writeAsStringSync('old 1\nold 2\n');
      File(p.join(logs.path, 'app.log')).writeAsStringSync('new 1\nnew 2\n');

      final facts = await gather();

      expect(facts.logsRead, isTrue);
      expect(facts.logLines, ['old 1', 'old 2', 'new 1', 'new 2']);
    },
  );

  test('the archive and the live file come back in time order', () async {
    final lines = [for (var i = 1; i <= 300; i++) 'line $i'];
    File(p.join(logs.path, 'app.log.1'))
        .writeAsStringSync('${lines.sublist(0, 150).join('\n')}\n');
    File(p.join(logs.path, 'app.log'))
        .writeAsStringSync('${lines.sublist(150).join('\n')}\n');

    final facts = await gather();

    expect(facts.logLines, hasLength(300));
    expect(facts.logLines.first, 'line 1');
    expect(facts.logLines.last, 'line 300');
  });

  test('no log folder means the log could not be read', () async {
    final facts = await gather(logsFolder: null);

    expect(facts.logsRead, isFalse);
    expect(facts.logLines, isEmpty);
  });

  test('a folder that cannot be listed is reported, not thrown', () async {
    await support.delete(recursive: true);

    final facts = await gather();

    expect(facts.files, isNotEmpty);
    expect(facts.brokenFiles, isEmpty);
  });
}
