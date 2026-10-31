import 'package:supabase_flutter/supabase_flutter.dart' show AuthException;

import 'auth_errors.dart';
import 'identity_models.dart';
import 'identity_store.dart';

/// The Supabase Auth calls the app makes.
abstract interface class AuthGateway {
  Future<AuthSession> signInWithPassword({
    required String email,
    required String password,
  });
  Future<AuthSession> exchangeCode(String code);
  Future<AuthSession?> restoreSession();
  Future<void> signOut();
}

/// The `public.users` admin check.
abstract interface class UsersGateway {
  Future<AdminLookup> lookupAdmin(String userId);
}

/// The two backend functions the identity module calls.
abstract interface class FunctionsGateway {
  Future<bool> questionsConfigured();
  Future<AdminToken> verifyQuestions({
    required String favTeacher,
    required String bestNightDate,
  });
  Future<void> setQuestions({
    required String favTeacher,
    required String bestNightDate,
  });
  Future<bool> verifySession(String token);
}

/// Sign-in, the admin gate, the questions gate and logout.
///
/// Everything external is injected, so the tests never touch Supabase.
class AuthRepository {
  AuthRepository({
    required this.auth,
    required this.users,
    required this.functions,
    required this.store,
  });

  final AuthGateway auth;
  final UsersGateway users;
  final FunctionsGateway functions;
  final IdentityStore store;

  Future<AuthSession> signInWithPassword(String email, String password) =>
      _guard(() => auth.signInWithPassword(email: email, password: password));

  Future<AuthSession> exchangeCode(String code) async {
    try {
      return await auth.exchangeCode(code);
    } on IdentityException {
      rethrow;
    } on AuthException catch (error) {
      if (error.statusCode == null) {
        throw const IdentityException(IdentityError.offline);
      }
      throw const IdentityException(IdentityError.oauthExchangeFailed);
    } on Object catch (error) {
      throw mapGatewayFailure(error);
    }
  }

  Future<AuthSession?> restoreSession() =>
      _guard(() async => auth.restoreSession());

  /// The admin gate, then the stored admin token.
  ///
  /// A missing row or a non-admin row signs the user out before anything else
  /// is shown. An invalid token is dropped and the questions return.
  Future<AuthState> stateFor(AuthSession session) async {
    return _guard(() async {
      final lookup = await users.lookupAdmin(session.userId);
      if (lookup == AdminLookup.missing) {
        await _signOutAndClear();
        throw const IdentityException(IdentityError.unknownUser);
      }
      if (lookup == AdminLookup.notAdmin) {
        await _signOutAndClear();
        throw const IdentityException(IdentityError.notAdmin);
      }

      await store.writeProfile(
        ProfileCache(
          userId: session.userId,
          email: session.email,
          isAdmin: true,
        ),
      );

      final token = await store.readAdminToken();
      if (token == null) return _awaitingQuestions();
      if (await functions.verifySession(token.token)) {
        return SignedIn(userId: session.userId, isAdmin: true);
      }
      await store.deleteAdminToken();
      return _awaitingQuestions();
    });
  }

  /// The cached admin, for an offline start. Null when there is no proof of a
  /// passed gate on this PC.
  Future<SignedIn?> cachedAdmin() async {
    final profile = await store.readProfile();
    final token = await store.readAdminToken();
    if (profile == null || !profile.isAdmin || token == null) return null;
    return SignedIn(userId: profile.userId, isAdmin: true, offline: true);
  }

  Future<bool> questionsConfigured() => _guard(functions.questionsConfigured);

  Future<AdminToken> verifyQuestions({
    required String favTeacher,
    required String bestNightDate,
  }) async {
    final token = await _guard(
      () => functions.verifyQuestions(
        favTeacher: favTeacher,
        bestNightDate: bestNightDate,
      ),
    );
    await _guard(() => store.writeAdminToken(token));
    return token;
  }

  Future<void> setQuestions({
    required String favTeacher,
    required String bestNightDate,
  }) => _guard(
    () => functions.setQuestions(
      favTeacher: favTeacher,
      bestNightDate: bestNightDate,
    ),
  );

  /// Logs out everywhere and leaves no token on this PC, even offline.
  Future<void> signOut() => _signOutAndClear();

  Future<AuthState> _awaitingQuestions() async {
    final configured = await functions.questionsConfigured();
    return AwaitingQuestions(questionsConfigured: configured);
  }

  Future<void> _signOutAndClear() async {
    try {
      await auth.signOut();
    } on IdentityException {
      rethrow;
    } on Object catch (error) {
      throw mapGatewayFailure(error);
    } finally {
      await store.clear();
    }
  }

  Future<T> _guard<T>(Future<T> Function() run) async {
    try {
      return await run();
    } on IdentityException {
      rethrow;
    } on Object catch (error) {
      throw mapGatewayFailure(error);
    }
  }
}
