import 'dart:io';

import 'package:flowpost_desktop/features/identity/data/auth_repository.dart';
import 'package:flowpost_desktop/features/identity/data/identity_models.dart';
import 'package:flowpost_desktop/features/identity/data/identity_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show AuthException;

class _MemoryVault implements SecretVault {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);

  @override
  Future<Map<String, String>> readAll() async => Map.of(values);
}

class _FakeAuth implements AuthGateway {
  Object? signInError;
  Object? exchangeError;
  Object? signOutError;
  AuthSession? restored;
  int signOuts = 0;
  int exchanges = 0;

  static const AuthSession session = AuthSession(
    accessToken: 'access',
    userId: 'user-1',
    email: 'admin@example.com',
  );

  @override
  Future<AuthSession> signInWithPassword({
    required String email,
    required String password,
  }) async {
    final error = signInError;
    if (error != null) throw error;
    return session;
  }

  @override
  Future<AuthSession> exchangeCode(String code) async {
    exchanges++;
    final error = exchangeError;
    if (error != null) throw error;
    return session;
  }

  @override
  Future<String> oauthSignInUrl({required String redirectTo}) async =>
      redirectTo;

  @override
  Future<AuthSession?> restoreSession() async => restored;

  @override
  Future<void> signOut() async {
    signOuts++;
    final error = signOutError;
    if (error != null) throw error;
  }
}

class _FakeUsers implements UsersGateway {
  AdminLookup lookup = AdminLookup.admin;

  @override
  Future<AdminLookup> lookupAdmin(String userId) async => lookup;
}

class _FakeFunctions implements FunctionsGateway {
  bool configured = true;
  bool sessionValid = true;
  Object? sessionError;
  Object? verifyError;
  int verifies = 0;

  @override
  Future<bool> questionsConfigured() async => configured;

  @override
  Future<bool> verifySession(String token) async {
    final error = sessionError;
    if (error != null) throw error;
    return sessionValid;
  }

  @override
  Future<AdminToken> verifyQuestions({
    required String favTeacher,
    required String bestNightDate,
  }) async {
    verifies++;
    final error = verifyError;
    if (error != null) throw error;
    return AdminToken(
      token: 'minted-token',
      issuedAt: DateTime.utc(2026, 10, 31),
    );
  }

  @override
  Future<void> setQuestions({
    required String favTeacher,
    required String bestNightDate,
  }) async {}
}

