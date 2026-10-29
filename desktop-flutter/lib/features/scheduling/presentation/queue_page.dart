import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../publishing/data/posts_repository.dart';
import '../../publishing/domain/publish_target.dart';
import '../domain/scheduled_post.dart';
import '../scheduling_controller.dart';
import 'post_actions.dart';

/// The admin's posts, ordered by when they go out (SPEC-scheduling "The
/// queue").
class QueuePage extends ConsumerWidget {
  const QueuePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final state = ref.watch(queueControllerProvider);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Queue', style: theme.textTheme.headlineSmall),
              const SizedBox(height: 4),
              Text(
                'What is going out, and when. The times are in your own '
                'clock.',
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: 16),
              const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: _FilterBar()),
                  SizedBox(width: 16),
                  _PlatformFilter(),
                ],
              ),
              const SizedBox(height: 16),
              Expanded(
                child: state.when(
                  data: (data) => data.posts.isEmpty
                      ? _EmptyQueue(filter: ref.watch(queueFilterProvider))
                      : _PostList(data: data),
                  loading: () => const _Skeleton(),
                  error: (error, stackTrace) => _QueueError(
                    message: error is PostsException
                        ? error.message
                        : 'The queue could not be read.',
                    onRetry: () => ref.invalidate(queueControllerProvider),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The status the list is filtered by.
class _FilterBar extends ConsumerWidget {
  const _FilterBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(queueFilterProvider);
    return Wrap(
      spacing: 8,
      children: [
        for (final option in QueueFilter.values)
          ChoiceChip(
            key: Key('queue-filter-${option.name}'),
            label: Text(option.label),
            selected: option == filter,
            onSelected: (_) =>
                ref.read(queueFilterProvider.notifier).select(option),
          ),
      ],
    );
  }
}

/// The platform the list is filtered by.
class _PlatformFilter extends ConsumerWidget {
  const _PlatformFilter();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final platform = ref.watch(queuePlatformProvider);
    return DropdownButton<String>(
      key: const Key('queue-platform'),
      value: platform?.name ?? _everyPlatform,
      items: [
        const DropdownMenuItem(
          value: _everyPlatform,
          child: Text('All platforms'),
        ),
        for (final option in PublishPlatform.values)
          DropdownMenuItem(value: option.name, child: Text(option.label)),
      ],
      onChanged: (name) => ref
          .read(queuePlatformProvider.notifier)
          .select(
            name == null || name == _everyPlatform
                ? null
                : PublishPlatform.values.firstWhere(
                    (option) => option.name == name,
                  ),
          ),
    );
  }
}

/// The value that stands for "no platform filter".
const String _everyPlatform = 'all';

/// The rows, with a way to ask for the next page.
class _PostList extends ConsumerWidget {
  const _PostList({required this.data});

  final QueueData data;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Expanded(
          child: ListView.separated(
            itemCount: data.posts.length,
            separatorBuilder: (context, index) => const SizedBox(height: 8),
            itemBuilder: (context, index) => _PostCard(post: data.posts[index]),
          ),
        ),
        if (data.loadMoreError != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(
              data.loadMoreError!,
              key: const Key('queue-page-error'),
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
          ),
        if (data.hasMore)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: data.loadingMore
                ? const SizedBox(
                    height: 24,
                    width: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : OutlinedButton(
                    key: const Key('queue-load-more'),
                    onPressed: () =>
                        ref.read(queueControllerProvider.notifier).loadMore(),
                    child: const Text('Load more'),
                  ),
          ),
      ],
    );
  }
}

/// One post.
class _PostCard extends StatelessWidget {
  const _PostCard({required this.post});

  final ScheduledPost post;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      key: Key('queue-post-${post.id}'),
      child: InkWell(
        onTap: () => showScheduledPost(context, post),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Thumbnail(url: post.thumbnailUrl),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            post.videoTitle ?? 'Untitled media',
                            style: theme.textTheme.titleSmall,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        _StatusChip(status: post.status),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      post.accountName == null
                          ? post.targetLabel
                          : '${post.targetLabel} · ${post.accountName}',
                      style: theme.textTheme.bodySmall,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _timeLine(post),
                      key: Key('queue-time-${post.id}'),
                      style: theme.textTheme.bodySmall,
                    ),
                    if (post.caption != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        post.caption!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium,
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// When the post went out, or when it goes out.
  String _timeLine(ScheduledPost post) {
    if (post.publishedAt != null) {
      return 'Published ${postTimeLabel(post.publishedAt)}';
    }
    if (post.scheduledAt == null) return 'No time set';
    return postTimeLabel(post.scheduledAt);
  }
}

/// The thumbnail of the media, or a mark when there is none.
class _Thumbnail extends StatelessWidget {
  const _Thumbnail({required this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final placeholder = ColoredBox(
      color: scheme.surfaceContainerHighest,
      child: Icon(Icons.video_file_outlined, color: scheme.onSurfaceVariant),
    );
    final url = this.url;
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: SizedBox(
        width: 64,
        height: 64,
        child: url == null
            ? placeholder
            : Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => placeholder,
              ),
      ),
    );
  }
}

/// The status, in the colour the app gives it.
class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final PostStatus status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final color = switch (status) {
      PostStatus.published => Colors.green.shade700,
      PostStatus.failed => FlowPostColors.destructive,
      _ => scheme.primary,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        border: Border.all(color: color),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        status.label,
        style: theme.textTheme.labelSmall?.copyWith(color: color),
      ),
    );
  }
}

/// Nothing to show yet.
class _EmptyQueue extends StatelessWidget {
  const _EmptyQueue({required this.filter});

  final QueueFilter filter;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final firstPage = filter == QueueFilter.all;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.list_alt_rounded,
            size: 56,
            color: theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 12),
          Text(
            firstPage
                ? 'No posts yet'
                : 'No ${filter.label.toLowerCase()} posts',
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            firstPage
                ? 'Upload your first video to get started.'
                : 'Try another filter.',
            style: theme.textTheme.bodyMedium,
          ),
          if (firstPage) ...[
            const SizedBox(height: 16),
            FilledButton.icon(
              key: const Key('queue-upload'),
              onPressed: () => context.go(uploadRoute),
              icon: const Icon(Icons.cloud_upload_outlined),
              label: const Text('Upload a video'),
            ),
          ],
        ],
      ),
    );
  }
}

/// The queue could not be read.
class _QueueError extends StatelessWidget {
  const _QueueError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cloud_off, size: 48, color: theme.colorScheme.error),
          const SizedBox(height: 12),
          Text(
            message,
            key: const Key('queue-error'),
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          OutlinedButton(
            key: const Key('queue-retry'),
            onPressed: onRetry,
            child: const Text('Try again'),
          ),
        ],
      ),
    );
  }
}

/// The shape of the rows while the first page is read.
class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListView.builder(
      itemCount: 3,
      itemBuilder: (context, index) => Container(
        height: 88,
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }
}
