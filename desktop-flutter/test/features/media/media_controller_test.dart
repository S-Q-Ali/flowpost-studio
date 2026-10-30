import 'dart:async';
import 'dart:io';

import 'package:flowpost_desktop/features/media/data/media_file_picker.dart';
import 'package:flowpost_desktop/features/media/data/media_processor.dart';
import 'package:flowpost_desktop/features/media/data/media_workspace.dart';
import 'package:flowpost_desktop/features/media/domain/media_job.dart';
import 'package:flowpost_desktop/features/media/domain/media_processing.dart';
import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flowpost_desktop/features/media/media_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakePicker implements MediaFilePicker {
  _FakePicker(this.results);

  final List<File?> results;
  int calls = 0;

  @override
  Future<File?> pick() async {
    final index = calls < results.length ? calls : results.length - 1;
    calls++;
    return results[index];
  }
}

class _FakeWorkspace extends MediaWorkspace {
  _FakeWorkspace() : super(root: Directory('unused'));

  final List<String> created = [];
  final List<String> deleted = [];

  @override
  Future<Directory> createJob() async {
    created.add('job');
    return Directory('job-${created.length}');
  }

  @override
  Future<bool> deleteJob(Directory job) async {
    deleted.add(job.path);
    return true;
  }
}

/// A workspace whose folder cannot be created, as on a full disk.
class _FailingWorkspace extends MediaWorkspace {
  _FailingWorkspace() : super(root: Directory('unused'));

  @override
  Future<Directory> createJob() async {
    throw const FileSystemException('No space left on device.');
  }
}

/// A processor that never finishes on its own, so the test can drive it.
class _FakeProcessor implements MediaProcessor {
  final Completer<void> started = Completer();
  final Completer<MediaJob> completer = Completer();
  int cancelCalls = 0;

  @override
  Future<MediaJob> process(MediaJob job, {MediaProgressCallback? onProgress}) {
    onProgress?.call(
      const MediaProcessingProgress(
        stage: MediaStage.processing,
        fraction: 0.5,
        message: 'Normalizing...',
      ),
    );
    if (!started.isCompleted) started.complete();
    return completer.future;
  }

  @override
  void cancel() {
    cancelCalls++;
    if (!completer.isCompleted) completer.completeError(const MediaCancelled());
  }
}

Future<MediaValidation> _fakeValidator(FileSystemEntity file) async {
  final kind = mediaKindForPath(file.path);
  if (kind == null) {
    return const MediaValidation.invalid(
      MediaValidationError(
        reason: MediaRejection.unsupportedType,
        message: 'Unsupported file type.',
      ),
    );
  }
  return MediaValidation.valid(kind: kind, bytes: 2048);
}

ProviderContainer _container(
  MediaWorkspace workspace,
  MediaFilePicker picker,
  MediaProcessorFactory factory,
) {
  return ProviderContainer(
    overrides: [
      mediaPickerProvider.overrideWithValue(picker),
      mediaValidatorProvider.overrideWithValue(_fakeValidator),
      mediaWorkspaceProvider.overrideWith((ref) async => workspace),
      mediaProcessorFactoryProvider.overrideWithValue(factory),
    ],
  );
}

