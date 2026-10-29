import 'dart:io';

import 'package:file_selector/file_selector.dart' show getDirectoryPath;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/diagnostics/diagnostics_collector.dart';
import '../../core/diagnostics/diagnostics_export.dart';
import '../../core/diagnostics/diagnostics_report.dart';
import '../../core/logging/app_logger.dart';
import '../../core/providers/app_providers.dart';
import '../../core/session/session.dart';
import '../../core/update/app_version.dart';
import '../../core/update/update_checker.dart';
import '../offline/offline_providers.dart';
import '../scheduling/scheduling_controller.dart';

/// How the update manifest is read, as a seam the tests can answer.
typedef UpdateFetcher = Future<UpdateResult> Function({
  required Uri manifestUrl,
  required String currentVersion,
});

final updateFetcherProvider = Provider<UpdateFetcher>((ref) => checkForUpdate);

/// The app's own logs folder, or null when it cannot be resolved.
final logsFolderProvider = FutureProvider<Directory?>((ref) async {
  try {
    return await logsDirectory();
  } on Object {
    return null;
  }
});

/// Reveals a folder in Explorer, as a seam the tests can answer.
final openFolderProvider = Provider<Future<bool> Function(Directory)>(
  (ref) => revealInExplorer,
);

Future<bool> revealInExplorer(Directory folder) async {
  try {
    // Explorer hands the window off and returns, so the exit code says
    // nothing; starting is the success.
    await Process.start('explorer.exe', [
      folder.path,
    ], mode: ProcessStartMode.detached);
    return true;
  } on Object {
    return false;
  }
}

/// What the Settings screen knows about the update check.
class UpdateCheckState {
  const UpdateCheckState({this.checking = false, this.result});

  final bool checking;

  /// The last answer, null until a check has run.
  final UpdateResult? result;
}

final updateCheckProvider =
    NotifierProvider<UpdateCheckController, UpdateCheckState>(
      UpdateCheckController.new,
    );

class UpdateCheckController extends Notifier<UpdateCheckState> {
  @override
  UpdateCheckState build() => const UpdateCheckState();

  Future<void> check() async {
    if (state.checking) return;
    final manifest = ref.read(appConfigProvider).updateManifestUrl;
    if (manifest.isEmpty) return;
    final version = await ref.read(appVersionProvider.future);
    if (!ref.mounted) return;
    if (version == null) {
      // Comparing against a made-up version would either hide a real update
      // or offer one that is not there.
      state = const UpdateCheckState(
        result: UpdateResult(
          currentVersion: '',
          error: 'The app version could not be read.',
        ),
      );
      return;
    }
    state = const UpdateCheckState(checking: true);
    final result = await ref.read(updateFetcherProvider)(
      manifestUrl: Uri.parse(manifest),
      currentVersion: version.version,
    );
    if (!ref.mounted) return;
    state = UpdateCheckState(result: result);
  }
}

final signOutProvider = Provider<SignOut>(SignOut.new);

/// The machine's facts for the evidence file, as Settings sees them.
final diagnosticsFactsProvider = FutureProvider<DiagnosticsFacts>((ref) async {
  final signedIn = ref.watch(sessionProvider) != null;
  final support = await getApplicationSupportDirectory();
  final logs = await ref.watch(logsFolderProvider.future);
  final version = await ref.watch(appVersionProvider.future);
  final draftsAvailable = await ref.watch(draftsRepositoryProvider).available();
  final now = DateTime.now();
  return gatherDiagnostics(
    support: support,
    logs: logs,
    version: version,
    signedIn: signedIn,
    draftsAvailable: draftsAvailable,
    now: now,
    osVersion: Platform.operatingSystemVersion,
    locale: Platform.localeName,
    zoneName: now.timeZoneName,
    utcOffset: now.timeZoneOffset,
  );
});

/// The folder the admin picks for the evidence file, or null when they
/// cancelled. A seam, so the tests answer without a dialog.
final exportFolderPickerProvider = Provider<Future<Directory?> Function()>(
  (ref) => pickExportFolder,
);

