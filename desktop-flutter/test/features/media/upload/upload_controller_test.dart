import 'dart:async';
import 'dart:io';

import 'package:flowpost_desktop/features/media/data/media_file_picker.dart';
import 'package:flowpost_desktop/features/media/data/media_processor.dart';
import 'package:flowpost_desktop/features/media/data/media_workspace.dart';
import 'package:flowpost_desktop/features/media/domain/media_job.dart';
import 'package:flowpost_desktop/features/media/domain/media_outputs.dart';
import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flowpost_desktop/features/media/media_providers.dart';
import 'package:flowpost_desktop/features/media/upload/data/upload_client.dart';
import 'package:flowpost_desktop/features/media/upload/domain/upload_processing.dart';
import 'package:flowpost_desktop/features/media/upload/upload_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// A transport that answers from memory.
class _FakeTransport implements UploadTransport {
  UploadReply reply = const UploadReply(
    statusCode: 200,
    body: {
      'success': true,
      'videoId': 'video-1',
      'url': 'https://cdn.example.com/user/job-1.mp4',
      'filename': 'normalized.mp4',
      'size': 2048,
    },
  );

  /// Thrown instead of answering, when it is set.
  Object? failure;

  MultipartBody? body;
  int cancelCalls = 0;

  @override
  Future<UploadReply> send({
    required Uri url,
    required MultipartBody body,
    String? token,
    UploadSentCallback? onSent,
  }) async {
    this.body = body;
    if (failure != null) throw failure!;
    await for (final chunk in body.openRead(onProgress: onSent)) {
      chunk.length;
    }
    return reply;
  }

  @override
  void cancel() => cancelCalls++;
}

/// A transport that never answers, so the test can drive it.
class _PendingTransport implements UploadTransport {
  final Completer<UploadReply> completer = Completer();
  int cancelCalls = 0;

  @override
  Future<UploadReply> send({
    required Uri url,
    required MultipartBody body,
    String? token,
    UploadSentCallback? onSent,
  }) {
    onSent?.call(body.fileLength);
    return completer.future;
  }

  @override
  void cancel() => cancelCalls++;
}

/// A workspace that remembers what was deleted.
class _FakeWorkspace extends MediaWorkspace {
  _FakeWorkspace() : super(root: Directory('unused'));

  final List<String> deleted = [];

  /// Thrown instead of deleting, when it is set.
  Object? failure;

  int _created = 0;

  @override
  Future<Directory> createJob() async {
    _created++;
    return Directory('job-$_created');
  }

  @override
  Future<bool> deleteJob(Directory job) async {
    deleted.add(job.path);
    if (failure != null) throw failure!;
    return true;
  }
}

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

/// A processor that hands back a ready job right away.
class _FakeProcessor implements MediaProcessor {
  _FakeProcessor(this.result);

  final MediaJob result;

  @override
  Future<MediaJob> process(
    MediaJob job, {
    MediaProgressCallback? onProgress,
  }) async => result;

  @override
  void cancel() {}
}

Future<MediaValidation> _fakeValidator(FileSystemEntity file) async {
  return const MediaValidation.valid(kind: MediaKind.video, bytes: 2048);
}

ProviderContainer _container(
  UploadTransport transport, {
  MediaWorkspace? workspace,
  File? normalized,
}) {
  return ProviderContainer(
    overrides: [
      uploadClientProvider.overrideWithValue(
        UploadClient(
          endpoint: Uri.parse(
            'https://test.supabase.co/functions/v1/upload-local-file',
          ),
          token: 'session',
          transport: transport,
        ),
      ),
      if (workspace != null) ...[
        mediaPickerProvider.overrideWithValue(
          _FakePicker([
            File(r'C:\clips\first.mp4'),
            File(r'C:\clips\second.mp4'),
          ]),
        ),
        mediaValidatorProvider.overrideWithValue(_fakeValidator),
        mediaWorkspaceProvider.overrideWith((ref) async => workspace),
        mediaProcessorFactoryProvider.overrideWithValue(
          (job) async => _FakeProcessor(
            job.copyWith(
              outputs: MediaOutputs(
                thumbnail: File('thumb.jpg'),
                frames: [File('frame.jpg')],
                normalized: normalized,
              ),
              stage: MediaStage.ready,
            ),
          ),
        ),
      ],
    ],
  );
}

/// Drives the media controller until the job is ready to upload.
Future<void> _readyMedia(ProviderContainer container) async {
  await container.read(mediaControllerProvider.notifier).pickFile();
  await _settle();
  expect(container.read(mediaControllerProvider), isA<MediaReady>());
}

