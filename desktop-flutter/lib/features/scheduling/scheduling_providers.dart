import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/app_providers.dart';
import '../offline/offline_providers.dart';
import 'data/scheduled_posts_repository.dart';

/// The queue's reads.
///
/// They need the license session: the function reads the owner from the
/// session and only returns that user's rows.
final scheduledPostsRepositoryProvider = Provider<ScheduledPostsRepository>((
  ref,
) {
  return PostsApiScheduledPostsRepository(
    sessionToken: ref.watch(sessionTokenProvider),
    transport: ref.watch(postsTransportProvider),
  );
});
