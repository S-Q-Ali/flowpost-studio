import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../domain/setup_steps.dart';

/// Where the wizard was left, beside `credentials.json` and `preferences.json`.
const String wizardResumeFileName = 'setup-wizard.json';

/// The track picked and the step on the screen, so a restart does not start
/// the walk-through again from the top.
class WizardResume {
  const WizardResume({required this.track, required this.stepId});

  final SetupTrack track;
  final String stepId;
}

/// Reads and writes [WizardResume].
///
/// Written `.tmp` then renamed, the rule the rest of the app follows, so a
/// half write never replaces a good file. A resume this app cannot place —
/// another track's step, a step that no longer exists — is treated as none.
class WizardResumeStore {
  WizardResumeStore({Future<Directory> Function()? folder})
    : _folder = folder ?? getApplicationSupportDirectory;

  final Future<Directory> Function() _folder;

  Future<File> _file() async {
    final folder = await _folder();
    return File(p.join(folder.path, wizardResumeFileName));
  }

  Future<WizardResume?> read() async {
    try {
      final file = await _file();
      if (!await file.exists()) return null;
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is! Map) return null;
      final track = decoded['track'];
      final stepId = decoded['step'];
      if (track is! String || stepId is! String) return null;
      final named = SetupTrack.values.asNameMap()[track];
      if (named == null) return null;
      if (!setupStepsFor(named).any((step) => step.id == stepId)) return null;
      return WizardResume(track: named, stepId: stepId);
    } on Object {
      return null;
    }
  }

  /// Writes [resume]; false when the file could not be written. The wizard
  /// keeps working in this run either way.
  Future<bool> write(WizardResume resume) async {
    File? temporary;
    try {
      final file = await _file();
      await file.parent.create(recursive: true);
      temporary = File('${file.path}.tmp');
      await temporary.writeAsString(
        jsonEncode({'track': resume.track.name, 'step': resume.stepId}),
        flush: true,
      );
      await temporary.rename(file.path);
      temporary = null;
      return true;
    } on Object {
      try {
        if (temporary != null && await temporary.exists()) {
          await temporary.delete();
        }
      } on Object {
        // Nothing complete was left behind.
      }
      return false;
    }
  }
}
