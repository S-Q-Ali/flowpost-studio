import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/app_providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../offline/offline_providers.dart';
import '../../publishing/data/posts_repository.dart';
import '../../publishing/domain/publish_validation.dart';
import '../domain/post_edit.dart';
import '../domain/scheduled_post.dart';
import '../scheduling_controller.dart';
import '../scheduling_providers.dart';

/// Opens one post: what it says, when it goes out, and what can be done.
Future<void> showScheduledPost(BuildContext context, ScheduledPost post) {
  return showDialog<void>(
    context: context,
    builder: (context) => _PostDetails(post: post),
  );
}

class _PostDetails extends ConsumerStatefulWidget {
  const _PostDetails({required this.post});

  final ScheduledPost post;

  @override
  ConsumerState<_PostDetails> createState() => _PostDetailsState();
}

class _PostDetailsState extends ConsumerState<_PostDetails> {
  String? _error;
  bool _busy = false;

  ScheduledPost get _post => widget.post;

  /// Rows that stopped moving can still be removed; a row that is being
  /// published cannot, because the platform may already have it.
  bool get _canDelete =>
      _post.status == PostStatus.failed ||
      _post.status == PostStatus.published ||
      _post.isStaleProcessing();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final post = _post;
    final where = post.accountName == null
        ? post.targetLabel
        : '${post.targetLabel} · ${post.accountName}';
    return AlertDialog(
      title: Text(post.videoTitle ?? 'Post'),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(where, style: theme.textTheme.bodySmall),
            const SizedBox(height: 4),
            Text(
              '${post.status.label} · ${postTimeLabel(post.scheduledAt)}',
              key: const Key('post-when'),
              style: theme.textTheme.bodySmall,
            ),
            if (post.caption != null) ...[
              const SizedBox(height: 12),
              Text(post.caption!, style: theme.textTheme.bodyMedium),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                key: const Key('post-error'),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.error,
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        if (post.status == PostStatus.scheduled && post.scheduledAt != null)
          TextButton(
            key: const Key('post-edit'),
            onPressed: _busy ? null : _edit,
            child: const Text('Edit'),
          ),
        if (post.canCancel)
          TextButton(
            key: const Key('post-cancel'),
            onPressed: _busy ? null : _confirmAndDelete,
            style: TextButton.styleFrom(
              foregroundColor: FlowPostColors.destructive,
            ),
            child: const Text('Cancel post'),
          ),
        if (_canDelete)
          TextButton(
            key: const Key('post-delete'),
            onPressed: _busy ? null : _confirmAndDelete,
            style: TextButton.styleFrom(
              foregroundColor: FlowPostColors.destructive,
            ),
            child: const Text('Delete'),
          ),
        TextButton(
          key: const Key('post-close'),
          onPressed: _busy ? null : () => Navigator.of(context).pop(),
          child: const Text('Close'),
        ),
      ],
    );
  }

  Future<void> _edit() async {
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => _EditPostForm(post: _post),
    );
    if (saved == true && mounted) {
      ref.invalidate(queueControllerProvider);
      ref.invalidate(calendarControllerProvider);
      Navigator.of(context).pop();
    }
  }

  Future<void> _confirmAndDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: Text(deleteSentence(_post)),
        actions: [
          TextButton(
            key: const Key('confirm-keep'),
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep it'),
          ),
          FilledButton(
            key: const Key('confirm-delete'),
            onPressed: () => Navigator.of(context).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: FlowPostColors.destructive,
              foregroundColor: Colors.white,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      // The status the dialog saw is the guard: a scheduled row the publisher
      // claimed while the confirmation was open must not be deleted.
      final deleted = await ref
          .read(scheduledPostsRepositoryProvider)
          .delete(_post.id, onlyIf: _post.status);
      if (!mounted) return;
      if (!deleted) {
        setState(() {
          _busy = false;
          _error = 'That post was already gone.';
        });
        return;
      }
      await ref.read(postsCacheProvider).remove(_post.id);
      if (!mounted) return;
      ref.invalidate(queueControllerProvider);
      ref.invalidate(calendarControllerProvider);
      Navigator.of(context).pop();
    } on PostsException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error.message;
      });
    }
  }
}

