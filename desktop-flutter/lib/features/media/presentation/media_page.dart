import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;

import '../../../core/providers/app_providers.dart';
import '../../../core/theme/app_theme.dart';
import '../captions/captions_providers.dart';
import '../captions/domain/caption_prompt.dart';
import '../domain/media_job.dart';
import '../domain/media_validation.dart';
import '../media_providers.dart';
import '../upload/upload_providers.dart';

class MediaPage extends ConsumerWidget {
  const MediaPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(mediaControllerProvider);
    final upload = ref.watch(uploadControllerProvider);
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              switch (state) {
                MediaIdle() => const _EmptyState(),
                MediaChecking() => const _CheckingState(),
                MediaFailed(message: final message) => _FailedState(
                  message: message,
                ),
                MediaProcessing(
                  job: final job,
                  fraction: final fraction,
                  message: final message,
                ) =>
                  _ProcessingState(
                    job: job,
                    fraction: fraction,
                    message: message,
                  ),
                MediaReady(job: final job) => _ReadyState(job: job),
              },
              ..._uploadSection(context, ref, upload),
            ],
          ),
        ),
      ),
    );
  }
}

/// The upload progress, the stored file, or the failure.
///
/// It sits outside the media states, because the file is gone once the
/// upload is done.
List<Widget> _uploadSection(
  BuildContext context,
  WidgetRef ref,
  UploadState state,
) {
  switch (state) {
    case UploadIdle():
      return const [];
    case UploadRunning(progress: final progress):
      return [
        const SizedBox(height: 16),
        LinearProgressIndicator(value: progress.fraction),
        const SizedBox(height: 8),
        Text(progress.message),
        Text('${(progress.fraction * 100).round()}%'),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () => ref.read(uploadControllerProvider.notifier).cancel(),
          icon: const Icon(Icons.stop_circle_outlined),
          label: const Text('Cancel'),
        ),
      ];
    case UploadDone(result: final result):
      return [
        const SizedBox(height: 16),
        Text(
          'Uploaded — ${result.filename} '
          '(${formatMediaBytes(result.size)})',
        ),
      ];
    case UploadFailed(message: final message):
      return [
        const SizedBox(height: 16),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.error_outline, color: FlowPostColors.destructive),
            const SizedBox(width: 8),
            Expanded(child: Text(message)),
          ],
        ),
      ];
    case UploadCancelled():
      return [
        const SizedBox(height: 16),
        const Text('The upload was cancelled.'),
      ];
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

class _ProcessingState extends ConsumerWidget {
  const _ProcessingState({
    required this.job,
    required this.fraction,
    this.message,
  });

  final MediaJob job;
  final double fraction;
  final String? message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(job.displayName, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        Row(
          children: [
            Text(job.kind == MediaKind.video ? 'Video' : 'Image'),
            const SizedBox(width: 8),
            Text(formatMediaBytes(job.sourceBytes)),
          ],
        ),
        const SizedBox(height: 24),
        LinearProgressIndicator(value: fraction),
        const SizedBox(height: 8),
        Text(message ?? 'Processing...'),
        Text('${(fraction * 100).round()}%'),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: () => ref.read(mediaControllerProvider.notifier).cancel(),
          icon: const Icon(Icons.stop_circle_outlined),
          label: const Text('Cancel'),
        ),
      ],
    );
  }
}

class _ReadyState extends ConsumerWidget {
  const _ReadyState({required this.job});

