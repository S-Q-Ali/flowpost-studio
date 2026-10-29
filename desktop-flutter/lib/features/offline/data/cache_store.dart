import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:sqlite3/sqlite3.dart';

import '../../publishing/data/posts_repository.dart';
import '../../publishing/domain/publish_target.dart';
import '../../scheduling/domain/scheduled_post.dart';
import 'local_database.dart';

/// The version this build writes and reads (SPEC-offline "The schema and the
/// migrations").
const int cacheSchemaVersion = 1;

/// How many posts the cache keeps (SPEC-offline "How much", Decision 6).
const int cachePostLimit = 500;

/// The schema, one numbered step at a time.
const List<LocalMigration> cacheMigrations = [
  LocalMigration(1, [
    'CREATE TABLE posts ('
        'id TEXT PRIMARY KEY, '
        'status TEXT NOT NULL, '
        'platform TEXT, '
        'post_type TEXT NOT NULL, '
        'account_name TEXT, '
        'caption TEXT, '
        'hashtags TEXT, '
        // Microseconds since the epoch, UTC: an integer sorts correctly where
        // an ISO string does not once one row carries microseconds.
        'scheduled_at INTEGER, '
        'published_at INTEGER, '
        'video_title TEXT, '
        'thumbnail_url TEXT, '
        'contains_altered_content INTEGER NOT NULL DEFAULT 0, '
        'fetched_at INTEGER NOT NULL)',
  ]),
];

/// Why the app has no cache.
enum CacheUnavailable { newerVersion, corruptFile }

/// What opening the cache found.
class CacheOpenResult {
  const CacheOpenResult.opened() : reason = null, renamedTo = null;

  const CacheOpenResult.unavailable(this.reason, {this.renamedTo});

  /// Null when the cache is open and usable.
  final CacheUnavailable? reason;

  /// Where a file that would not open was moved. The app never deletes it.
  final File? renamedTo;

  bool get isOpen => reason == null;
}

/// One cached read: the rows and when they were read from the server.
class CachedPosts {
  const CachedPosts({required this.posts, required this.readAt});

  final List<ScheduledPost> posts;
  final DateTime readAt;
}

/// The local cache of the admin's reads (`cache.db`).
///
/// It is a snapshot of reads, never of the admin's unpublished work: the
/// drafts live in their own database, so a cache rebuild cannot reach them
/// (ADR 0003).
class CacheStore {
  CacheStore({required this.file, DateTime Function()? clock})
    : _clock = clock ?? DateTime.now;

  final File file;

  /// The clock behind the timestamp on a renamed file, so a test can pin it.
  final DateTime Function() _clock;

  Database? _database;
  int _version = 0;

  /// The schema version of the open database. Zero while it is closed.
  int get version => _version;

  /// Opens the database, migrates it, and reports what it found.
  ///
  /// A file that will not open, or a migration that throws, is renamed — not
  /// deleted — and the app runs without a cache. A file written by a newer
  /// build is not touched at all, so a downgrade cannot destroy data.
  CacheOpenResult open() {
    final open = _database;
    if (open != null) return const CacheOpenResult.opened();
    file.parent.createSync(recursive: true);

    final Database db;
    try {
      db = sqlite3.open(file.path);
    } on Exception {
      return _renameCorrupt();
    }
    try {
      final version = readVersion(db);
      if (version > cacheSchemaVersion) {
        db.close();
        return const CacheOpenResult.unavailable(CacheUnavailable.newerVersion);
      }
      _version = applyMigrations(db, cacheMigrations, from: version);
      _database = db;
      return const CacheOpenResult.opened();
    } on Exception {
      db.close();
      return _renameCorrupt();
    }
  }

  void close() {
    _database?.close();
    _database = null;
    _version = 0;
  }

  /// The snapshot, or null when nothing has been read into the cache yet.
  ///
  /// Null is not the same as an empty list: an empty list is a read that
  /// found nothing, with its own timestamp.
  CachedPosts? loadPosts() {
    final db = _requireOpen();
    final meta = db.select('SELECT last_read_at FROM meta WHERE id = 1');
    final readAt = meta.isEmpty ? null : _instant(meta.first['last_read_at']);
    if (readAt == null) return null;
    final rows = db.select(
      'SELECT * FROM posts '
      'ORDER BY scheduled_at IS NULL, scheduled_at ASC, id ASC',
    );
    final posts = <ScheduledPost>[];
    for (final row in rows) {
      final post = _post(row);
      if (post != null) posts.add(post);
    }
    return CachedPosts(posts: posts, readAt: readAt);
  }

