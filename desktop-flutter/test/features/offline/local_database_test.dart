import 'dart:io';

import 'package:flowpost_desktop/features/offline/data/local_database.dart';
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

  group('migrations', () {
    late Database db;

    setUp(() {
      db = sqlite3.open(databaseFile.path);
    });

    tearDown(() => db.close());

    test('the missing ones run in order and the version moves', () {
      final migrations = [
        const LocalMigration(1, ['CREATE TABLE a (id TEXT)']),
        const LocalMigration(2, [
          'CREATE TABLE b (id TEXT)',
          'CREATE TABLE c (id TEXT)',
        ]),
      ];

      expect(applyMigrations(db, migrations, from: 0), 2);
      expect(readVersion(db), 2);
      expect(
        db.select(
          "SELECT name FROM sqlite_master WHERE type = 'table' "
          "AND name IN ('a', 'b', 'c')",
        ),
        hasLength(3),
      );
    });

    test('the ones already applied do not run again', () {
      const first = LocalMigration(1, ['CREATE TABLE a (id TEXT)']);
      final migrations = [
        first,
        const LocalMigration(2, ['CREATE TABLE b (id TEXT)']),
      ];
      applyMigrations(db, [first], from: 0);
      // Migration 1 would throw if it ran twice: the table is already there.
      expect(applyMigrations(db, migrations, from: 1), 2);
    });

    test('a migration that throws leaves the version before it', () {
      final migrations = [
        const LocalMigration(1, ['CREATE TABLE a (id TEXT)']),
        const LocalMigration(2, ['CREATE TABLE b (id TEXT)', 'CREATE TABLE']),
      ];

      expect(
        () => applyMigrations(db, migrations, from: 0),
        throwsA(isA<SqliteException>()),
      );
      expect(readVersion(db), 1);
      expect(
        db.select("SELECT name FROM sqlite_master WHERE name = 'b'"),
        isEmpty,
      );
    });

    test('a database with no meta table is at version zero', () {
      expect(readVersion(db), 0);
    });
  });
}
