import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session/session.dart';
import '../offline/offline_providers.dart';
import '../scheduling/scheduling_controller.dart';
import 'data/license_models.dart';
import 'license_providers.dart';

/// The one license state the router and the screens read.
final licenseControllerProvider =
    AsyncNotifierProvider<LicenseController, LicenseState>(
      LicenseController.new,
    );

class LicenseController extends AsyncNotifier<LicenseState> {
  @override
  Future<LicenseState> build() async {
    final next = await ref.watch(licenseServiceProvider).restore();
    await _syncSession(next);
    return next;
  }

  /// A refusal is the state the screen shows, not an exception.
  Future<void> activate(String key) async {
    state = const AsyncLoading();
    final next = await ref.read(licenseServiceProvider).activate(key);
    await _syncSession(next);
    state = AsyncData(next);
  }

  /// Forgets this PC: no token, no key, no session, no rows of the old grant.
  ///
  /// Returns false when the vault could not be cleared; the session and the
  /// cache still end, so a stale key never keeps the app open in this run.
  Future<bool> deactivate() async {
    var cleared = true;
    try {
      await ref.read(licenseServiceProvider).clear();
    } on LicenseException {
      cleared = false;
    }
    await _endSession();
    state = AsyncData(
      Locked(cleared ? LicenseError.missing : LicenseError.storageUnavailable),
    );
    return cleared;
  }

  /// Re-reads the vault; the retry path after a storage failure.
  Future<void> refresh() async {
    state = const AsyncLoading();
    final next = await ref.read(licenseServiceProvider).restore();
    await _syncSession(next);
    state = AsyncData(next);
  }

  /// An active grant opens the session every call is made with: the backend
  /// functions and `posts-api` both take the session token alone.
  Future<void> _syncSession(LicenseState next) async {
    if (next is Active) {
      final token = await ref.read(licenseServiceProvider).token();
      if (token != null && token.isNotEmpty) {
        ref
            .read(sessionProvider.notifier)
            .signIn(Session(sessionToken: token, offline: next.offline));
        return;
      }
    }
    ref.read(sessionProvider.notifier).clear();
  }

  /// Drops everything that belonged to the grant: the token, the rows on
  /// screen and the cache on disk. None of the failures may keep the user in.
  Future<void> _endSession() async {
    ref.read(sessionProvider.notifier).clear();
    ref.invalidate(queueControllerProvider);
    ref.invalidate(calendarControllerProvider);
    try {
      await ref.read(postsCacheProvider).wipe();
    } on Object {
      // The store logs its own failure (SPEC-settings Decision 3).
    }
  }
}
