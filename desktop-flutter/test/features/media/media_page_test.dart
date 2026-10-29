import 'dart:async';
import 'dart:io';

import 'package:flowpost_desktop/app.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/features/media/captions/captions_providers.dart';
import 'package:flowpost_desktop/features/media/captions/data/caption_generator.dart';
import 'package:flowpost_desktop/features/media/captions/data/captions_client.dart';
import 'package:flowpost_desktop/features/media/captions/domain/caption_processing.dart';
import 'package:flowpost_desktop/features/media/data/media_file_picker.dart';
import 'package:flowpost_desktop/features/media/data/media_processor.dart';
import 'package:flowpost_desktop/features/media/data/media_workspace.dart';
import 'package:flowpost_desktop/features/media/domain/media_job.dart';
import 'package:flowpost_desktop/features/media/domain/media_outputs.dart';
import 'package:flowpost_desktop/features/media/domain/media_probe.dart';
import 'package:flowpost_desktop/features/media/domain/media_processing.dart';
import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flowpost_desktop/features/media/media_providers.dart';
import 'package:flowpost_desktop/features/media/presentation/media_page.dart';
import 'package:flowpost_desktop/features/media/upload/data/upload_client.dart';
import 'package:flowpost_desktop/features/media/upload/upload_providers.dart';
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
  _FakeProcessor({this.error, this.normalized});

  final Object? error;

  /// The normalized file. It has to exist, because the upload counts its
  /// bytes.
  final File? normalized;

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
        normalized: normalized ?? File('normalized.mp4'),
        audio: File('audio.mp3'),
      ),
      stage: MediaStage.ready,
    );
  }

  @override
  void cancel() {}
}

/// A transport that answers from memory, without reading the disk.
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

  int cancelCalls = 0;

  @override
  Future<UploadReply> send({
    required Uri url,
    required MultipartBody body,
    String? token,
    UploadSentCallback? onSent,
  }) async {
    onSent?.call(body.fileLength);
    return reply;
  }

  @override
  void cancel() => cancelCalls++;
}

/// A transport that never answers, so the test can cancel the upload.
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

/// The generator is faked, so the caption service must never be reached.
class _UnusedApi implements CaptionsApi {
  @override
  Future<String> transcribe({
    required String audioBase64,
    required String filename,
  }) => throw StateError('The caption service must not be called.');

  @override
  Future<String> describeFrames({required List<String> frames}) =>
      throw StateError('The caption service must not be called.');

  @override
  Future<Map<String, String>> generateCaptions({
    required String systemPrompt,
    required String userMessage,
    List<String> platforms = const [],
  }) => throw StateError('The caption service must not be called.');

  @override
  void cancel() {}
}

/// A generator that answers from memory, without touching the disk.
class _FakeGenerator extends CaptionGenerator {
  _FakeGenerator() : super(api: _UnusedApi());

  Object? failure;
  CaptionResult result = const CaptionResult(
    captions: {'tiktok_caption': 'A caption'},
    transcript: 'the words',
    visualDescription: 'the picture',
  );

  @override
  Future<CaptionResult> generate({
    required MediaJob job,
    List<String> platforms = const [],
    CaptionProgressCallback? onProgress,
  }) async {
    onProgress?.call(
      const CaptionProgress(
        stage: CaptionStage.generatingCaptions,
        fraction: 0.8,
        message: 'Creating captions...',
      ),
    );
    if (failure != null) throw failure!;
    return result;
  }
}

/// A generator that never finishes, so the test can cancel the run.
class _PendingGenerator extends CaptionGenerator {
  _PendingGenerator() : super(api: _UnusedApi());

  @override
  Future<CaptionResult> generate({
    required MediaJob job,
    List<String> platforms = const [],
    CaptionProgressCallback? onProgress,
  }) {
    onProgress?.call(
      const CaptionProgress(
        stage: CaptionStage.transcribing,
        fraction: 0.2,
        message: 'Transcribing audio...',
      ),
    );
    return Completer<CaptionResult>().future;
  }
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
  late Directory temp;
  late File normalized;

  setUp(() {
    workspace = _FakeWorkspace();
    temp = Directory.systemTemp.createTempSync('flowpost-page');
    normalized = File('${temp.path}${Platform.pathSeparator}normalized.mp4')
      ..writeAsBytesSync(List<int>.generate(2048, (index) => index % 256));
  });

  tearDown(() => temp.deleteSync(recursive: true));

