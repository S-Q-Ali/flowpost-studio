import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session/session.dart';
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

  /// Forgets this PC: no token, no key, no session.
  Future<void> deactivate() async {
    await ref.read(licenseServiceProvider).clear();
    ref.read(sessionProvider.notifier).clear();
    state = const AsyncData(Locked(LicenseError.missing));
  }

  /// Re-reads the vault; the retry path after a storage failure.
  Future<void> refresh() async {
    state = const AsyncLoading();
    final next = await ref.read(licenseServiceProvider).restore();
    await _syncSession(next);
    state = AsyncData(next);
  }

  /// An active grant opens the session every call is made with. The Supabase
  /// Auth token is gone from the desktop, so it stays empty (L9 removes it).
  Future<void> _syncSession(LicenseState next) async {
    if (next is Active) {
      final token = await ref.read(licenseServiceProvider).token();
      if (token != null && token.isNotEmpty) {
        ref
            .read(sessionProvider.notifier)
            .signIn(
              Session(
                sessionToken: token,
                accessToken: '',
                offline: next.offline,
              ),
            );
        return;
      }
    }
    ref.read(sessionProvider.notifier).clear();
  }
}
