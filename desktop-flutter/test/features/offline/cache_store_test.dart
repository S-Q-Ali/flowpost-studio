import 'dart:io';

import 'package:flowpost_desktop/features/offline/data/cache_store.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/scheduling/domain/scheduled_post.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:sqlite3/sqlite3.dart';

ScheduledPost post({
  String id = 'post-1',
  PostStatus status = PostStatus.scheduled,
  PublishPlatform? platform = PublishPlatform.instagram,
  String postType = 'feed',
  String? accountName = 'FlowPost',
  String? caption = 'A caption',
  String? hashtags = '#one',
  DateTime? scheduledAt,
  bool noTime = false,
  DateTime? publishedAt,
  String? videoTitle = 'A video',
  String? thumbnailUrl = 'https://example.test/t.jpg',
  bool containsAlteredContent = false,
}) {
  return ScheduledPost(
    id: id,
    status: status,
    platform: platform,
    postType: postType,
    accountName: accountName,
    caption: caption,
    hashtags: hashtags,
    scheduledAt: noTime
        ? null
        : scheduledAt ?? DateTime.utc(2026, 10, 29, 14, 30),
    publishedAt: publishedAt,
    videoTitle: videoTitle,
    thumbnailUrl: thumbnailUrl,
    containsAlteredContent: containsAlteredContent,
  );
}

