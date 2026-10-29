import 'dart:async';
import 'dart:io';

import 'package:flowpost_desktop/app.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/features/media/data/media_file_picker.dart';
import 'package:flowpost_desktop/features/media/data/media_processor.dart';
import 'package:flowpost_desktop/features/media/data/media_workspace.dart';
import 'package:flowpost_desktop/features/media/domain/media_job.dart';
import 'package:flowpost_desktop/features/media/domain/media_outputs.dart';
import 'package:flowpost_desktop/features/media/domain/media_probe.dart';
import 'package:flowpost_desktop/features/media/domain/media_processing.dart';
import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flowpost_desktop/features/media/media_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

const _config = AppConfig(
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-anon',
  updateManifestUrl: '',
);

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

/// Stands in for the on-disk workspace: widget tests run in a fake-async
/// zone where real file I/O never completes.
class _FakeWorkspace extends MediaWorkspace {
  _FakeWorkspace() : super(root: Directory('unused'));

  final List<String> deleted = [];

  @override
  Future<Directory> createJob() async => Directory('fake-job');

  @override
  Future<bool> deleteJob(Directory job) async {
    deleted.add(job.path);
    return true;
  }
}

class _FakeProcessor implements MediaProcessor {
  _FakeProcessor({this.error});

  final Object? error;

  @override
  Future<MediaJob> process(
    MediaJob job, {
    MediaProgressCallback? onProgress,
  }) async {
    onProgress?.call(
      const MediaProcessingProgress(
        stage: MediaStage.processing,
        fraction: 0.5,
        message: 'Normalizing...',
      ),
    );
    if (error != null) throw error!;
    return job.copyWith(
      probe: const MediaProbe(
        duration: Duration(seconds: 2),
        width: 1080,
        height: 1920,
        videoCodec: 'h264',
        pixelFormat: 'yuv420p',
        fps: 30,
        audioCodec: 'aac',
      ),
      outputs: MediaOutputs(
        thumbnail: File('thumb.jpg'),
        frames: [File('frame_1.jpg'), File('frame_2.jpg'), File('frame_3.jpg')],
        normalized: File('normalized.mp4'),
        audio: File('audio.mp3'),
      ),
      stage: MediaStage.ready,
    );
  }

  @override
  void cancel() {}
}

/// A processor that stays on the processing step until the test ends.
class _PendingProcessor implements MediaProcessor {
  final Completer<MediaJob> completer = Completer();

  @override
  Future<MediaJob> process(MediaJob job, {MediaProgressCallback? onProgress}) {
    onProgress?.call(
      const MediaProcessingProgress(
        stage: MediaStage.processing,
        fraction: 0.4,
        message: 'Normalizing...',
      ),
    );
    return completer.future;
  }

  @override
  void cancel() {}
}

Future<MediaValidation> _fakeValidator(FileSystemEntity file) async {
  final kind = mediaKindForPath(file.path);
  if (kind == null) {
    return const MediaValidation.invalid(
      MediaValidationError(
        reason: MediaRejection.unsupportedType,
        message:
            'Unsupported file type. Use MP4, M4V, MOV, WEBM, MKV, JPG, PNG '
            'or WEBP.',
      ),
    );
  }
  return MediaValidation.valid(kind: kind, bytes: 2048);
}

