import 'dart:io';

import 'package:flowpost_desktop/app.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/features/media/data/media_file_picker.dart';
import 'package:flowpost_desktop/features/media/data/media_workspace.dart';
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
