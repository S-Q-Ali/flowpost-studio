import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

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