void main() {
  late Directory dir;
  late File file;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('flowpost_cache_test');
    file = File(p.join(dir.path, 'cache.db'));
  });

  tearDown(() async {
    if (await dir.exists()) {
      await dir.delete(recursive: true);
    }
  });

  test('the first open creates the file and records the version', () {
    final store = CacheStore(file: file);
    addTearDown(store.close);

    expect(store.open().isOpen, isTrue);
    expect(store.version, cacheSchemaVersion);
    expect(file.existsSync(), isTrue);
  });

  test('a snapshot is still there after a close and a reopen', () {
    final store = CacheStore(file: file);
    final readAt = DateTime.utc(2026, 10, 29, 9, 32);
    store.open();
    store.mergePosts([
      post(
        id: 'post-1',
        status: PostStatus.published,
        platform: PublishPlatform.youtube,
        postType: 'story',
        accountName: 'Studio',
        caption: 'First',
        hashtags: '#a #b',
        scheduledAt: DateTime.utc(2026, 10, 29, 14, 30, 15, 250, 400),
        publishedAt: DateTime.utc(2026, 10, 29, 14, 31),
        videoTitle: 'Clip',
        thumbnailUrl: 'https://example.test/1.jpg',
        containsAlteredContent: true,
      ),
      post(id: 'post-2', caption: null, accountName: null, platform: null),
    ], readAt: readAt);
    store.close();

    final reopened = CacheStore(file: file);
    addTearDown(reopened.close);
    expect(reopened.open().isOpen, isTrue);
    final cached = reopened.loadPosts()!;

    expect(cached.readAt, readAt);
    expect(cached.posts, hasLength(2));
    final first = cached.posts.firstWhere((row) => row.id == 'post-1');
    expect(first.status, PostStatus.published);
    expect(first.platform, PublishPlatform.youtube);
    expect(first.postType, 'story');
    expect(first.accountName, 'Studio');
    expect(first.caption, 'First');
    expect(first.hashtags, '#a #b');
    expect(first.scheduledAt, DateTime.utc(2026, 10, 29, 14, 30, 15, 250, 400));
    expect(first.publishedAt, DateTime.utc(2026, 10, 29, 14, 31));
    expect(first.videoTitle, 'Clip');
    expect(first.thumbnailUrl, 'https://example.test/1.jpg');
    expect(first.containsAlteredContent, isTrue);
    final second = cached.posts.firstWhere((row) => row.id == 'post-2');
    expect(second.platform, isNull);
    expect(second.caption, isNull);
    expect(second.accountName, isNull);
    expect(second.containsAlteredContent, isFalse);
  });

  test('a snapshot keeps the first 500 rows in queue order', () {
    final store = CacheStore(file: file);
    addTearDown(store.close);
    store.open();
    store.mergePosts([
      for (var i = 0; i < 501; i++)
        post(
          id: 'post-$i',
          scheduledAt: DateTime.utc(2026, 1, 1).add(Duration(minutes: i)),
        ),
    ], readAt: DateTime.utc(2026, 10, 29, 9));

    final posts = store.loadPosts()!.posts;
    expect(posts, hasLength(500));
    expect(posts.first.id, 'post-0');
    expect(posts.last.id, 'post-499');
  });

  test('a row with no time comes after the rows that have one', () {
    final store = CacheStore(file: file);
    addTearDown(store.close);
    store.open();
    store.mergePosts([
      post(id: 'no-time', noTime: true),
      post(id: 'later', scheduledAt: DateTime.utc(2026, 11, 2)),
      post(id: 'sooner', scheduledAt: DateTime.utc(2026, 10, 30)),
    ], readAt: DateTime.utc(2026, 10, 29, 9));

    expect(store.loadPosts()!.posts.map((row) => row.id), [
      'sooner',
      'later',
      'no-time',
    ]);
  });

  test('a read adds its rows and keeps the ones it did not name', () {
    final store = CacheStore(file: file);
    addTearDown(store.close);
    store.open();
    store.mergePosts([
      post(id: 'old', scheduledAt: DateTime.utc(2026, 10, 30, 10)),
      post(id: 'older', scheduledAt: DateTime.utc(2026, 10, 30, 11)),
    ], readAt: DateTime.utc(2026, 10, 29, 9));
    // A filtered queue page or one month of the calendar names a part of the
    // rows, not all of them.
    store.mergePosts([
      post(id: 'new', scheduledAt: DateTime.utc(2026, 10, 31)),
    ], readAt: DateTime.utc(2026, 10, 29, 10));

    final cached = store.loadPosts()!;
    expect(cached.posts.map((row) => row.id), ['old', 'older', 'new']);
    expect(cached.readAt, DateTime.utc(2026, 10, 29, 10));
  });

  test('a read replaces a row it names', () {
    final store = CacheStore(file: file);
    addTearDown(store.close);
    store.open();
    store.mergePosts([
      post(id: 'post-1', caption: 'Before'),
    ], readAt: DateTime.utc(2026, 10, 29, 9));
    store.mergePosts([
      post(id: 'post-1', caption: 'After', status: PostStatus.published),
    ], readAt: DateTime.utc(2026, 10, 29, 10));

    final posts = store.loadPosts()!.posts;
    expect(posts, hasLength(1));
    expect(posts.single.caption, 'After');
    expect(posts.single.status, PostStatus.published);
  });

  test('a read of nothing is still a snapshot', () {
    final store = CacheStore(file: file);
    addTearDown(store.close);
    store.open();
    store.mergePosts(const [], readAt: DateTime.utc(2026, 10, 29, 9));

    final cached = store.loadPosts()!;
    expect(cached.posts, isEmpty);
    expect(cached.readAt, DateTime.utc(2026, 10, 29, 9));
  });

  test('a cache that was never written is not a snapshot', () {
    final store = CacheStore(file: file);
    addTearDown(store.close);
    store.open();

    expect(store.loadPosts(), isNull);
  });

  test('a cache written by a newer build is not touched', () {
    final raw = sqlite3.open(file.path);
    raw.execute(
      'CREATE TABLE meta (id INTEGER PRIMARY KEY CHECK (id = 1), '
      'schema_version INTEGER NOT NULL, last_read_at INTEGER)',
    );
    raw.execute('INSERT INTO meta (id, schema_version) VALUES (1, 99)');
    raw.execute('CREATE TABLE marker (id TEXT)');
    raw.close();

    final store = CacheStore(file: file);
    addTearDown(store.close);
    final result = store.open();

    expect(result.isOpen, isFalse);
    expect(result.reason, CacheUnavailable.newerVersion);
    expect(file.existsSync(), isTrue);
    final after = sqlite3.open(file.path);
    addTearDown(after.close);
    expect(
      after.select('SELECT schema_version FROM meta').first['schema_version'],
      99,
    );
    expect(
      after.select("SELECT name FROM sqlite_master WHERE name = 'marker'"),
      hasLength(1),
    );
    expect(
      after.select("SELECT name FROM sqlite_master WHERE name = 'posts'"),
      isEmpty,
    );
  });

  test('a file that is not a database is renamed, never deleted', () {
    file.writeAsStringSync('this is not a database');
    final store = CacheStore(
      file: file,
      clock: () => DateTime(2026, 10, 29, 14, 32),
    );
    addTearDown(store.close);

    final result = store.open();

    expect(result.isOpen, isFalse);
    expect(result.reason, CacheUnavailable.corruptFile);
    expect(file.existsSync(), isFalse);
    final renamed = result.renamedTo!;
    expect(renamed.existsSync(), isTrue);
    expect(p.basename(renamed.path), 'cache.corrupt-20261029-1432.db');
    expect(renamed.readAsStringSync(), 'this is not a database');
  });

  test('a second broken file in the same minute keeps both', () {
    final store = CacheStore(
      file: file,
      clock: () => DateTime(2026, 10, 29, 14, 32),
    );
    addTearDown(store.close);
    file.writeAsStringSync('first');
    expect(
      store.open().renamedTo!.path,
      endsWith('cache.corrupt-20261029-1432.db'),
    );

    file.writeAsStringSync('second');
    final second = store.open();

    expect(second.renamedTo!.existsSync(), isTrue);
    expect(
      p.basename(second.renamedTo!.path),
      'cache.corrupt-20261029-1432-2.db',
    );
    expect(Directory(dir.path).listSync().whereType<File>(), hasLength(2));
  });

  test('a post written after the read joins the snapshot', () {
    final store = CacheStore(file: file);
    addTearDown(store.close);
    store.open();
    store.mergePosts([
      post(id: 'a', scheduledAt: DateTime.utc(2026, 10, 30)),
      post(id: 'c', scheduledAt: DateTime.utc(2026, 11, 1)),
    ], readAt: DateTime.utc(2026, 10, 29, 9));
    store.savePost(
      post(id: 'b', scheduledAt: DateTime.utc(2026, 10, 31)),
      readAt: DateTime.utc(2026, 10, 29, 10),
    );

    expect(store.loadPosts()!.posts.map((row) => row.id), ['a', 'b', 'c']);
  });

  test('a write past the bound drops the last row', () {
    final store = CacheStore(file: file);
    addTearDown(store.close);
    store.open();
    store.mergePosts([
      for (var i = 0; i < 500; i++)
        post(
          id: 'post-$i',
          scheduledAt: DateTime.utc(2026, 1, 1).add(Duration(minutes: i + 1)),
        ),
    ], readAt: DateTime.utc(2026, 10, 29, 9));
    store.savePost(
      post(id: 'first', scheduledAt: DateTime.utc(2026, 1, 1)),
      readAt: DateTime.utc(2026, 10, 29, 10),
    );

    final posts = store.loadPosts()!.posts;
    expect(posts, hasLength(500));
    expect(posts.first.id, 'first');
    expect(posts.map((row) => row.id), isNot(contains('post-499')));
  });

  test('a deleted post leaves the cache', () {
    final store = CacheStore(file: file);
    addTearDown(store.close);
    store.open();
    store.mergePosts([
      post(id: 'gone'),
      post(id: 'kept'),
    ], readAt: DateTime.utc(2026, 10, 29, 9));
    store.removePost('gone');

    expect(store.loadPosts()!.posts.map((row) => row.id), ['kept']);
  });

  test('a row the cache cannot read is skipped', () {
    final store = CacheStore(file: file);
    store.open();
    store.mergePosts(const [], readAt: DateTime.utc(2026, 10, 29, 9));
    store.close();

    final raw = sqlite3.open(file.path);
    raw.execute(
      "INSERT INTO posts (id, status, post_type, fetched_at) "
      "VALUES ('bad', 'weird', 'feed', 0)",
    );
    raw.execute(
      "INSERT INTO posts (id, status, post_type, fetched_at) "
      "VALUES ('good', 'scheduled', 'feed', 0)",
    );
    raw.close();

    final reopened = CacheStore(file: file);
    addTearDown(reopened.close);
    reopened.open();
    expect(reopened.loadPosts()!.posts.map((row) => row.id), ['good']);
  });
}