  Future<void> pumpUploadPage(
    WidgetTester tester,
    MediaFilePicker picker, {
    Size size = const Size(1280, 800),
    MediaProcessor? processor,
    String? sessionToken,
    CaptionGenerator? captionGenerator,
    UploadTransport? uploadTransport,
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
            (job) async => processor ?? _FakeProcessor(normalized: normalized),
          ),
          if (sessionToken != null)
            sessionTokenProvider.overrideWithValue(sessionToken),
          if (captionGenerator != null)
            captionGeneratorProvider.overrideWithValue(captionGenerator),
          if (uploadTransport != null)
            uploadClientProvider.overrideWithValue(
              UploadClient(
                endpoint: Uri.parse(
                  'https://test.supabase.co/functions/v1/upload-local-file',
                ),
                token: sessionToken,
                transport: uploadTransport,
              ),
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

  testWidgets('the caption action is off without a session token', (
    tester,
  ) async {
    await pumpUploadPage(tester, _FakePicker([File('C:\\clips\\clip.mp4')]));

    await tester.tap(find.text('Choose file'));
    await tester.pumpAndSettle();

    final generate = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Generate captions'),
    );
    expect(generate.onPressed, isNull);
    expect(find.textContaining('Sign in required'), findsOneWidget);
  });

  testWidgets('the caption action runs when a session token exists', (
    tester,
  ) async {
    await pumpUploadPage(
      tester,
      _FakePicker([File('C:\\clips\\clip.mp4')]),
      sessionToken: 'session-token',
      captionGenerator: _FakeGenerator(),
    );

    await tester.tap(find.text('Choose file'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Generate captions'));
    await tester.pumpAndSettle();

    expect(find.text('Captions'), findsOneWidget);
    expect(find.text('TikTok caption'), findsOneWidget);
    expect(find.text('A caption'), findsOneWidget);
    expect(find.textContaining('Sign in required'), findsNothing);
  });

  testWidgets('a failed caption run shows a readable error', (tester) async {
    await pumpUploadPage(
      tester,
      _FakePicker([File('C:\\clips\\clip.mp4')]),
      sessionToken: 'session-token',
      captionGenerator: _FakeGenerator()
        ..failure = const CaptionException('The caption service said no.'),
    );

    await tester.tap(find.text('Choose file'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Generate captions'));
    await tester.pumpAndSettle();

    expect(find.text('The caption service said no.'), findsOneWidget);
    expect(find.text('Captions'), findsNothing);
  });

  testWidgets('a caption can be edited', (tester) async {
    await pumpUploadPage(
      tester,
      _FakePicker([File('C:\\clips\\clip.mp4')]),
      sessionToken: 'session-token',
      captionGenerator: _FakeGenerator(),
    );

    await tester.tap(find.text('Choose file'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Generate captions'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextFormField).first, 'My own words');
    await tester.pump();

    final container = ProviderScope.containerOf(
      tester.element(find.byType(MediaPage)),
      listen: false,
    );
    final state = container.read(captionControllerProvider) as CaptionReady;
    expect(state.result.captions['tiktok_caption'], 'My own words');
  });

  testWidgets('the caption run can be cancelled', (tester) async {
    await pumpUploadPage(
      tester,
      _FakePicker([File('C:\\clips\\clip.mp4')]),
      sessionToken: 'session-token',
      captionGenerator: _PendingGenerator(),
    );

    await tester.tap(find.text('Choose file'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Generate captions'));
    await tester.pump();

    expect(find.text('Transcribing audio...'), findsOneWidget);

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    expect(find.text('Transcribing audio...'), findsNothing);
    expect(find.text('Captions'), findsNothing);
  });

  testWidgets('the upload action is off without a session token', (
    tester,
  ) async {
    await pumpUploadPage(tester, _FakePicker([File('C:\\clips\\clip.mp4')]));

    await tester.tap(find.text('Choose file'));
    await tester.pumpAndSettle();

    final upload = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Upload'),
    );
    expect(upload.onPressed, isNull);
    expect(find.textContaining('Sign in required'), findsOneWidget);
  });

  testWidgets('the upload runs when a session token exists', (tester) async {
    await pumpUploadPage(
      tester,
      _FakePicker([File('C:\\clips\\clip.mp4')]),
      sessionToken: 'session-token',
      uploadTransport: _FakeTransport(),
    );

    await tester.tap(find.text('Choose file'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Upload'));
    await tester.pumpAndSettle();

    expect(find.text('Uploaded — normalized.mp4 (2.0 KB)'), findsOneWidget);
    expect(find.textContaining('Sign in required'), findsNothing);
  });

  testWidgets('a failed upload shows a readable error', (tester) async {
    final transport = _FakeTransport()
      ..reply = const UploadReply(
        statusCode: 500,
        body: {'error': 'R2 upload failed: 500'},
      );
    await pumpUploadPage(
      tester,
      _FakePicker([File('C:\\clips\\clip.mp4')]),
      sessionToken: 'session-token',
      uploadTransport: transport,
    );

    await tester.tap(find.text('Choose file'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Upload'));
    await tester.pumpAndSettle();

    expect(find.text('R2 upload failed: 500'), findsOneWidget);
    expect(find.textContaining('Uploaded'), findsNothing);
  });

  testWidgets('the upload can be cancelled', (tester) async {
    final transport = _PendingTransport();
    await pumpUploadPage(
      tester,
      _FakePicker([File('C:\\clips\\clip.mp4')]),
      sessionToken: 'session-token',
      uploadTransport: transport,
    );

    await tester.tap(find.text('Choose file'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Upload'));
    await tester.pump();

    expect(find.text('Uploading...'), findsOneWidget);
    expect(find.text('100%'), findsOneWidget);

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    expect(transport.cancelCalls, 1);
    expect(find.text('The upload was cancelled.'), findsOneWidget);
    expect(find.text('Uploading...'), findsNothing);
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
