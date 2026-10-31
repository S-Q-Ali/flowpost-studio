import 'dart:math';

import 'package:flowpost_desktop/features/identity/data/auth_repository.dart';
import 'package:flowpost_desktop/features/identity/data/identity_models.dart';
import 'package:flowpost_desktop/features/identity/data/identity_store.dart';
import 'package:flowpost_desktop/features/identity/data/oauth_flow.dart';
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
  Object? exchangeError;
  String? redirectTo;
  int exchanges = 0;
  Future<void> Function()? onExchange;

  static const AuthSession session = AuthSession(
    accessToken: 'access',
    userId: 'user-1',
    email: 'admin@example.com',
  );

  @override
  Future<String> oauthSignInUrl({required String redirectTo}) async {
    this.redirectTo = redirectTo;
    return 'https://project.supabase.co/auth/v1/authorize?provider=google';
  }

  @override
  Future<AuthSession> signInWithPassword({
    required String email,
    required String password,
  }) async => session;

  @override
  Future<AuthSession> exchangeCode(String code) async {
    exchanges++;
    await onExchange?.call();
    final error = exchangeError;
    if (error != null) throw error;
    return session;
  }

  @override
  Future<AuthSession?> restoreSession() async => null;

  @override
  Future<void> signOut() async {}
}

class _FakeUsers implements UsersGateway {
  @override
  Future<AdminLookup> lookupAdmin(String userId) async => AdminLookup.admin;
}

class _FakeFunctions implements FunctionsGateway {
  @override
  Future<bool> questionsConfigured() async => true;

  @override
  Future<bool> verifySession(String token) async => true;

  @override
  Future<AdminToken> verifyQuestions({
    required String favTeacher,
    required String bestNightDate,
  }) async => AdminToken(token: 'token', issuedAt: DateTime.utc(2026, 10, 31));

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
  late AuthRepository repository;
  late DateTime now;
  late OAuthFlow flow;

  setUp(() {
    vault = _MemoryVault();
    store = SecureIdentityStore(vault: vault);
    auth = _FakeAuth();
    repository = AuthRepository(
      auth: auth,
      users: _FakeUsers(),
      functions: _FakeFunctions(),
      store: store,
    );
    now = DateTime.utc(2026, 10, 31, 12);
    flow = OAuthFlow(
      auth: auth,
      repository: repository,
      store: store,
      now: () => now,
      random: Random(7),
    );
  });

  String stateFromLaunch() =>
      Uri.parse(auth.redirectTo!).queryParameters['state']!;

  test('begin persists a 32-byte state and sends it in the redirect', () async {
    await flow.begin();

    final state = stateFromLaunch();
    final pending = await store.readPendingOAuth();
    expect(pending, isNotNull);
    expect(pending!.state, state);
    expect(pending.createdAt, now);
    expect(state, hasLength(43));
    expect(RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(state), isTrue);
    expect(auth.redirectTo, startsWith('flowpost://auth-callback?state='));
  });

  test(
    'a matching, unexpired callback returns the session and is consumed',
    () async {
      await flow.begin();
      final state = stateFromLaunch();

      final session = await flow.accept(
        'flowpost://auth-callback?state=$state&code=the-code',
      );

      expect(session.userId, 'user-1');
      expect(auth.exchanges, 1);
      expect(await store.readPendingOAuth(), isNull);
    },
  );

  test('the pending state is gone before the code is exchanged', () async {
    await flow.begin();
    final state = stateFromLaunch();
    PendingOAuth? atExchange;
    auth.onExchange = () async => atExchange = await store.readPendingOAuth();

    await flow.accept('flowpost://auth-callback?state=$state&code=the-code');

    expect(atExchange, isNull);
  });

