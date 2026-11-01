import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../publishing/data/posts_repository.dart';

/// The colour a status is shown in, shared by the queue and the calendar so
/// the two cannot drift apart (SPEC-accessibility Decision 4).
Color postStatusColor(PostStatus status, ThemeData theme) => switch (status) {
  PostStatus.published => theme.success,
  PostStatus.failed => theme.colorScheme.error,
  _ => theme.primaryText,
};