  /// Replaces the snapshot with a read from the server.
  ///
  /// Only a read that succeeded gets here, so a failed read never empties the
  /// cache. [posts] is kept in the order given — the queue's order — and the
  /// first [cachePostLimit] rows are kept, so the rows that fall out are the
  /// ones furthest down the list.
  void savePosts(Iterable<ScheduledPost> posts, {required DateTime readAt}) {
    final db = _requireOpen();
    final kept = posts.take(cachePostLimit).toList();
    final stamp = _micros(readAt)!;
    _transaction(db, () {
      db.execute('DELETE FROM posts');
      for (final post in kept) {
        _insert(db, post, stamp);
      }
      db.execute(
        'INSERT INTO meta (id, schema_version, last_read_at) '
        'VALUES (1, ?, ?) '
        'ON CONFLICT (id) DO UPDATE SET last_read_at = excluded.last_read_at',
        [_version, stamp],
      );
    });
  }

  /// Writes one row after the client changed it, so the screen does not wait
  /// for the next read (SPEC-offline "When it is refreshed").
  ///
  /// The snapshot's read time is left alone: it is the time the list was read
  /// from the server.
  void savePost(ScheduledPost post, {required DateTime readAt}) {
    final db = _requireOpen();
    _transaction(db, () {
      _insert(db, post, _micros(readAt)!);
      db.execute(
        'DELETE FROM posts WHERE id NOT IN ('
        'SELECT id FROM posts '
        'ORDER BY scheduled_at IS NULL, scheduled_at ASC, id ASC LIMIT ?)',
        [cachePostLimit],
      );
    });
  }

  /// Drops one row after the client deleted it.
  void removePost(String id) {
    _requireOpen().execute('DELETE FROM posts WHERE id = ?', [id]);
  }

  Database _requireOpen() {
    final db = _database;
    if (db == null) throw StateError('The cache is not open.');
    return db;
  }

  void _transaction(Database db, void Function() body) {
    db.execute('BEGIN');
    try {
      body();
      db.execute('COMMIT');
    } catch (_) {
      db.execute('ROLLBACK');
      rethrow;
    }
  }

  /// The file is moved aside with the time it was found, so two broken files
  /// in the same minute both survive.
  CacheOpenResult _renameCorrupt() {
    final at = _clock();
    final stem =
        '${p.basenameWithoutExtension(file.path)}.corrupt-'
        '${at.year}${_two(at.month)}${_two(at.day)}-'
        '${_two(at.hour)}${_two(at.minute)}';
    final extension = p.extension(file.path);
    var target = File(p.join(file.parent.path, '$stem$extension'));
    for (var n = 2; target.existsSync(); n++) {
      target = File(p.join(file.parent.path, '$stem-$n$extension'));
    }
    try {
      file.renameSync(target.path);
    } on FileSystemException {
      return const CacheOpenResult.unavailable(CacheUnavailable.corruptFile);
    }
    return CacheOpenResult.unavailable(
      CacheUnavailable.corruptFile,
      renamedTo: target,
    );
  }
}

void _insert(Database db, ScheduledPost post, int stamp) {
  db.execute(
    'INSERT OR REPLACE INTO posts ('
    'id, status, platform, post_type, account_name, caption, hashtags, '
    'scheduled_at, published_at, video_title, thumbnail_url, '
    'contains_altered_content, fetched_at) '
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      post.id,
      post.status.name,
      post.platform?.name,
      post.postType,
      post.accountName,
      post.caption,
      post.hashtags,
      _micros(post.scheduledAt),
      _micros(post.publishedAt),
      post.videoTitle,
      post.thumbnailUrl,
      post.containsAlteredContent ? 1 : 0,
      stamp,
    ],
  );
}

/// The row as the screen's model, or null when the row cannot be shown — the
/// same rule the server read follows, so a damaged row never renders as one
/// this build made up.
ScheduledPost? _post(Row row) {
  final id = row['id'];
  final status = PostStatus.fromName(row['status']);
  if (id is! String || id.isEmpty || status == null) return null;
  final postType = row['post_type'];
  return ScheduledPost(
    id: id,
    status: status,
    platform: _platform(row['platform']),
    postType: postType is String ? postType : 'feed',
    accountName: _text(row['account_name']),
    caption: _text(row['caption']),
    hashtags: _text(row['hashtags']),
    scheduledAt: _instant(row['scheduled_at']),
    publishedAt: _instant(row['published_at']),
    videoTitle: _text(row['video_title']),
    thumbnailUrl: _text(row['thumbnail_url']),
    containsAlteredContent: row['contains_altered_content'] == 1,
  );
}

PublishPlatform? _platform(Object? name) =>
    name is String ? PublishPlatform.values.asNameMap()[name] : null;

int? _micros(DateTime? instant) => instant?.toUtc().microsecondsSinceEpoch;

DateTime? _instant(Object? value) => value is int
    ? DateTime.fromMicrosecondsSinceEpoch(value, isUtc: true)
    : null;

String? _text(Object? value) {
  if (value is! String || value.isEmpty) return null;
  return value;
}

String _two(int value) => value.toString().padLeft(2, '0');
