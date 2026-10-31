import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';
import 'package:path/path.dart' as p;

import 'captions/captions_providers.dart';
import 'data/ffmpeg_paths.dart';
import 'data/ffmpeg_runner.dart';
import 'data/media_file_picker.dart';
import 'data/media_processor.dart';
import 'data/media_workspace.dart';
import 'domain/media_job.dart';
import 'domain/media_processing.dart';
import 'domain/media_validation.dart';
import 'upload/upload_providers.dart';

final mediaPickerProvider = Provider<MediaFilePicker>(
  (ref) => const FileSelectorMediaPicker(),
);

typedef MediaValidator = Future<MediaValidation> Function(
  FileSystemEntity file,
);

final mediaValidatorProvider = Provider<MediaValidator>(
  (ref) => validateMediaFile,
);

final mediaWorkspaceProvider = FutureProvider<MediaWorkspace>((ref) async {
  return MediaWorkspace.forApplication();
});

/// The bundled FFmpeg, or null when it is not installed.
final mediaFfmpegPathsProvider = FutureProvider<FfmpegPaths?>((ref) {
  return FfmpegPaths.locate();
});

/// Builds the processor for one job. Tests replace this seam so no FFmpeg
/// process is started.
final mediaProcessorFactoryProvider = Provider<MediaProcessorFactory>((ref) {
  return (job) async {
    final paths = await ref.read(mediaFfmpegPathsProvider.future);
    if (paths == null) {
      throw const MediaProcessingException(
        'FFmpeg is missing. Reinstall the app to process media.',
      );
    }
    return FfmpegMediaProcessor(
      executor: FfmpegRunner(
        ffmpegPath: paths.ffmpeg,
        ffprobePath: paths.ffprobe,
      ),
      paths: paths,
    );
  };
});

sealed class MediaState {
  const MediaState();
}

class MediaIdle extends MediaState {
  const MediaIdle();
}

class MediaChecking extends MediaState {
  const MediaChecking();
}

class MediaProcessing extends MediaState {
  const MediaProcessing({
    required this.job,
    required this.fraction,
    this.message,
  });

  final MediaJob job;

  /// How far along the pipeline is, from 0 to 1.
  final double fraction;

  final String? message;
}

class MediaReady extends MediaState {
  const MediaReady(this.job);

  final MediaJob job;
}

class MediaFailed extends MediaState {
  const MediaFailed(this.message);

  final String message;
}

final mediaControllerProvider = NotifierProvider<MediaController, MediaState>(
  MediaController.new,
);

class MediaController extends Notifier<MediaState> {
  static final Logger _log = Logger('media');

  /// The file the screen is on.
  ///
  /// A run whose job is not this one belongs to a file the user already
  /// replaced, so it writes no state and deletes nothing.
  MediaJob? _current;
  MediaProcessor? _processor;

  @override
  MediaState build() => const MediaIdle();

  Future<void> pickFile() async {
    state = const MediaChecking();
    final file = await ref.read(mediaPickerProvider).pick();
    if (file == null) {
      state = const MediaIdle();
      return;
    }
    final validation = await ref.read(mediaValidatorProvider)(file);
    if (!validation.isValid) {
      state = MediaFailed(validation.error!.message);
      return;
    }
    // The captions belong to the previous file, so they go away with it.
    ref.read(captionControllerProvider.notifier).reset();
    ref.read(uploadControllerProvider.notifier).reset();
    // The workspace is created only once the file passes validation, so a
    // rejected file never leaves a folder behind.
    final MediaWorkspace workspace;
    final Directory job;
    try {
      workspace = await ref.read(mediaWorkspaceProvider.future);
      job = await workspace.createJob();
    } on Object catch (error) {
      // The screen must not be left on a spinner with no way out.
      state = const MediaFailed(
        'Could not create a working folder. Check free space and try again.',
      );
      // Only the error type is logged: a message can carry a path.
      _log.warning(
        'Could not create the media workspace (${error.runtimeType}).',
      );
      return;
    }
    final mediaJob = MediaJob(
      id: p.basename(job.path),
      sourcePath: file.path,
      displayName: p.basename(file.path),
      kind: validation.kind!,
      sourceBytes: validation.bytes!,
      workspacePath: job.path,
    );
    final previous = _current;
    _current = mediaJob;
    // A second pick replaces the first file: its encode stops, and its folder
    // goes away with it.
    _processor?.cancel();
    if (previous != null) {
      await workspace.deleteJob(Directory(previous.workspacePath));
    }

    state = MediaProcessing(job: mediaJob, fraction: 0);
    // The pipeline runs on in the background: the pick returns as soon as the
    // job starts, not when the encode is done.
    unawaited(_process(mediaJob));
  }

  Future<void> _process(MediaJob job) async {
    // Only the job id is logged: a path would leak the user's folders.
    _log.info('Media job ${job.id} started.');
    try {
      final processor = await ref.read(mediaProcessorFactoryProvider)(job);
      if (_current?.id != job.id) return;
      _processor = processor;
      final result = await processor.process(
        job,
        onProgress: (progress) {
          if (_current?.id != job.id) return;
          state = MediaProcessing(
            job: job,
            fraction: progress.fraction,
            message: progress.message,
          );
        },
      );
      if (_current?.id != job.id) return;
      state = MediaReady(result);
      _log.info('Media job ${job.id} ready.');
    } on MediaCancelled {
      // A cancelled job leaves nothing behind. The pick of another file has
      // already taken the screen and deleted the folder, so a run that is no
      // longer the current one writes nothing at all.
      if (_current?.id != job.id) return;
      await _deleteJob(job);
      state = const MediaIdle();
      _log.info('Media job ${job.id} cancelled.');
    } on MediaProcessingException catch (error) {
      if (_current?.id != job.id) return;
      // The folder stays so the action can be retried.
      state = MediaFailed(error.message);
      _log.warning('Media job ${job.id} failed: ${error.message}');
    } catch (error, stackTrace) {
      if (_current?.id != job.id) return;
      state = const MediaFailed(
        'Something went wrong while processing the file.',
      );
      // The type and the stack trace are logged, never the message: a
      // message can carry the path of the user's file.
      _log.severe(
        'Media job ${job.id} failed unexpectedly (${error.runtimeType}).',
        null,
        stackTrace,
      );
    } finally {
      if (_current?.id == job.id) _processor = null;
    }
  }

  /// Stops the running FFmpeg process.
  void cancel() {
    _processor?.cancel();
  }

  /// Finishes a job: the file is uploaded or the upload was cancelled, so
  /// the temporary files go away and the screen is empty again.
  ///
  /// A job that is no longer the current one is left alone: the user has
  /// already moved on to another file.
  Future<void> completeJob(String jobId) async {
    final job = _current;
    if (job == null || job.id != jobId) return;
    await _deleteJob(job);
    state = const MediaIdle();
  }

  /// Abandons the current file and removes its workspace.
  Future<void> chooseAnother() async {
    _processor?.cancel();
    ref.read(captionControllerProvider.notifier).reset();
    ref.read(uploadControllerProvider.notifier).reset();
    final job = _current;
    if (job != null) await _deleteJob(job);
    state = const MediaIdle();
  }

  Future<void> _deleteJob(MediaJob job) async {
    if (_current?.id != job.id) return;
    _current = null;
    final workspace = await ref.read(mediaWorkspaceProvider.future);
    await workspace.deleteJob(Directory(job.workspacePath));
  }
}