Future<Directory?> pickExportFolder() async {
  final path = await getDirectoryPath();
  return path == null ? null : Directory(path);
}

/// What one save attempt produced.
class DiagnosticsExportOutcome {
  const DiagnosticsExportOutcome.cancelled() : file = null, failed = false;

  const DiagnosticsExportOutcome.failed() : file = null, failed = true;

  const DiagnosticsExportOutcome.saved(File this.file) : failed = false;

  final File? file;
  final bool failed;
}

final diagnosticsExporterProvider =
    Provider<Future<DiagnosticsExportOutcome> Function()>((ref) {
      return () => runDiagnosticsExport(
        pick: () => ref.read(exportFolderPickerProvider)(),
        report: () async => buildDiagnosticsReport(
          await ref.read(diagnosticsFactsProvider.future),
        ),
      );
    });

/// One save attempt: ask for a folder, build the report, write it.
///
/// Both halves are passed in so the failure paths — a cancelled dialog, a
/// report that cannot be built, a folder that cannot be written — are the
/// same code the app runs.
Future<DiagnosticsExportOutcome> runDiagnosticsExport({
  required Future<Directory?> Function() pick,
  required Future<String> Function() report,
  DateTime Function() now = DateTime.now,
}) async {
  final folder = await pick();
  if (folder == null) return const DiagnosticsExportOutcome.cancelled();
  try {
    final text = await report();
    final file = await exportDiagnostics(
      folder: folder,
      report: text,
      at: now(),
    );
    return file == null
        ? const DiagnosticsExportOutcome.failed()
        : DiagnosticsExportOutcome.saved(file);
  } on Object {
    return const DiagnosticsExportOutcome.failed();
  }
}

class DiagnosticsExportState {
  const DiagnosticsExportState({
    this.saving = false,
    this.savedName,
    this.savedAt,
    this.failed = false,
  });

  final bool saving;
  final String? savedName;
  final DateTime? savedAt;
  final bool failed;
}

final diagnosticsExportProvider =
    NotifierProvider<DiagnosticsExportController, DiagnosticsExportState>(
      DiagnosticsExportController.new,
    );

class DiagnosticsExportController extends Notifier<DiagnosticsExportState> {
  @override
  DiagnosticsExportState build() => const DiagnosticsExportState();

  Future<void> save() async {
    if (state.saving) return;
    final previous = DiagnosticsExportState(
      savedName: state.savedName,
      savedAt: state.savedAt,
    );
    state = DiagnosticsExportState(
      saving: true,
      savedName: previous.savedName,
      savedAt: previous.savedAt,
    );
    final outcome = await ref.read(diagnosticsExporterProvider)();
    if (!ref.mounted) return;
    final file = outcome.file;
    if (file == null) {
      // A cancelled dialog is not a failure: the last save stands.
      state = outcome.failed
          ? DiagnosticsExportState(
              savedName: previous.savedName,
              savedAt: previous.savedAt,
              failed: true,
            )
          : previous;
      return;
    }
    state = DiagnosticsExportState(
      savedName: p.basename(file.path),
      savedAt: DateTime.now(),
    );
  }
}

/// Sets a drafts file that will not open aside and starts a fresh one.
final draftsSalvageProvider = Provider<Future<bool> Function()>((ref) {
  return () async {
    final done = await ref.read(draftsRepositoryProvider).startFresh();
    if (done) ref.invalidate(diagnosticsFactsProvider);
    return done;
  };
});

/// What a sign-out does, in the order that leaves nothing behind.
class SignOut {
  SignOut(this._ref);

  final Ref _ref;

  Future<void> run() async {
    _ref.read(sessionProvider.notifier).clear();
    // The rows on screen belong to the session that just ended.
    _ref.invalidate(queueControllerProvider);
    _ref.invalidate(calendarControllerProvider);
    try {
      await _ref.read(postsCacheProvider).wipe();
    } on Object {
      // The store logs its own failure; a cache that will not go does not
      // keep the admin signed in (SPEC-settings Decision 3).
    }
  }
}
