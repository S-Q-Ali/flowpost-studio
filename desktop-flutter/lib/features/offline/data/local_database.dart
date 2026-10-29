import 'package:sqlite3/sqlite3.dart';

/// One numbered step of a local database's schema (SPEC-offline "The schema
/// and the migrations").
class LocalMigration {
  const LocalMigration(this.version, this.statements);

  final int version;
  final List<String> statements;
}

/// The table the schema version lives in, so the version is inside the
/// database and not in the file name (ADR 0003).
///
/// The runner owns it, so every local database has it before its first
/// migration runs.
const String _metaTable =
    'CREATE TABLE IF NOT EXISTS meta ('
    'id INTEGER PRIMARY KEY CHECK (id = 1), '
    'schema_version INTEGER NOT NULL, '
    'last_read_at INTEGER)';

/// The version of a database, or zero when it has never been migrated.
int readVersion(Database db) {
  final tables = db.select(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'",
  );
  if (tables.isEmpty) return 0;
  final rows = db.select('SELECT schema_version FROM meta WHERE id = 1');
  if (rows.isEmpty) return 0;
  final version = rows.first['schema_version'];
  return version is int ? version : 0;
}

/// Applies every migration past [from], in order, and returns the version the
/// database ends at.
///
/// Each migration runs in its own transaction with the version, so a step
/// that throws leaves the database at the version before it — the old file
/// stays as it was (SPEC-offline "The schema and the migrations").
int applyMigrations(
  Database db,
  List<LocalMigration> migrations, {
  required int from,
}) {
  var version = from;
  for (final migration in migrations) {
    if (migration.version <= version) continue;
    db.execute('BEGIN');
    try {
      db.execute(_metaTable);
      for (final statement in migration.statements) {
        db.execute(statement);
      }
      version = migration.version;
      db.execute(
        'INSERT INTO meta (id, schema_version) '
        'SELECT 1, ? WHERE NOT EXISTS (SELECT 1 FROM meta WHERE id = 1)',
        [version],
      );
      db.execute('UPDATE meta SET schema_version = ? WHERE id = 1', [version]);
      db.execute('COMMIT');
    } catch (_) {
      db.execute('ROLLBACK');
      rethrow;
    }
  }
  return version;
}