void main() {
  late _MemoryVault vault;
  late SecureIdentityStore store;
  late _FakeAuth auth;
  late _FakeUsers users;
  late _FakeFunctions functions;
  late AuthRepository repository;

  setUp(() {
    vault = _MemoryVault();
    store = SecureIdentityStore(vault: vault);
    auth = _FakeAuth();
    users = _FakeUsers();
    functions = _FakeFunctions();
    repository = AuthRepository(
      auth: auth,
      users: users,
      functions: functions,
      store: store,
    );
  });

  test('a wrong password is readable and not retried', () async {
    auth.signInError = const AuthException(
      'Invalid login credentials',
      statusCode: '400',
      code: 'invalid_credentials',
    );

    await expectLater(
      repository.signInWithPassword('admin@example.com', 'wrong'),
      throwsA(
        isA<IdentityException>()
            .having((e) => e.error, 'error', IdentityError.invalidCredentials)
            .having(
              (e) => e.message,
              'message',
              'Email or password is incorrect.',
            ),
      ),
    );
  });

  test('a rate limit says to wait', () async {
    auth.signInError = const AuthException(
      'Too many requests',
      statusCode: '429',
      code: 'over_request_rate_limit',
    );

    await expectLater(
      repository.signInWithPassword('admin@example.com', 'pw'),
      throwsA(
        isA<IdentityException>().having(
          (e) => e.error,
          'error',
          IdentityError.rateLimited,
        ),
      ),
    );
  });

  test('an unconfirmed account gets its own message', () async {
    auth.signInError = const AuthException(
      'Email not confirmed',
      code: 'email_not_confirmed',
    );

    await expectLater(
      repository.signInWithPassword('admin@example.com', 'pw'),
      throwsA(
        isA<IdentityException>().having(
          (e) => e.error,
          'error',
          IdentityError.emailNotConfirmed,
        ),
      ),
    );
  });

  test('a socket failure reads as offline', () async {
    auth.signInError = const SocketException('no route');

    await expectLater(
      repository.signInWithPassword('admin@example.com', 'pw'),
      throwsA(
        isA<IdentityException>().having(
          (e) => e.error,
          'error',
          IdentityError.offline,
        ),
      ),
    );
  });

  test('a failed code exchange reads as a Google failure', () async {
    auth.exchangeError = const AuthException(
      'bad code',
      statusCode: '400',
      code: 'flow_state_not_found',
    );

    await expectLater(
      repository.exchangeCode('code'),
      throwsA(
        isA<IdentityException>().having(
          (e) => e.error,
          'error',
          IdentityError.oauthExchangeFailed,
        ),
      ),
    );
  });

  test('an unknown Supabase user is signed out', () async {
    users.lookup = AdminLookup.missing;

    await expectLater(
      repository.stateFor(_FakeAuth.session),
      throwsA(
        isA<IdentityException>().having(
          (e) => e.error,
          'error',
          IdentityError.unknownUser,
        ),
      ),
    );
    expect(auth.signOuts, 1);
  });

  test('a non-admin user is signed out', () async {
    users.lookup = AdminLookup.notAdmin;

    await expectLater(
      repository.stateFor(_FakeAuth.session),
      throwsA(
        isA<IdentityException>()
            .having((e) => e.error, 'error', IdentityError.notAdmin)
            .having(
              (e) => e.message,
              'message',
              'This desktop build is for the administrator account.',
            ),
      ),
    );
    expect(auth.signOuts, 1);
  });

  test('no stored token asks the security questions', () async {
    final state = await repository.stateFor(_FakeAuth.session);

    expect(state, isA<AwaitingQuestions>());
    expect((state as AwaitingQuestions).questionsConfigured, isTrue);
  });

  test(
    'a valid stored token signs the admin in and caches the profile',
    () async {
      await store.writeAdminToken(
        AdminToken(token: 'token', issuedAt: DateTime.utc(2026)),
      );

      final state = await repository.stateFor(_FakeAuth.session);
      final profile = await store.readProfile();

      expect(state, isA<SignedIn>());
      expect((state as SignedIn).userId, 'user-1');
      expect(profile?.isAdmin, isTrue);
      expect(profile?.email, 'admin@example.com');
    },
  );

  test('an invalid token is removed and the questions return', () async {
    await store.writeAdminToken(
      AdminToken(token: 'token', issuedAt: DateTime.utc(2026)),
    );
    functions.sessionValid = false;

    final state = await repository.stateFor(_FakeAuth.session);

    expect(state, isA<AwaitingQuestions>());
    expect(await store.readAdminToken(), isNull);
  });

  test('an unreachable verify-session keeps the token', () async {
    await store.writeAdminToken(
      AdminToken(token: 'token', issuedAt: DateTime.utc(2026)),
    );
    functions.sessionError = const IdentityException(IdentityError.offline);

    await expectLater(
      repository.stateFor(_FakeAuth.session),
      throwsA(
        isA<IdentityException>().having(
          (e) => e.error,
          'error',
          IdentityError.offline,
        ),
      ),
    );
    expect((await store.readAdminToken())?.token, 'token');
  });

  test('a correct answer mints and stores the token', () async {
    final token = await repository.verifyQuestions(
      favTeacher: 'teacher',
      bestNightDate: 'date',
    );

    expect(token.token, 'minted-token');
    expect((await store.readAdminToken())?.token, 'minted-token');
  });

  test('a wrong answer keeps the server message', () async {
    functions.verifyError = const IdentityException(
      IdentityError.questionsIncorrect,
      serverMessage: 'Incorrect answers',
    );

    await expectLater(
      repository.verifyQuestions(favTeacher: 'a', bestNightDate: 'b'),
      throwsA(
        isA<IdentityException>().having(
          (e) => e.message,
          'message',
          'Incorrect answers',
        ),
      ),
    );
  });

  test('logout clears every record even when the network fails', () async {
    await store.writeSession('{"access_token":"abc"}');
    await store.writeAdminToken(
      AdminToken(token: 'token', issuedAt: DateTime.utc(2026)),
    );
    await store.writeProfile(
      const ProfileCache(userId: 'user-1', email: null, isAdmin: true),
    );
    auth.signOutError = const SocketException('offline');

    await expectLater(repository.signOut(), throwsA(isA<IdentityException>()));

    expect(await store.readSession(), isNull);
    expect(await store.readAdminToken(), isNull);
    expect(await store.readProfile(), isNull);
  });
}