/// Lets the controller's own async chain settle.
Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 20));

void main() {
  late Directory temp;
  late File normalized;
  late File source;

  setUp(() {
    temp = Directory.systemTemp.createTempSync('flowpost-upload');
    normalized = File('${temp.path}${Platform.pathSeparator}normalized.mp4')
      ..writeAsBytesSync(List<int>.generate(2048, (index) => index % 256));
    source = File('${temp.path}${Platform.pathSeparator}photo.png')
      ..writeAsBytesSync(List<int>.generate(1024, (index) => index % 256));
  });

  tearDown(() => temp.deleteSync(recursive: true));

  MediaJob videoJob() => MediaJob(
    id: 'job-1',
    sourcePath: r'C:\clips\first.mp4',
    displayName: 'first.mp4',
    kind: MediaKind.video,
    sourceBytes: 2048,
    workspacePath: 'job',
    outputs: MediaOutputs(
      normalized: normalized,
      thumbnail: File('thumb.jpg'),
      frames: [File('frame.jpg')],
    ),
    stage: MediaStage.ready,
  );

  MediaJob imageJob() => MediaJob(
    id: 'job-2',
    sourcePath: source.path,
    displayName: 'photo.png',
    kind: MediaKind.image,
    sourceBytes: 1024,
    workspacePath: 'job',
    outputs: MediaOutputs(
      thumbnail: File('thumb.jpg'),
      frames: [File('frame.jpg')],
    ),
    stage: MediaStage.ready,
  );

  test('a finished upload shows the stored file', () async {
    final container = _container(_FakeTransport());
    addTearDown(container.dispose);

    await container.read(uploadControllerProvider.notifier).upload(videoJob());

    final state = container.read(uploadControllerProvider);
    expect(state, isA<UploadDone>());
    expect((state as UploadDone).result.videoId, 'video-1');
    expect(state.result.filename, 'normalized.mp4');
  });

  test('a video goes up as the normalized file', () async {
    final transport = _FakeTransport();
    final container = _container(transport);
    addTearDown(container.dispose);

    await container.read(uploadControllerProvider.notifier).upload(videoJob());

    expect(transport.body!.fileName, 'first.mp4');
    expect(transport.body!.contentType, 'video/mp4');
    expect(transport.body!.file.path, normalized.path);
  });

  test('a video that was renamed goes up with the mp4 extension', () async {
    final transport = _FakeTransport();
    final container = _container(transport);
    addTearDown(container.dispose);
    final job = MediaJob(
      id: 'job-1',
      sourcePath: r'C:\clips\first.mp4',
      displayName: 'holiday.mov',
      kind: MediaKind.video,
      sourceBytes: 2048,
      workspacePath: 'job',
      outputs: MediaOutputs(
        normalized: normalized,
        thumbnail: File('thumb.jpg'),
        frames: [File('frame.jpg')],
      ),
      stage: MediaStage.ready,
    );

    await container.read(uploadControllerProvider.notifier).upload(job);

    // The name of the picked file is kept, but the file that goes up is
    // an mp4, so the extension has to say so.
    expect(transport.body!.fileName, 'holiday.mp4');
  });

  test('an image goes up as the source file', () async {
    final transport = _FakeTransport();
    final container = _container(transport);
    addTearDown(container.dispose);

    await container.read(uploadControllerProvider.notifier).upload(imageJob());

    expect(transport.body!.fileName, 'photo.png');
    expect(transport.body!.contentType, 'image/png');
    expect(transport.body!.file.path, source.path);
  });

  test('the job id is the idempotency key', () async {
    final transport = _FakeTransport();
    final container = _container(transport);
    addTearDown(container.dispose);

    await container.read(uploadControllerProvider.notifier).upload(videoJob());

    expect(transport.body!.idempotencyKey, 'job-1');
  });

  test('the progress is reported while the upload lasts', () async {
    final container = _container(_FakeTransport());
    addTearDown(container.dispose);
    final states = <UploadState>[];
    container.listen(uploadControllerProvider, (_, next) => states.add(next));

    await container.read(uploadControllerProvider.notifier).upload(videoJob());

    final running = states.whereType<UploadRunning>().toList();
    expect(running, isNotEmpty);
    expect(running.last.progress.fraction, 1.0);
    expect(running.last.progress.message, 'Uploading...');
  });

  test('a failure shows the message of the service', () async {
    final transport = _FakeTransport()
      ..reply = const UploadReply(
        statusCode: 500,
        body: {'error': 'R2 upload failed: 500'},
      );
    final container = _container(transport);
    addTearDown(container.dispose);

    await container.read(uploadControllerProvider.notifier).upload(videoJob());

    final state = container.read(uploadControllerProvider);
    expect(state, isA<UploadFailed>());
    expect((state as UploadFailed).message, 'R2 upload failed: 500');
  });

  test('an unexpected failure does not show the raw error', () async {
    final transport = _FakeTransport()
      ..failure = StateError(r'C:\Users\Someone\private\clip.mp4');
    final container = _container(transport);
    addTearDown(container.dispose);

    await container.read(uploadControllerProvider.notifier).upload(videoJob());

    final state = container.read(uploadControllerProvider);
    expect(state, isA<UploadFailed>());
    expect((state as UploadFailed).message, isNot(contains('private')));
  });

  test('a job without outputs is refused before anything is sent', () async {
    final transport = _FakeTransport();
    final container = _container(transport);
    addTearDown(container.dispose);

    await container
        .read(uploadControllerProvider.notifier)
        .upload(
          const MediaJob(
            id: 'job-3',
            sourcePath: r'C:\clips\first.mp4',
            displayName: 'first.mp4',
            kind: MediaKind.video,
            sourceBytes: 2048,
            workspacePath: 'job',
          ),
        );

    final state = container.read(uploadControllerProvider);
    expect(state, isA<UploadFailed>());
    expect((state as UploadFailed).message, contains('not ready'));
    expect(transport.body, isNull);
  });

  test('a cancelled upload stops the request and shows no error', () async {
    final transport = _PendingTransport();
    final container = _container(transport);
    addTearDown(container.dispose);
    final controller = container.read(uploadControllerProvider.notifier);

    final run = controller.upload(videoJob());
    controller.cancel();
    // The aborted request fails after the cancel.
    transport.completer.completeError(
      const UploadException('The request was aborted.'),
    );
    await run;

    expect(transport.cancelCalls, 1);
    expect(container.read(uploadControllerProvider), isA<UploadCancelled>());
  });

  test('a failed upload keeps the folder so it can be retried', () async {
    final transport = _FakeTransport()
      ..reply = const UploadReply(statusCode: 500, body: {'error': 'no'});
    final workspace = _FakeWorkspace();
    final container = _container(
      transport,
      workspace: workspace,
      normalized: normalized,
    );
    addTearDown(container.dispose);
    await _readyMedia(container);

    await container.read(uploadControllerProvider.notifier).upload(videoJob());

    expect(workspace.deleted, isEmpty);
  });

  test('a finished upload removes the folder', () async {
    final workspace = _FakeWorkspace();
    final container = _container(
      _FakeTransport(),
      workspace: workspace,
      normalized: normalized,
    );
    addTearDown(container.dispose);
    await _readyMedia(container);

    await container.read(uploadControllerProvider.notifier).upload(videoJob());

    expect(workspace.deleted, isNotEmpty);
    expect(container.read(mediaControllerProvider), isA<MediaIdle>());
  });

  test('a cleanup failure does not hide the finished upload', () async {
    final workspace = _FakeWorkspace()
      ..failure = const FileSystemException('The folder is locked.');
    final container = _container(
      _FakeTransport(),
      workspace: workspace,
      normalized: normalized,
    );
    addTearDown(container.dispose);
    await _readyMedia(container);

    await container.read(uploadControllerProvider.notifier).upload(videoJob());

    expect(container.read(uploadControllerProvider), isA<UploadDone>());
  });

  test('an upload that lands late does not touch the next file', () async {
    final transport = _PendingTransport();
    final workspace = _FakeWorkspace();
    final container = _container(
      transport,
      workspace: workspace,
      normalized: normalized,
    );
    addTearDown(container.dispose);
    await _readyMedia(container);

    final controller = container.read(uploadControllerProvider.notifier);
    final run = controller.upload(videoJob());

    // The user moves on to another file while the upload is on its way.
    await container.read(mediaControllerProvider.notifier).chooseAnother();
    await container.read(mediaControllerProvider.notifier).pickFile();
    await _settle();

    // The old upload answers after the new file was picked.
    transport.completer.complete(_okReply);
    await run;

    expect(container.read(mediaControllerProvider), isA<MediaReady>());
    expect(workspace.deleted, isNot(contains('job-2')));
  });
}

/// The answer a successful upload gets.
const _okReply = UploadReply(
  statusCode: 200,
  body: {
    'success': true,
    'videoId': 'video-1',
    'url': 'https://cdn.example.com/user/job-1.mp4',
    'filename': 'normalized.mp4',
    'size': 2048,
  },
);
