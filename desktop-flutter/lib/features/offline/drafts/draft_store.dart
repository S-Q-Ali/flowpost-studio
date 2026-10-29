import 'dart:convert';
import 'dart:io';

import 'package:sqlite3/sqlite3.dart';

import '../../publishing/domain/publish_selection.dart';
import '../data/local_database.dart';
import 'compose_draft.dart';

/// The version this build writes and reads for the drafts.
const int draftsSchemaVersion = 1;

/// The drafts schema, one numbered step at a time.
const List<LocalMigration> draftsMigrations = [
  LocalMigration(1, [
    'CREATE TABLE drafts ('
        'video_id TEXT PRIMARY KEY, '
        'target_ids TEXT NOT NULL, '
        'captions TEXT NOT NULL, '
        'ai_captions TEXT NOT NULL, '
        'youtube_title TEXT NOT NULL, '
        'mode TEXT NOT NULL, '
        'schedule_date TEXT NOT NULL, '
        'schedule_time TEXT NOT NULL, '
        'resolved_at INTEGER, '
        'offset_minutes INTEGER, '
        'saved_at INTEGER NOT NULL)',
  ]),
];

/// The compose drafts (`drafts.db`).
///
/// This is the one store on the machine the server does not have a copy of,
/// so it is a database of its own: a cache rebuild or a wipe never reaches
/// it (ADR 0003). A file the store cannot read is left exactly where it is —
/// the admin starts fresh from the diagnostics screen, never by the store
/// deleting something on its own.
class DraftStore {
  DraftStore({required this.file});

  final File file;

  Database? _database;

  /// Opens and migrates the database. False when it cannot be used; the file
  /// is never renamed and never deleted here.
  bool open() {
    if (_database != null) return true;
    try {
      file.parent.createSync(recursive: true);
    } on FileSystemException {
      return false;
    }
    final Database db;
    try {
      db = sqlite3.open(file.path);
    } on Exception {
      return false;
    }
    try {
      final version = readVersion(db);
      if (version > draftsSchemaVersion) {
        db.close();
        return false;
      }
      applyMigrations(db, draftsMigrations, from: version);
      _database = db;
      return true;
    } on Exception {
      db.close();
      return false;
    }
  }

  void close() {
    _database?.close();
    _database = null;
  }

  /// The draft of one media, or null when there is none.
  ComposeDraft? load(String videoId) {
    final db = _database;
    if (db == null) return null;
    final rows = db.select('SELECT * FROM drafts WHERE video_id = ?', [
      videoId,
    ]);
    if (rows.isEmpty) return null;
    return _draft(rows.first);
  }

  /// Writes the draft of one media, replacing the one before it.
  void save(ComposeDraft draft) {
    final db = _database;
    if (db == null) return;
    db.execute(
      'INSERT OR REPLACE INTO drafts ('
      'video_id, target_ids, captions, ai_captions, youtube_title, mode, '
      'schedule_date, schedule_time, resolved_at, offset_minutes, saved_at) '
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        draft.videoId,
        jsonEncode(draft.targetIds.toList()),
        jsonEncode(draft.captions),
        jsonEncode(draft.aiCaptions),
        draft.youtubeTitle,
        draft.mode.name,
        draft.scheduleDate,
        draft.scheduleTime,
        draft.resolvedAt?.toUtc().microsecondsSinceEpoch,
        draft.offsetMinutes,
        draft.savedAt.toUtc().microsecondsSinceEpoch,
      ],
    );
  }

  void delete(String videoId) {
    _database?.execute('DELETE FROM drafts WHERE video_id = ?', [videoId]);
  }
}

ComposeDraft _draft(Row row) {
  final savedAt =
      _instant(row['saved_at']) ?? DateTime.fromMillisecondsSinceEpoch(0);
  return ComposeDraft(
    videoId: row['video_id'] as String,
    savedAt: savedAt,
    targetIds: _strings(row['target_ids']).toSet(),
    captions: _texts(row['captions']),
    aiCaptions: _texts(row['ai_captions']),
    youtubeTitle: row['youtube_title'] as String? ?? '',
    mode: row['mode'] == PublishMode.schedule.name
        ? PublishMode.schedule
        : PublishMode.now,
    scheduleDate: row['schedule_date'] as String? ?? '',
    scheduleTime: row['schedule_time'] as String? ?? '',
    resolvedAt: _instant(row['resolved_at']),
    offsetMinutes: row['offset_minutes'] is int
        ? row['offset_minutes'] as int
        : null,
  );
}

List<String> _strings(Object? raw) {
  if (raw is! String) return const [];
  try {
    final decoded = jsonDecode(raw);
    if (decoded is! List) return const [];
    return [
      for (final value in decoded)
        if (value is String) value,
    ];
  } on FormatException {
    return const [];
  }
}

Map<String, String> _texts(Object? raw) {
  if (raw is! String) return const {};
  try {
    final decoded = jsonDecode(raw);
    if (decoded is! Map) return const {};
    return {
      for (final entry in decoded.entries)
        if (entry.key is String && entry.value is String)
          entry.key as String: entry.value as String,
    };
  } on FormatException {
    return const {};
  }
}

DateTime? _instant(Object? value) => value is int
    ? DateTime.fromMicrosecondsSinceEpoch(value, isUtc: true)
    : null;
