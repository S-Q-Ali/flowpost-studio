import 'dart:io';

import 'package:logging/logging.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../scheduling/domain/scheduled_post.dart';
import 'cache_store.dart';

/// The cached posts, as the screens read them.
abstract class PostsCache {
  /// The last read, or null when nothing was read into the cache yet.
  Future<CachedPosts?> load();

  /// Adds a read that succeeded to the cache.
  Future<void> merge(Iterable<ScheduledPost> posts, {required DateTime readAt});

  /// Writes one row the client changed.
  Future<void> save(ScheduledPost post, {required DateTime readAt});

  /// Drops one row the client deleted.
  Future<void> remove(String postId);

  /// Removes the whole cache, for a sign-out (SPEC-offline Decision 8).
  ///
  /// The next call opens a fresh file. A wipe that fails leaves the admin
  /// signed out all the same; the file stays on disk for the diagnostics
  /// screen.
  Future<void> wipe();
}

/// The cache in `cache.db`, in the app's support folder.
///
/// Every method swallows a failure: a cache that cannot be opened must never
/// take a screen down, and the screens already show their own reason when the
/// server cannot be read.
class LocalPostsCache implements PostsCache {
  LocalPostsCache({Future<File> Function()? file, Logger? log})
    : _file = file ?? _supportFile,
      _log = log ?? Logger('cache');

  final Future<File> Function() _file;
  final Logger _log;
  Future<CacheStore?>? _store;

  Future<CacheStore?> _open() => _store ??= _openStore();

  /// Lets go of the file, so the app can shut down without holding it.
  Future<void> close() async {
    final store = _store;
    if (store == null) return;
    (await store)?.close();
  }

  Future<CacheStore?> _openStore() async {
    try {
      final store = CacheStore(file: await _file());
      final result = store.open();
      if (result.isOpen) return store;
      // A file that would not open was renamed by the store, and the app
      // carries on without a cache (SPEC-offline "Corruption").
      store.close();
      _log.warning('The cache is not available (${result.reason?.name}).');
      return null;
    } on Object catch (error) {
      // The type only: a path must never reach the log.
      _log.warning('The cache could not be opened (${error.runtimeType}).');
      return null;
    }
  }

  @override
  Future<CachedPosts?> load() async {
    try {
      return (await _open())?.loadPosts();
    } on Object catch (error) {
      _log.warning('The cache could not be read (${error.runtimeType}).');
      return null;
    }
  }

  @override
  Future<void> merge(
    Iterable<ScheduledPost> posts, {
    required DateTime readAt,
  }) async {
    try {
      (await _open())?.mergePosts(posts, readAt: readAt);
    } on Object catch (error) {
      _log.warning('The cache could not be written (${error.runtimeType}).');
    }
  }

  @override
  Future<void> save(ScheduledPost post, {required DateTime readAt}) async {
    try {
      (await _open())?.savePost(post, readAt: readAt);
    } on Object catch (error) {
      _log.warning('The cache could not be written (${error.runtimeType}).');
    }
  }

  @override
  Future<void> remove(String postId) async {
    try {
      (await _open())?.removePost(postId);
    } on Object catch (error) {
      _log.warning('The cache could not be written (${error.runtimeType}).');
    }
  }

  @override
  Future<void> wipe() async {
    try {
      final store = _store;
      // The next read must not find the closed handle, so the future is
      // dropped before the file is removed.
      _store = null;
      if (store != null) (await store)?.close();
      final file = await _file();
      if (await file.exists()) await file.delete();
    } on Object catch (error) {
      _log.warning('The cache could not be wiped (${error.runtimeType}).');
    }
  }
}

Future<File> _supportFile() async {
  final dir = await getApplicationSupportDirectory();
  return File(p.join(dir.path, 'cache.db'));
}
