import 'package:flowpost_desktop/features/offline/data/cache_store.dart';
import 'package:flowpost_desktop/features/offline/data/posts_cache.dart';
import 'package:flowpost_desktop/features/scheduling/domain/scheduled_post.dart';

/// A cache that answers from memory.
class FakePostsCache implements PostsCache {
  FakePostsCache([this.cached]);

  /// The answer to a read. Null means nothing was read into the cache yet.
  CachedPosts? cached;

  /// Every read that was written to the cache, in call order.
  final List<({List<ScheduledPost> posts, DateTime readAt})> merges = [];

  /// Every row written on its own.
  final List<ScheduledPost> saved = [];

  /// Every id that was dropped.
  final List<String> removed = [];

  /// How many times the whole cache was wiped.
  int wipes = 0;

  @override
  Future<CachedPosts?> load() async => cached;

  @override
  Future<void> merge(
    Iterable<ScheduledPost> posts, {
    required DateTime readAt,
  }) async {
    merges.add((posts: posts.toList(), readAt: readAt));
  }

  @override
  Future<void> save(ScheduledPost post, {required DateTime readAt}) async {
    saved.add(post);
  }

  @override
  Future<void> remove(String postId) async {
    removed.add(postId);
  }

  @override
  Future<void> wipe() async {
    wipes++;
    cached = null;
  }
}
