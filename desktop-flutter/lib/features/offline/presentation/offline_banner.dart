import 'package:flutter/material.dart';

/// Says the rows on the screen came from this machine, and when they were
/// read (SPEC-offline "The banner").
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key, required this.readAt, required this.onRetry});

  /// When the rows were read from the server.
  final DateTime readAt;

  /// Asks the server again.
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Container(
      key: const Key('offline-banner'),
      padding: const EdgeInsets.fromLTRB(12, 6, 4, 6),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(Icons.cloud_off, size: 18, color: scheme.onSurfaceVariant),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'No connection. Showing what was saved on this machine, '
              'last read at ${_clock(readAt.toLocal())}.',
              style: theme.textTheme.bodySmall,
            ),
          ),
          TextButton(
            key: const Key('offline-retry'),
            onPressed: onRetry,
            child: const Text('Try again'),
          ),
        ],
      ),
    );
  }
}

String _clock(DateTime local) =>
    '${local.hour.toString().padLeft(2, '0')}:'
    '${local.minute.toString().padLeft(2, '0')}';
