import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/app_providers.dart';
import '../publishing/data/posts_repository.dart';
import 'connectivity.dart';
import 'data/drafts_repository.dart';
import 'data/posts_cache.dart';

/// The local drafts. The tests override it with an in-memory repository, so
/// no test writes to the machine's support folder.
final draftsRepositoryProvider = Provider<DraftsRepository>((ref) {
  final repository = LocalDraftsRepository();
  ref.onDispose(repository.close);
  return repository;
});

/// The cached posts. Overridden in tests for the same reason as the drafts.
final postsCacheProvider = Provider<PostsCache>((ref) {
  final cache = LocalPostsCache();
  ref.onDispose(cache.close);
  return cache;
});

/// Every posts call goes through here, so the app learns the state of the
/// connection from the calls it already makes.
final postsTransportProvider = Provider<PostsTransport>((ref) {
  final config = ref.watch(appConfigProvider);
  final connectivity = ref.read(connectivityProvider.notifier);
  return ReportingTransport(
    inner: HttpPostsTransport(anonKey: config.supabaseAnonKey),
    onReached: connectivity.reached,
    onLost: connectivity.lost,
  );
});
