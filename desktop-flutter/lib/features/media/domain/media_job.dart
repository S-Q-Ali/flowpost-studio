import 'media_outputs.dart';
import 'media_probe.dart';
import 'media_validation.dart';

/// Where a job sits in the pipeline (SPEC-media "Model").
enum MediaStage {
  picked,
  probing,
  ready,
  processing,
  readyToUpload,
  uploading,
  done,
  failed,
  cancelled,
}

/// One picked file and everything the pipeline derives from it.
class MediaJob {
  const MediaJob({
    required this.id,
    required this.sourcePath,
    required this.displayName,
    required this.kind,
    required this.sourceBytes,
    required this.workspacePath,
    this.probe,
    this.outputs,
    this.stage = MediaStage.picked,
  });

  final String id;

  /// Absolute path of the source file. Never logged.
  final String sourcePath;

  final String displayName;
  final MediaKind kind;
  final int sourceBytes;

  /// The per-job folder the outputs are written to.
  final String workspacePath;

  final MediaProbe? probe;
  final MediaOutputs? outputs;
  final MediaStage stage;

  MediaJob copyWith({
    MediaProbe? probe,
    MediaOutputs? outputs,
    MediaStage? stage,
  }) {
    return MediaJob(
      id: id,
      sourcePath: sourcePath,
      displayName: displayName,
      kind: kind,
      sourceBytes: sourceBytes,
      workspacePath: workspacePath,
      probe: probe ?? this.probe,
      outputs: outputs ?? this.outputs,
      stage: stage ?? this.stage,
    );
  }
}
