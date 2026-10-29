import 'dart:io';

import 'package:flowpost_desktop/features/offline/data/posts_cache.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/scheduling/domain/scheduled_post.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

ScheduledPost post(String id, {String? caption}) => ScheduledPost(
  id: id,
  status: PostStatus.scheduled,
  caption: caption,
  scheduledAt: DateTime.utc(2026, 10, 29, 14, 30),
);

void main() {
  late Directory dir;
  late File file;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('flowpost_posts_cache_test');
    file = File(p.join(dir.path, 'cache.db'));
  });

  tearDown(() async {
    if (await dir.exists()) {
      await dir.delete(recursive: true);
    }
  });

  test('a read comes back from the cache after a reopen', () async {
    final readAt = DateTime.utc(2026, 10, 29, 9, 32);
    final cache = LocalPostsCache(file: () async => file);
    await cache.merge([post('post-1', caption: 'Saved')], readAt: readAt);
    await cache.close();

    final reopened = LocalPostsCache(file: () async => file);
    addTearDown(reopened.close);
    final cached = await reopened.load();

    expect(cached, isNotNull);
    expect(cached!.readAt, readAt);
    expect(cached.posts.single.caption, 'Saved');
  });

  test('a cache that was never written answers nothing', () async {
    final cache = LocalPostsCache(file: () async => file);
    addTearDown(cache.close);

    expect(await cache.load(), isNull);
  });

  test('a file that will not open is renamed, not deleted', () async {
    file.writeAsStringSync('not a database');
    final cache = LocalPostsCache(file: () async => file);
    addTearDown(cache.close);

    expect(await cache.load(), isNull);
    await cache.merge([post('post-1')], readAt: DateTime.utc(2026, 10, 29));
    expect(await cache.load(), isNull);

    final kept = dir.listSync().whereType<File>().where(
      (entry) => p.basename(entry.path).startsWith('cache.corrupt-'),
    );
    expect(kept.single.readAsStringSync(), 'not a database');
  });
}
