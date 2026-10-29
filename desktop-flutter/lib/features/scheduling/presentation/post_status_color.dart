import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../publishing/data/posts_repository.dart';

/// The colour a status is shown in, shared by the queue and the calendar so
/// the two cannot drift apart (SPEC-accessibility Decision 4).
Color postStatusColor(PostStatus status, ColorScheme scheme) =>
    switch (status) {
      PostStatus.published => Colors.green.shade900,
      PostStatus.failed => scheme.error,
      _ => FlowPostColors.primaryText,
    };
