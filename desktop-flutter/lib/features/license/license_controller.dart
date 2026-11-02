import 'dart:async';

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
  /// Counts down to the expiry of the session that is currently signed in.
  Timer? _recheck;

  /// The re-check that is running, so a storm of refused calls asks once.
  Future<void>? _revalidating;

  @override
  Future<LicenseState> build() async {
    ref.onDispose(() => _recheck?.cancel());
    final next = await ref.watch(licenseServiceProvider).restore();
    await _syncSession(next);
    _armRecheck(next);
    return next;
  }

  /// A refusal is the state the screen shows, not an exception.
  Future<void> activate(String key) async {
    state = const AsyncLoading();
    final next = await ref.read(licenseServiceProvider).activate(key);
    await _syncSession(next);
    _armRecheck(next);
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
    final next = Locked(
      cleared ? LicenseError.missing : LicenseError.storageUnavailable,
    );
    _armRecheck(next);
    state = AsyncData(next);
    return cleared;
  }

  /// Re-reads the vault; the retry path after a storage failure.
  Future<void> refresh() async {
    state = const AsyncLoading();
    final next = await ref.read(licenseServiceProvider).restore();
    await _syncSession(next);
    _armRecheck(next);
    state = AsyncData(next);
  }

  /// The session may no longer be good: the clock reached its expiry, or the
  /// backend refused the token.
  ///
  /// The token goes first, so nothing else can go out with a dead one. Then
  /// the stored key is tried — [refused] says the local clock cannot be
  /// trusted, because the server already said no to that grant. A key the
  /// backend will not take leaves the app locked, and the router sends the
  /// user back to /license with the reason.
  Future<void> revalidate({bool refused = false}) {
    final running = _revalidating;
    if (running != null) return running;
    final task = _revalidate(refused: refused);
    _revalidating = task;
    return task.whenComplete(() => _revalidating = null);
  }

  Future<void> _revalidate({required bool refused}) async {
    _cancelRecheck();
    _dropSession();
    final next = await ref.read(licenseServiceProvider).restore(renew: refused);
    await _syncSession(next);
    _armRecheck(next);
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

  /// The session dies at [Active.expiresAt]. Waiting for that moment is what
  /// brings the user back to /license with a reason, rather than leaving every
  /// later call to fail on a token the server no longer takes.
  void _armRecheck(LicenseState next) {
    _cancelRecheck();
    if (next is! Active) return;
    final delay = next.expiresAt.difference(
      ref.read(licenseServiceProvider).now(),
    );
    _recheck = Timer(
      delay.isNegative ? Duration.zero : delay,
      () => unawaited(revalidate()),
    );
  }

  void _cancelRecheck() {
    _recheck?.cancel();
    _recheck = null;
  }

  /// Drops the token and the rows read with it. Nothing may go out on a dead
  /// session, and no screen may keep showing work it can no longer reach.
  void _dropSession() {
    ref.read(sessionProvider.notifier).clear();
    ref.invalidate(queueControllerProvider);
    ref.invalidate(calendarControllerProvider);
  }

  /// Drops everything that belonged to the grant: the token, the rows on
  /// screen and the cache on disk. None of the failures may keep the user in.
  Future<void> _endSession() async {
    _dropSession();
    try {
      await ref.read(postsCacheProvider).wipe();
    } on Object {
      // The store logs its own failure (SPEC-settings Decision 3).
    }
  }
}