/// The form that changes a scheduled row in place.
class _EditPostForm extends ConsumerStatefulWidget {
  const _EditPostForm({required this.post});

  final ScheduledPost post;

  @override
  ConsumerState<_EditPostForm> createState() => _EditPostFormState();
}

class _EditPostFormState extends ConsumerState<_EditPostForm> {
  late final TextEditingController _caption = TextEditingController(
    text: widget.post.caption ?? '',
  );
  late final TextEditingController _hashtags = TextEditingController(
    text: widget.post.hashtags ?? '',
  );
  late final ({String date, String time}) _fields = scheduleFields(
    widget.post.scheduledAt!.toLocal(),
  );
  late final TextEditingController _date = TextEditingController(
    text: _fields.date,
  );
  late final TextEditingController _time = TextEditingController(
    text: _fields.time,
  );
  late bool _altered = widget.post.containsAlteredContent;

  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _caption.dispose();
    _hashtags.dispose();
    _date.dispose();
    _time.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Edit post'),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                key: const Key('edit-caption'),
                controller: _caption,
                maxLines: 5,
                decoration: const InputDecoration(labelText: 'Caption'),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('edit-hashtags'),
                controller: _hashtags,
                decoration: const InputDecoration(labelText: 'Hashtags'),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('edit-date'),
                      controller: _date,
                      decoration: const InputDecoration(
                        labelText: 'Date (YYYY-MM-DD)',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  SizedBox(
                    width: 140,
                    child: TextField(
                      key: const Key('edit-time'),
                      controller: _time,
                      decoration: const InputDecoration(
                        labelText: 'Time (HH:MM)',
                      ),
                    ),
                  ),
                ],
              ),
              CheckboxListTile(
                key: const Key('edit-altered'),
                value: _altered,
                onChanged: _busy
                    ? null
                    : (value) => setState(() => _altered = value ?? false),
                title: const Text('Contains altered content'),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
              ),
              if (_error != null)
                Text(
                  _error!,
                  key: const Key('edit-error'),
                  style: Theme.of(context).textTheme.bodySmall
                      ?.copyWith(color: Theme.of(context).colorScheme.error),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          key: const Key('edit-cancel'),
          onPressed: _busy ? null : () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          key: const Key('edit-save'),
          onPressed: _busy ? null : _save,
          child: _busy
              ? const SizedBox(
                  height: 16,
                  width: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Save'),
        ),
      ],
    );
  }

  Future<void> _save() async {
    final post = widget.post;
    final check = checkScheduleEdit(
      platform: post.platform,
      caption: _caption.text,
      date: _date.text,
      time: _time.text,
      previousScheduledAt: post.scheduledAt,
      zone: ref.read(timeZoneProvider),
    );
    if (!check.isValid) {
      setState(() => _error = check.message);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final edit = PostEdit(
        caption: _emptyAsNull(_caption.text),
        hashtags: _emptyAsNull(_hashtags.text),
        containsAlteredContent: _altered,
        scheduledAt: check.instant!,
      );
      final saved = await ref
          .read(scheduledPostsRepositoryProvider)
          .updateScheduled(post.id, edit);
      if (!mounted) return;
      if (!saved) {
        setState(() {
          _busy = false;
          _error = 'This post is no longer scheduled, so it was not changed.';
        });
        return;
      }
      // The server took the row, so the cache is updated now rather than at
      // the next read: if the connection drops first, the screen must not show
      // the caption the admin just replaced (SPEC-offline "The cache").
      await ref
          .read(postsCacheProvider)
          .save(
            ScheduledPost(
              id: post.id,
              status: post.status,
              platform: post.platform,
              postType: post.postType,
              accountName: post.accountName,
              caption: edit.caption,
              hashtags: edit.hashtags,
              scheduledAt: edit.scheduledAt,
              publishedAt: post.publishedAt,
              videoTitle: post.videoTitle,
              thumbnailUrl: post.thumbnailUrl,
              containsAlteredContent: edit.containsAlteredContent,
            ),
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on PostsException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error.message;
      });
    }
  }

  String? _emptyAsNull(String value) => value.trim().isEmpty ? null : value;
}
