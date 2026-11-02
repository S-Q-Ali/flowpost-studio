import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';
import 'package:path/path.dart' as p;

import '../../../core/logging/app_logger.dart';
import '../../../core/providers/app_providers.dart';
import '../domain/media_job.dart';
import '../domain/media_validation.dart';
import '../media_providers.dart';
import 'data/upload_client.dart';
import 'domain/upload_processing.dart';

final uploadClientProvider = Provider<UploadClient>((ref) {
  final config = ref.watch(appConfigProvider);
  return UploadClient(
    endpoint: Uri.parse('${config.supabaseUrl}/functions/v1/upload-local-file'),
    token: ref.watch(sessionTokenProvider),
  );
});

sealed class UploadState {
  const UploadState();
}

class UploadIdle extends UploadState {
  const UploadIdle();
}

class UploadRunning extends UploadState {
  const UploadRunning(this.progress);

  final UploadProgress progress;
}

class UploadDone extends UploadState {
  const UploadDone(this.result);

  final UploadResult result;
}

class UploadFailed extends UploadState {
  const UploadFailed(this.message);

  final String message;
}

class UploadCancelled extends UploadState {
  const UploadCancelled();
}

final uploadControllerProvider =
    NotifierProvider<UploadController, UploadState>(UploadController.new);

class UploadController extends Notifier<UploadState> {
  static final Logger _log = Logger('upload');

  /// The run that owns the state. A newer run or a cancel takes over, and
  /// the run that lost it writes nothing.
  int _run = 0;

  /// The job the run in flight belongs to.
  String? _jobId;

  @override
  UploadState build() => const UploadIdle();

  /// Uploads the finished job.
  ///
  /// The job id is the idempotency key, so a retry after an ambiguous
  /// failure lands on the same object instead of a second one.
  Future<void> upload(MediaJob job) async {
    final run = ++_run;
    _jobId = job.id;
    final outputs = job.outputs;
    if (outputs == null) {
      state = const UploadFailed('The media is not ready yet.');
      return;
    }
    // A video goes up normalized, an image as it is.
    final normalized = outputs.normalized;
    final file = normalized ?? File(job.sourcePath);
    state = const UploadRunning(
      UploadProgress(
        stage: UploadStage.preparing,
        fraction: 0,
        message: 'Preparing the upload...',
      ),
    );
    try {
      // A video's type is settled by the pipeline; an image is read from its
      // own bytes before the request leaves.
      final contentType = job.kind == MediaKind.video
          ? 'video/mp4'
          : _imageContentType(await _headerOf(file), job.displayName);
      if (run != _run) return;
      final result = await ref
          .read(uploadClientProvider)
          .upload(
            file: file,
            fileName: _fileName(job),
            contentType: contentType,
            idempotencyKey: job.id,
            onProgress: (fraction) {
              if (run != _run) return;
              state = UploadRunning(
                UploadProgress(
                  stage: UploadStage.uploading,
                  fraction: fraction,
                  message: 'Uploading...',
                ),
              );
            },
          );
      if (run != _run) return;
      state = UploadDone(result);
      // Only the id of the stored video is logged: the URL and the key
      // would point at the user's file.
      _log.info('Upload of job ${job.id} finished.');
      // The temporary files are not needed any more.
      await _removeJobFiles(job.id);
    } on UploadException catch (error) {
      if (run != _run) return;
      // The service sentence can carry the media link or a path, so it is
      // cleaned before it reaches the screen and the log.
      final message = cleanFailureText(error.message);
      state = UploadFailed(message);
      _log.warning('The upload of job ${job.id} failed: $message');
    } on Object catch (error, stackTrace) {
      if (run != _run) return;
      state = const UploadFailed('Something went wrong while uploading.');
      // The type and the stack trace are logged, never the message: a
      // message can carry the path of the user's file.
      _log.severe(
        'The upload of job ${job.id} failed unexpectedly '
        '(${error.runtimeType}).',
        null,
        stackTrace,
      );
    }
  }

  /// Stops the upload in flight and removes the temporary files.
  void cancel() {
    _run++;
    state = const UploadCancelled();
    ref.read(uploadClientProvider).cancel();
    final jobId = _jobId;
    if (jobId != null) unawaited(_removeJobFiles(jobId));
  }

  /// Forgets the result and stops the upload in flight.
  ///
  /// The file the upload belongs to is gone, so a request that is still on
  /// its way must not land on the next job.
  void reset() {
    final running = state is UploadRunning;
    _run++;
    state = const UploadIdle();
    if (running) ref.read(uploadClientProvider).cancel();
  }

  /// Removes the temporary files of the finished job.
  ///
  /// A cleanup that fails must not turn a finished upload into an error,
  /// so the failure is only logged. The folder goes away at the next start.
  Future<void> _removeJobFiles(String jobId) async {
    try {
      await ref.read(mediaControllerProvider.notifier).completeJob(jobId);
    } on Object catch (error, stackTrace) {
      _log.warning(
        'The job folder could not be removed (${error.runtimeType}).',
        null,
        stackTrace,
      );
    }
  }
}

/// The name the service stores the file under.
///
/// The name of the picked file is kept, so the library shows something the
/// user recognizes, but a video that went up normalized carries the
/// extension of the normalized file.
String _fileName(MediaJob job) {
  if (job.outputs?.normalized == null) return job.displayName;
  return '${p.basenameWithoutExtension(job.displayName)}.mp4';
}

/// The first bytes of the file: enough for every signature below.
Future<List<int>> _headerOf(File file) async {
  final bytes = <int>[];
  await for (final chunk in file.openRead(0, 12)) {
    bytes.addAll(chunk);
    if (bytes.length >= 12) break;
  }
  return bytes;
}

/// The image type the bytes say the file is.
///
/// The service stores this type and hands it to the platform when the post is
/// made, and the extension is only what the file manager shows: a png named
/// .jpg would be stored as a jpeg. Bytes that match none of the three keep
/// the extension's answer, which is what the picker allowed through.
String _imageContentType(List<int> header, String name) {
  if (_matches(header, [0xff, 0xd8, 0xff], 0)) return 'image/jpeg';
  if (_matches(header, [0x89, 0x50, 0x4e, 0x47], 0)) return 'image/png';
  if (_matches(header, [0x52, 0x49, 0x46, 0x46], 0) &&
      _matches(header, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return switch (p.extension(name).toLowerCase()) {
    '.png' => 'image/png',
    '.webp' => 'image/webp',
    _ => 'image/jpeg',
  };
}

bool _matches(List<int> bytes, List<int> signature, int at) {
  if (bytes.length < at + signature.length) return false;
  for (var i = 0; i < signature.length; i++) {
    if (bytes[at + i] != signature[i]) return false;
  }
  return true;
}