void main() {
  late _FakeWorkspace workspace;

  setUp(() {
    workspace = _FakeWorkspace();
  });

  test('picking a file creates a job folder', () async {
    final processor = _FakeProcessor();
    final container = _container(
      workspace,
      _FakePicker([File('C:\\clips\\first.mp4')]),
      (job) async => processor,
    );
    addTearDown(container.dispose);

    await container.read(mediaControllerProvider.notifier).pickFile();
    await processor.started.future;

    final state = container.read(mediaControllerProvider);
    expect(state, isA<MediaProcessing>());
    expect((state as MediaProcessing).job.displayName, 'first.mp4');
    expect(workspace.created, hasLength(1));
  });

  test('the pipeline reports progress while it runs', () async {
    final processor = _FakeProcessor();
    final container = _container(
      workspace,
      _FakePicker([File('C:\\clips\\first.mp4')]),
      (job) async => processor,
    );
    addTearDown(container.dispose);

    await container.read(mediaControllerProvider.notifier).pickFile();
    await processor.started.future;

    final state = container.read(mediaControllerProvider) as MediaProcessing;
    expect(state.fraction, 0.5);
    expect(state.message, 'Normalizing...');
  });

  test('a ready job exposes its outputs', () async {
    final processor = _FakeProcessor();
    final container = _container(
      workspace,
      _FakePicker([File('C:\\clips\\first.mp4')]),
      (job) async => processor,
    );
    addTearDown(container.dispose);

    await container.read(mediaControllerProvider.notifier).pickFile();
    await processor.started.future;
    processor.completer.complete(
      const MediaJob(
        id: 'job',
        sourcePath: r'C:\clips\first.mp4',
        displayName: 'first.mp4',
        kind: MediaKind.video,
        sourceBytes: 2048,
        workspacePath: 'job',
        stage: MediaStage.ready,
      ),
    );
    await _settle();

    expect(container.read(mediaControllerProvider), isA<MediaReady>());
  });

  test('picking a second file deletes the first job folder', () async {
    final processor = _FakeProcessor();
    final container = _container(
      workspace,
      _FakePicker([
        File('C:\\clips\\first.mp4'),
        File('C:\\clips\\second.mp4'),
      ]),
      (job) async => processor,
    );
    addTearDown(container.dispose);

    final controller = container.read(mediaControllerProvider.notifier);
    await controller.pickFile();
    await controller.pickFile();

    expect(workspace.deleted, isNotEmpty);
    final state = container.read(mediaControllerProvider) as MediaProcessing;
    expect(state.job.displayName, 'second.mp4');
  });

  test('a rejected file creates no job folder', () async {
    final processor = _FakeProcessor();
    final container = _container(
      workspace,
      _FakePicker([File('C:\\clips\\notes.txt')]),
      (job) async => processor,
    );
    addTearDown(container.dispose);

    await container.read(mediaControllerProvider.notifier).pickFile();

    expect(container.read(mediaControllerProvider), isA<MediaFailed>());
    expect(workspace.created, isEmpty);
  });

  test(
    'a failed pipeline shows a readable error and keeps the folder',
    () async {
      final processor = _FakeProcessor();
      final container = _container(
        workspace,
        _FakePicker([File('C:\\clips\\first.mp4')]),
        (job) async => processor,
      );
      addTearDown(container.dispose);

      await container.read(mediaControllerProvider.notifier).pickFile();
      await processor.started.future;
      processor.completer.completeError(
        const MediaProcessingException(
          "This file can't be read. It may be damaged.",
        ),
      );
      await _settle();

      final state = container.read(mediaControllerProvider);
      expect(state, isA<MediaFailed>());
      expect(workspace.deleted, isEmpty);
    },
  );

  test(
    'a workspace that cannot create a folder fails instead of hanging',
    () async {
      final container = _container(
        _FailingWorkspace(),
        _FakePicker([File('C:\\clips\\first.mp4')]),
        (job) async => _FakeProcessor(),
      );
      addTearDown(container.dispose);

      await container.read(mediaControllerProvider.notifier).pickFile();

      final state = container.read(mediaControllerProvider);
      expect(state, isA<MediaFailed>());
      expect((state as MediaFailed).message, contains('working folder'));
    },
  );

  test('cancelling stops the pipeline and removes the folder', () async {
    final processor = _FakeProcessor();
    final container = _container(
      workspace,
      _FakePicker([File('C:\\clips\\first.mp4')]),
      (job) async => processor,
    );
    addTearDown(container.dispose);

    final controller = container.read(mediaControllerProvider.notifier);
    await controller.pickFile();
    await processor.started.future;
    controller.cancel();
    await _settle();

    expect(processor.cancelCalls, 1);
    expect(container.read(mediaControllerProvider), isA<MediaIdle>());
    expect(workspace.deleted, isNotEmpty);
  });
}

/// Lets the controller's own async chain settle.
Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 20));
