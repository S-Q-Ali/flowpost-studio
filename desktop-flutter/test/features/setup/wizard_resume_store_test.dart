import 'dart:convert';
import 'dart:io';

import 'package:flowpost_desktop/features/setup/data/wizard_resume_store.dart';
import 'package:flowpost_desktop/features/setup/domain/setup_steps.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory folder;
  late WizardResumeStore store;

  setUp(() async {
    folder = await Directory.systemTemp.createTemp('flowpost-wizard-');
    store = WizardResumeStore(folder: () async => folder);
  });

  tearDown(() async {
    if (await folder.exists()) await folder.delete(recursive: true);
  });

  File file() =>
      File('${folder.path}${Platform.pathSeparator}setup-wizard.json');

  test('no file is no place-mark', () async {
    expect(await store.read(), isNull);
  });

  test('a place-mark comes back on the next read', () async {
    const at = WizardResume(track: SetupTrack.operator, stepId: setupIdMedia);
    expect(await store.write(at), isTrue);
    final read = await store.read();
    expect(read?.track, SetupTrack.operator);
    expect(read?.stepId, setupIdMedia);
    expect(jsonDecode(await file().readAsString()), {
      'track': 'operator',
      'step': setupIdMedia,
    });
  });

  test('a step of the other track is no place-mark', () async {
    // The end user never walks the media step, so resuming there would open a
    // screen this track has no place for.
    await file().create(recursive: true);
    await file().writeAsString(
      jsonEncode({'track': 'endUser', 'step': setupIdMedia}),
    );
    expect(await store.read(), isNull);
  });

  test('a step that no longer exists is no place-mark', () async {
    await file().create(recursive: true);
    await file().writeAsString(
      jsonEncode({'track': 'operator', 'step': 'old-name'}),
    );
    expect(await store.read(), isNull);
  });

  test('a file that is not JSON is no place-mark', () async {
    await file().create(recursive: true);
    await file().writeAsString('{not json');
    expect(await store.read(), isNull);
  });

  test('a place-mark that cannot be written says so', () async {
    final blocked = File('${folder.path}${Platform.pathSeparator}blocked');
    await blocked.create();
    final stuck = WizardResumeStore(
      folder: () async => Directory(blocked.path),
    );
    expect(
      await stuck.write(
        const WizardResume(track: SetupTrack.endUser, stepId: setupIdServer),
      ),
      isFalse,
    );
  });
}
