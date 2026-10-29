import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../domain/media_validation.dart';
import '../media_providers.dart';

class MediaPage extends ConsumerWidget {
  const MediaPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(mediaControllerProvider);
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: switch (state) {
            MediaIdle() => const _EmptyState(),
            MediaChecking() => const _CheckingState(),
            MediaFailed(message: final message) => _FailedState(
              message: message,
            ),
            MediaPicked(
              displayName: final displayName,
              kind: final kind,
              bytes: final bytes,
            ) =>
              _PickedState(displayName: displayName, kind: kind, bytes: bytes),
          },
        ),
      ),
    );
  }
}

class _EmptyState extends ConsumerWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Choose a video or image',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 8),
        const Text(
          'MP4, M4V, MOV, WEBM, MKV, JPG, PNG or WEBP. Up to 100 MB and 3 '
          'minutes.',
        ),
        const SizedBox(height: 24),
        FilledButton.icon(
          onPressed: () =>
              ref.read(mediaControllerProvider.notifier).pickFile(),
          icon: const Icon(Icons.folder_open),
          label: const Text('Choose file'),
        ),
      ],
    );
  }
}

class _CheckingState extends StatelessWidget {
  const _CheckingState();

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Checking the file...'),
        SizedBox(height: 16),
        SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ],
    );
  }
}

class _FailedState extends ConsumerWidget {
  const _FailedState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.error_outline, color: FlowPostColors.destructive),
            const SizedBox(width: 8),
            Expanded(child: Text(message)),
          ],
        ),
        const SizedBox(height: 24),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          children: [
            FilledButton.icon(
              onPressed: () =>
                  ref.read(mediaControllerProvider.notifier).pickFile(),
              icon: const Icon(Icons.refresh),
              label: const Text('Try again'),
            ),
            OutlinedButton.icon(
              onPressed: () =>
                  ref.read(mediaControllerProvider.notifier).chooseAnother(),
              icon: const Icon(Icons.folder_open),
              label: const Text('Choose another file'),
            ),
          ],
        ),
      ],
    );
  }
}

class _PickedState extends ConsumerWidget {
  const _PickedState({
    required this.displayName,
    required this.kind,
    required this.bytes,
  });

  final String displayName;
  final MediaKind kind;
  final int bytes;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(displayName, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        Row(
          children: [
            Text(kind == MediaKind.video ? 'Video' : 'Image'),
            const SizedBox(width: 8),
            Text(formatMediaBytes(bytes)),
          ],
        ),
        const SizedBox(height: 24),
        OutlinedButton.icon(
          onPressed: () =>
              ref.read(mediaControllerProvider.notifier).chooseAnother(),
          icon: const Icon(Icons.folder_open),
          label: const Text('Choose another file'),
        ),
      ],
    );
  }
}

String formatMediaBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}
