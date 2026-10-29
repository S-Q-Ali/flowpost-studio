import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/app_providers.dart';
import 'data/scheduled_posts_repository.dart';

/// The queue's reads.
///
/// They need the Auth token: the `posts` policy only lets a user read their
/// own rows.
final scheduledPostsRepositoryProvider = Provider<ScheduledPostsRepository>((
  ref,
) {
  final config = ref.watch(appConfigProvider);
  return PostgrestScheduledPostsRepository(
    supabaseUrl: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    token: ref.watch(authAccessTokenProvider),
  );
});