void main() {
  late _FakeWorkspace workspace;

  setUp(() {
    workspace = _FakeWorkspace();
  });

  Future<void> pumpUploadPage(
    WidgetTester tester,
    MediaFilePicker picker, {
    Size size = const Size(1280, 800),
    MediaProcessor? processor,
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appConfigProvider.overrideWithValue(_config),
          mediaPickerProvider.overrideWithValue(picker),
          mediaValidatorProvider.overrideWithValue(_fakeValidator),
          mediaWorkspaceProvider.overrideWith((ref) async => workspace),
          mediaProcessorFactoryProvider.overrideWithValue(
            (job) async => processor ?? _FakeProcessor(),
          ),
        ],
        child: const FlowPostApp(initialDeepLink: '/upload'),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('shows the empty state with the supported formats and limits', (
    tester,
  ) async {
    await pumpUploadPage(tester, _FakePicker([null]));

    expect(find.text('Choose a video or image'), findsOneWidget);
    expect(find.textContaining('MP4'), findsOneWidget);
    expect(find.textContaining('100 MB'), findsOneWidget);
    expect(find.text('Choose file'), findsOneWidget);
  });

  testWidgets('picking a supported file shows its name, kind and size', (
    tester,
  ) async {
    await pumpUploadPage(tester, _FakePicker([File('C:\\clips\\clip.mp4')]));

    await tester.tap(find.text('Choose file'));
    await tester.pumpAndSettle();

    expect(find.text('clip.mp4'), findsOneWidget);
    expect(find.text('Video'), findsOneWidget);
    expect(find.text('2.0 KB'), findsOneWidget);
    expect(find.text('Choose another file'), findsOneWidget);
  });

  testWidgets('picking an unsupported file shows a readable error', (
    tester,
  ) async {
    await pumpUploadPage(tester, _FakePicker([File('C:\\clips\\notes.txt')]));

    await tester.tap(find.text('Choose file'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Unsupported file type'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('a cancelled picker keeps the empty state', (tester) async {
    await pumpUploadPage(tester, _FakePicker([null]));

    await tester.tap(find.text('Choose file'));
    await tester.pumpAndSettle();

    expect(find.text('Choose a video or image'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('choosing another file clears the picked file', (tester) async {
    await pumpUploadPage(tester, _FakePicker([File('C:\\clips\\clip.mp4')]));
    await tester.tap(find.text('Choose file'));
    await tester.pumpAndSettle();
    expect(find.text('clip.mp4'), findsOneWidget);

    await tester.tap(find.text('Choose another file'));
    await tester.pumpAndSettle();

    expect(find.text('clip.mp4'), findsNothing);
    expect(find.text('Choose a video or image'), findsOneWidget);
    expect(workspace.deleted, isNotEmpty);
  });

  testWidgets('the processing step shows progress and a cancel button', (
    tester,
  ) async {
    await pumpUploadPage(
      tester,
      _FakePicker([File('C:\\clips\\clip.mp4')]),
      processor: _PendingProcessor(),
    );

    await tester.tap(find.text('Choose file'));
    await tester.pump();
    await tester.pump();

    expect(find.text('clip.mp4'), findsOneWidget);
    expect(find.text('Normalizing...'), findsOneWidget);
    expect(find.text('40%'), findsOneWidget);
    expect(find.text('Cancel'), findsOneWidget);
    expect(
      tester
          .widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator))
          .value,
      0.4,
    );
  });

  testWidgets('the ready step shows the metadata and disabled actions', (
    tester,
  ) async {
    await pumpUploadPage(tester, _FakePicker([File('C:\\clips\\clip.mp4')]));

    await tester.tap(find.text('Choose file'));
    await tester.pumpAndSettle();

    expect(find.text('Dimensions: 1080 x 1920'), findsOneWidget);
    expect(find.text('Duration: 0:02'), findsOneWidget);
    expect(find.text('Video codec: h264'), findsOneWidget);
    expect(find.text('Audio codec: aac'), findsOneWidget);
    expect(find.text('Generate captions'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Upload'), findsOneWidget);
    expect(find.textContaining('Sign in required'), findsOneWidget);
    expect(find.text('Normalized video — normalized.mp4'), findsOneWidget);
    expect(find.text('Transcription audio — audio.mp3'), findsOneWidget);

    final upload = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Upload'),
    );
    expect(upload.onPressed, isNull);
  });

  testWidgets('a failed pipeline shows a readable error', (tester) async {
    await pumpUploadPage(
      tester,
      _FakePicker([File('C:\\clips\\clip.mp4')]),
      processor: _FakeProcessor(
        error: const MediaProcessingException(
          "This file can't be read. It may be damaged.",
        ),
      ),
    );

    await tester.tap(find.text('Choose file'));
    await tester.pumpAndSettle();

    expect(find.textContaining("can't be read"), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
    expect(find.text('Choose another file'), findsOneWidget);
  });

  testWidgets('grows with large text at the minimum window size', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 1.6;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    await pumpUploadPage(
      tester,
      _FakePicker([null]),
      size: const Size(1024, 640),
    );

    expect(tester.takeException(), isNull);
    expect(find.text('Choose a video or image'), findsOneWidget);
  });
}
