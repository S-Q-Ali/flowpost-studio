import 'dart:io';

import 'package:flowpost_desktop/features/media/data/media_file_picker.dart';
import 'package:flowpost_desktop/features/media/data/media_workspace.dart';
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

ProviderContainer _container(_FakeWorkspace workspace, MediaFilePicker picker) {
  return ProviderContainer(
    overrides: [
      mediaPickerProvider.overrideWithValue(picker),
      mediaValidatorProvider.overrideWithValue(_fakeValidator),
      mediaWorkspaceProvider.overrideWith((ref) async => workspace),
    ],
  );
}

void main() {
  late _FakeWorkspace workspace;

  setUp(() {
    workspace = _FakeWorkspace();
  });

  test('picking a file creates a job folder', () async {
    final container = _container(
      workspace,
      _FakePicker([File('C:\\clips\\first.mp4')]),
    );
    addTearDown(container.dispose);

    await container.read(mediaControllerProvider.notifier).pickFile();

    final state = container.read(mediaControllerProvider);
    expect(state, isA<MediaPicked>());
    expect((state as MediaPicked).displayName, 'first.mp4');
    expect(workspace.created, hasLength(1));
  });

  test('picking a second file deletes the first job folder', () async {
    final container = _container(
      workspace,
      _FakePicker([
        File('C:\\clips\\first.mp4'),
        File('C:\\clips\\second.mp4'),
      ]),
    );
    addTearDown(container.dispose);

    final controller = container.read(mediaControllerProvider.notifier);
    await controller.pickFile();
    await controller.pickFile();

    expect(workspace.deleted, isNotEmpty);
    final state = container.read(mediaControllerProvider);
    expect((state as MediaPicked).displayName, 'second.mp4');
  });

  test('a rejected file creates no job folder', () async {
    final container = _container(
      workspace,
      _FakePicker([File('C:\\clips\\notes.txt')]),
    );
    addTearDown(container.dispose);

    await container.read(mediaControllerProvider.notifier).pickFile();

    expect(container.read(mediaControllerProvider), isA<MediaFailed>());
    expect(workspace.created, isEmpty);
  });
}