  final MediaJob job;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final probe = job.probe;
    final outputs = job.outputs;
    final captionState = ref.watch(captionControllerProvider);
    final uploadState = ref.watch(uploadControllerProvider);
    final canGenerate = ref.watch(sessionTokenProvider) != null;
    final canUpload =
        canGenerate &&
        uploadState is! UploadRunning &&
        uploadState is! UploadDone;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(job.displayName, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        Row(
          children: [
            Text(job.kind == MediaKind.video ? 'Video' : 'Image'),
            const SizedBox(width: 8),
            Text(formatMediaBytes(job.sourceBytes)),
          ],
        ),
        const SizedBox(height: 16),
        if (outputs != null) ...[
          _Thumbnail(file: outputs.thumbnail),
          const SizedBox(height: 16),
        ],
        if (probe != null) ...[
          _SummaryRow(
            label: 'Dimensions',
            value: '${probe.width} x ${probe.height}',
          ),
          if (job.kind == MediaKind.video)
            _SummaryRow(
              label: 'Duration',
              value: formatMediaDuration(probe.duration),
            ),
          _SummaryRow(label: 'Video codec', value: probe.videoCodec),
          if (probe.hasAudio)
            _SummaryRow(label: 'Audio codec', value: probe.audioCodec!),
        ],
        if (outputs != null) ...[
          const SizedBox(height: 16),
          Text('Outputs', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          if (outputs.normalized != null)
            const _OutputRow(name: 'normalized.mp4', label: 'Normalized video'),
          const _OutputRow(name: 'thumb.jpg', label: 'Thumbnail'),
          for (final frame in outputs.frames)
            _OutputRow(name: p.basename(frame.path), label: 'Caption frame'),
          if (outputs.audio != null)
            const _OutputRow(name: 'audio.mp3', label: 'Transcription audio'),
        ],
        const SizedBox(height: 24),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          children: [
            FilledButton.icon(
              onPressed: canGenerate
                  ? () => ref
                        .read(captionControllerProvider.notifier)
                        .generate(job)
                  : null,
              icon: const Icon(Icons.auto_awesome),
              label: const Text('Generate captions'),
            ),
            FilledButton.icon(
              onPressed: canUpload
                  ? () =>
                        ref.read(uploadControllerProvider.notifier).upload(job)
                  : null,
              icon: const Icon(Icons.cloud_upload),
              label: const Text('Upload'),
            ),
            OutlinedButton.icon(
              onPressed: () =>
                  ref.read(mediaControllerProvider.notifier).chooseAnother(),
              icon: const Icon(Icons.folder_open),
              label: const Text('Choose another file'),
            ),
          ],
        ),
        if (!canGenerate) ...[
          const SizedBox(height: 8),
          const Text('Sign in required to generate captions or upload.'),
        ],
        const SizedBox(height: 16),
        ..._captionSection(context, ref, captionState),
      ],
    );
  }
}

/// The caption progress, the captions themselves, or the failure.
List<Widget> _captionSection(
  BuildContext context,
  WidgetRef ref,
  CaptionState state,
) {
  switch (state) {
    case CaptionIdle():
      return const [];
    case CaptionRunning(progress: final progress):
      return [
        LinearProgressIndicator(value: progress.fraction),
        const SizedBox(height: 8),
        Text(progress.message),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () =>
              ref.read(captionControllerProvider.notifier).cancel(),
          icon: const Icon(Icons.stop_circle_outlined),
          label: const Text('Cancel'),
        ),
      ];
    case CaptionReady(result: final result):
      return [
        Text('Captions', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        for (final entry in result.captions.entries)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _CaptionField(
              label: captionKeyLabels[entry.key] ?? entry.key,
              captionKey: entry.key,
              value: entry.value,
            ),
          ),
      ];
    case CaptionFailed(message: final message):
      return [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.error_outline, color: FlowPostColors.destructive),
            const SizedBox(width: 8),
            Expanded(child: Text(message)),
          ],
        ),
      ];
  }
}

/// One caption, editable before it is published.
class _CaptionField extends ConsumerWidget {
  const _CaptionField({
    required this.label,
    required this.captionKey,
    required this.value,
  });

  final String label;
  final String captionKey;
  final String value;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return TextFormField(
      initialValue: value,
      maxLines: null,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      onChanged: (text) =>
          ref.read(captionControllerProvider.notifier).edit(captionKey, text),
    );
  }
}

/// The generated thumbnail, with a placeholder until the file is there.
class _Thumbnail extends StatelessWidget {
  const _Thumbnail({required this.file});

  final File file;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<bool>(
      future: file.exists(),
      builder: (context, snapshot) {
        final exists = snapshot.data ?? false;
        if (!exists) {
          return Container(
            width: 320,
            height: 180,
            alignment: Alignment.center,
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            child: const Text('No preview'),
          );
        }
        return ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.file(
            file,
            width: 320,
            height: 180,
            fit: BoxFit.cover,
            errorBuilder: (context, error, stack) => Container(
              width: 320,
              height: 180,
              alignment: Alignment.center,
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              child: const Text('No preview'),
            ),
          ),
        );
      },
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text('$label: $value'),
    );
  }
}

class _OutputRow extends StatelessWidget {
  const _OutputRow({required this.name, required this.label});

  final String name;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text('$label — $name'),
    );
  }
}

String formatMediaBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}

String formatMediaDuration(Duration value) {
  final total = value.inSeconds;
  final minutes = total ~/ 60;
  final seconds = total % 60;
  return '$minutes:${seconds.toString().padLeft(2, '0')}';
}
