import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;

import 'data/media_file_picker.dart';
import 'data/media_workspace.dart';
import 'domain/media_validation.dart';

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

sealed class MediaState {
  const MediaState();
}

class MediaIdle extends MediaState {
  const MediaIdle();
}

class MediaChecking extends MediaState {
  const MediaChecking();
}

class MediaPicked extends MediaState {
  const MediaPicked({
    required this.jobId,
    required this.sourcePath,
    required this.displayName,
    required this.kind,
    required this.bytes,
  });

  final String jobId;

  /// Absolute path of the source file. Never logged.
  final String sourcePath;

  final String displayName;
  final MediaKind kind;
  final int bytes;
}

class MediaFailed extends MediaState {
  const MediaFailed(this.message);

  final String message;
}

final mediaControllerProvider = NotifierProvider<MediaController, MediaState>(
  MediaController.new,
);

class MediaController extends Notifier<MediaState> {
  Directory? _job;

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
    // The workspace is created only once the file passes validation, so a
    // rejected file never leaves a folder behind.
    final workspace = await ref.read(mediaWorkspaceProvider.future);
    final job = await workspace.createJob();
    final previous = _job;
    _job = job;
    // A second pick replaces the first file, so its folder goes away too.
    if (previous != null) await workspace.deleteJob(previous);
    state = MediaPicked(
      jobId: p.basename(job.path),
      sourcePath: file.path,
      displayName: p.basename(file.path),
      kind: validation.kind!,
      bytes: validation.bytes!,
    );
  }

  /// Abandons the current file and removes its workspace.
  Future<void> chooseAnother() async {
    final job = _job;
    _job = null;
    if (job != null) {
      final workspace = await ref.read(mediaWorkspaceProvider.future);
      await workspace.deleteJob(job);
    }
    state = const MediaIdle();
  }
}
