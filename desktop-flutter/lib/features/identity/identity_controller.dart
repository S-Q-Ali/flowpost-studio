import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session/session.dart';
import '../offline/connectivity.dart';
import 'data/identity_models.dart';
import 'identity_providers.dart';

/// The one sign-in state the router and the screens read.
final identityControllerProvider =
    AsyncNotifierProvider<IdentityController, AuthState>(
      IdentityController.new,
    );

class IdentityController extends AsyncNotifier<AuthState> {
  IdentityService? _service;
  AuthSession? _authSession;

  @override
  Future<AuthState> build() async {
    final service = await ref.watch(identityServiceProvider.future);
    _service = service;
    // The app learns about reconnects from its own calls, so a session that
    // started offline is revalidated on the first successful one
    // (SPEC-identity 6).
    ref.listen<ConnectionStatus>(connectivityProvider, (previous, next) {
      if (previous == ConnectionStatus.offline &&
          next == ConnectionStatus.online) {
        unawaited(_revalidate());
      }
    });
    final next = await _resolveStart(service);
    await _syncSession(service, next);
    return next;
  }

  Future<void> signInWithPassword(String email, String password) async {
    final service = await _ensure();
    final session = await service.repository.signInWithPassword(
      email,
      password,
    );
    _authSession = session;
    await _apply(service, await service.repository.stateFor(session));
  }

  /// Persists the pending OAuth state and returns the URL for the browser.
  Future<String> startGoogleSignIn() async {
    final service = await _ensure();
    return service.oauth.begin();
  }

  Future<void> completeGoogleSignIn(String link) async {
    final service = await _ensure();
    final session = await service.oauth.accept(link);
    _authSession = session;
    await _apply(service, await service.repository.stateFor(session));
  }

  /// Drops the pending state when the user stops waiting for the browser.
  Future<void> cancelGoogleSignIn() async {
    final service = await _ensure();
    await service.store.deletePendingOAuth();
  }

  Future<void> verifyQuestions({
    required String favTeacher,
    required String bestNightDate,
  }) async {
    final service = await _ensure();
    await service.repository.verifyQuestions(
      favTeacher: favTeacher,
      bestNightDate: bestNightDate,
    );
    await _apply(service, await _signedIn(service));
  }

  /// Setting the questions and proving them are one step; the setup call does
  /// not mint a token (SPEC-identity 4).
  Future<void> setQuestions({
    required String favTeacher,
    required String bestNightDate,
  }) async {
    final service = await _ensure();
    await service.repository.setQuestions(
      favTeacher: favTeacher,
      bestNightDate: bestNightDate,
    );
    await verifyQuestions(favTeacher: favTeacher, bestNightDate: bestNightDate);
  }

  /// Logs out everywhere. A dead network must not keep anyone signed in on
  /// this PC: the local records are cleared before the error surfaces.
  Future<void> signOut() async {
    final service = await _ensure();
    try {
      await service.repository.signOut();
    } on IdentityException catch (error) {
      if (error.error != IdentityError.offline) rethrow;
    } finally {
      _authSession = null;
      await _apply(service, const SignedOut());
    }
  }

  /// Rebuilds the sign-in state from what is stored; the retry path.
  Future<void> refresh() async {
    final service = await _ensure();
    await _apply(service, await _resolveStart(service));
  }

  Future<IdentityService> _ensure() async {
    final current = _service;
    if (current != null) return current;
    final started = await ref.read(identityServiceProvider.future);
    _service = started;
    return started;
  }

  Future<AuthState> _resolveStart(IdentityService service) async {
    try {
      final session = await service.repository.restoreSession();
      if (session == null) {
        _authSession = null;
        return const SignedOut();
      }
      _authSession = session;
      return await service.repository.stateFor(session);
    } on IdentityException catch (error) {
      if (error.error == IdentityError.offline) {
        final cached = await service.repository.cachedAdmin();
        if (cached != null) return cached;
      }
      return SignedOut(error.message);
    }
  }

  Future<AuthState> _signedIn(IdentityService service) async {
    final profile = await service.store.readProfile();
    if (profile == null) {
      throw const IdentityException(IdentityError.unexpected);
    }
    return SignedIn(userId: profile.userId, isAdmin: profile.isAdmin);
  }

  Future<void> _apply(IdentityService service, AuthState next) async {
    await _syncSession(service, next);
    state = AsyncData(next);
  }

  /// The signed-in tokens are the admin session token and the Supabase JWT;
  /// every other state leaves both null.
  Future<void> _syncSession(IdentityService service, AuthState next) async {
    Session? session;
    if (next is SignedIn) {
      final token = await service.store.readAdminToken();
      final auth = _authSession;
      if (auth != null && token != null) {
        session = Session(
          sessionToken: token.token,
          accessToken: auth.accessToken,
        );
      }
    }
    if (session != null) {
      ref.read(sessionProvider.notifier).signIn(session);
    } else {
      ref.read(sessionProvider.notifier).clear();
    }
  }

  Future<void> _revalidate() async {
    final current = state.value;
    if (current is! SignedIn || !current.offline) return;
    try {
      await refresh();
    } on Object {
      // The stored offline session stays usable; the next call tries again.
    }
  }
}