  test('a consumed state cannot be replayed', () async {
    await flow.begin();
    final state = stateFromLaunch();
    final link = 'flowpost://auth-callback?state=$state&code=the-code';
    await flow.accept(link);

    await expectLater(
      flow.accept(link),
      throwsA(
        isA<IdentityException>().having(
          (e) => e.error,
          'error',
          IdentityError.oauthStateInvalid,
        ),
      ),
    );
    expect(auth.exchanges, 1);
  });

  test('a wrong scheme, host or path is rejected', () async {
    await flow.begin();
    final state = stateFromLaunch();

    for (final link in [
      'https://auth-callback?state=$state&code=code',
      'flowpost://auth?state=$state&code=code',
      'flowpost://auth-callback/other?state=$state&code=code',
    ]) {
      await expectLater(
        flow.accept(link),
        throwsA(isA<IdentityException>()),
        reason: link,
      );
    }
    expect(auth.exchanges, 0);
  });

  test(
    'a missing or mismatched state is rejected without consuming it',
    () async {
      await flow.begin();
      final state = stateFromLaunch();

      for (final link in [
        'flowpost://auth-callback?code=the-code',
        'flowpost://auth-callback?state=other&code=the-code',
      ]) {
        await expectLater(
          flow.accept(link),
          throwsA(
            isA<IdentityException>().having(
              (e) => e.error,
              'error',
              IdentityError.oauthStateInvalid,
            ),
          ),
          reason: link,
        );
      }

      expect((await store.readPendingOAuth())?.state, state);
      expect(auth.exchanges, 0);
    },
  );

  test('an expired state is rejected and cleared', () async {
    await flow.begin();
    final state = stateFromLaunch();
    now = now.add(const Duration(minutes: 5, seconds: 1));

    await expectLater(
      flow.accept('flowpost://auth-callback?state=$state&code=the-code'),
      throwsA(
        isA<IdentityException>().having(
          (e) => e.error,
          'error',
          IdentityError.oauthStateInvalid,
        ),
      ),
    );

    expect(await store.readPendingOAuth(), isNull);
    expect(auth.exchanges, 0);
  });

  test('a missing code is rejected and the state is consumed', () async {
    await flow.begin();
    final state = stateFromLaunch();

    await expectLater(
      flow.accept('flowpost://auth-callback?state=$state'),
      throwsA(
        isA<IdentityException>().having(
          (e) => e.error,
          'error',
          IdentityError.oauthStateInvalid,
        ),
      ),
    );

    expect(await store.readPendingOAuth(), isNull);
    expect(auth.exchanges, 0);
  });

  test('a provider error is reported as a cancelled sign-in', () async {
    await flow.begin();
    final state = stateFromLaunch();

    await expectLater(
      flow.accept('flowpost://auth-callback?state=$state&error=access_denied'),
      throwsA(
        isA<IdentityException>().having(
          (e) => e.error,
          'error',
          IdentityError.oauthCancelled,
        ),
      ),
    );

    expect(auth.exchanges, 0);
  });

  test('a failed exchange leaves the state consumed', () async {
    await flow.begin();
    final state = stateFromLaunch();
    auth.exchangeError = const AuthException(
      'bad code',
      statusCode: '400',
      code: 'oauth_exchange_failed',
    );

    await expectLater(
      flow.accept('flowpost://auth-callback?state=$state&code=the-code'),
      throwsA(
        isA<IdentityException>().having(
          (e) => e.error,
          'error',
          IdentityError.oauthExchangeFailed,
        ),
      ),
    );

    expect(await store.readPendingOAuth(), isNull);
  });

  test('a begin that cannot build the URL clears the state', () async {
    final failing = OAuthFlow(
      auth: _FailingUrlAuth(),
      repository: repository,
      store: store,
      now: () => now,
      random: Random(7),
    );

    await expectLater(failing.begin(), throwsA(isA<IdentityException>()));
    expect(await store.readPendingOAuth(), isNull);
  });
}

class _FailingUrlAuth extends _FakeAuth {
  @override
  Future<String> oauthSignInUrl({required String redirectTo}) async {
    throw const AuthException('offline', statusCode: null);
  }
}
