import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';

void main() {
  late Directory tempDir;
  late File databaseFile;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('flowpost_offline_test');
    databaseFile = File('${tempDir.path}${Platform.pathSeparator}cache.db');
  });

  tearDown(() async {
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  test('a row written to a local database is still there after a reopen', () {
    final db = sqlite3.open(databaseFile.path);
    db.execute('CREATE TABLE posts (id TEXT PRIMARY KEY, caption TEXT)');
    db.execute('INSERT INTO posts (id, caption) VALUES (?, ?)', [
      'p1',
      'hello',
    ]);
    db.close();

    expect(databaseFile.existsSync(), isTrue);

    final reopened = sqlite3.open(databaseFile.path);
    addTearDown(reopened.close);
    final rows = reopened.select('SELECT caption FROM posts WHERE id = ?', [
      'p1',
    ]);

    expect(rows, hasLength(1));
    expect(rows.first['caption'], 'hello');
  });
}
