import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flowpost_desktop/core/session/session.dart';
import 'package:flowpost_desktop/features/identity/data/auth_repository.dart';
import 'package:flowpost_desktop/features/identity/data/identity_models.dart';
import 'package:flowpost_desktop/features/identity/data/identity_store.dart';
import 'package:flowpost_desktop/features/identity/data/oauth_flow.dart';
import 'package:flowpost_desktop/features/identity/identity_controller.dart';
import 'package:flowpost_desktop/features/identity/identity_providers.dart';
import 'package:flowpost_desktop/features/offline/connectivity.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
  String? redirectTo;

  static const AuthSession session = AuthSession(
    accessToken: 'access-token',
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
  }) async {
    final error = signInError;
    if (error != null) throw error;
    return session;
  }

  @override
  Future<AuthSession> exchangeCode(String code) async {
    final error = exchangeError;
    if (error != null) throw error;
    return session;
  }

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
  Object? error;

  @override
  Future<AdminLookup> lookupAdmin(String userId) async {
    final failure = error;
    if (failure != null) throw failure;
    return lookup;
  }
}

class _FakeFunctions implements FunctionsGateway {
  bool configured = true;
  bool sessionValid = true;
  Object? questionsError;
  Object? verifyError;
  int verifies = 0;
  int sessionChecks = 0;
  void Function()? onSessionCheck;

  @override
  Future<bool> questionsConfigured() async {
    final error = questionsError;
    if (error != null) throw error;
    return configured;
  }

  @override
  Future<bool> verifySession(String token) async {
    sessionChecks++;
    onSessionCheck?.call();
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
  late IdentityService service;
  late ProviderContainer container;

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
    service = IdentityService(
      repository: repository,
      oauth: OAuthFlow(
        auth: auth,
        repository: repository,
        store: store,
        random: Random(3),
      ),
      store: store,
    );
    container = ProviderContainer(
      overrides: [identityServiceProvider.overrideWith((ref) async => service)],
    );
    addTearDown(container.dispose);
  });

  Future<void> seedAdmin() async {
    await store.writeProfile(
      const ProfileCache(
        userId: 'user-1',
        email: 'admin@example.com',
        isAdmin: true,
      ),
    );
    await store.writeAdminToken(
      AdminToken(token: 'admin-token', issuedAt: DateTime.utc(2026)),
    );
  }

  Future<AuthState> start() =>
      container.read(identityControllerProvider.future);

  IdentityController controller() =>
      container.read(identityControllerProvider.notifier);

  test('with no stored session the app starts signed out', () async {
    expect(await start(), isA<SignedOut>());
    expect(container.read(sessionProvider), isNull);
  });

  test('a stored admin session resumes straight into the app', () async {
    auth.restored = _FakeAuth.session;
    await seedAdmin();

    expect(await start(), isA<SignedIn>());

    final session = container.read(sessionProvider);
    expect(session?.sessionToken, 'admin-token');
    expect(session?.accessToken, 'access-token');
  });

  test('a non-admin is signed out and told why', () async {
    auth.restored = _FakeAuth.session;
    users.lookup = AdminLookup.notAdmin;

    final state = await start();

    expect(state, isA<SignedOut>());
    expect((state as SignedOut).message, IdentityError.notAdmin.message);
    expect(await store.readSession(), isNull);
    expect(container.read(sessionProvider), isNull);
  });

  test(
    'a stored admin with no network starts offline from the cache',
    () async {
      auth.restored = _FakeAuth.session;
      await seedAdmin();
      users.error = const SocketException('no route');

      final state = await start();

      expect(state, isA<SignedIn>());
      expect((state as SignedIn).offline, isTrue);
      expect(container.read(sessionProvider)?.sessionToken, 'admin-token');
    },
  );

  test(
    'offline without a cached admin starts signed out with the offline message',
    () async {
      auth.restored = _FakeAuth.session;
      users.error = const SocketException('no route');

      final state = await start();

      expect(state, isA<SignedOut>());
      expect((state as SignedOut).message, IdentityError.offline.message);
      expect(container.read(sessionProvider), isNull);
    },
  );

  test('a password sign-in with a valid admin token signs in', () async {
    await seedAdmin();
    await start();

    await controller().signInWithPassword('admin@example.com', 'secret');

    expect(container.read(identityControllerProvider).value, isA<SignedIn>());
    expect(container.read(sessionProvider)?.sessionToken, 'admin-token');
  });

  test(
    'a password sign-in without an admin token asks the questions',
    () async {
      await start();

      await controller().signInWithPassword('admin@example.com', 'secret');

      final state = container.read(identityControllerProvider).value;
      expect(state, isA<AwaitingQuestions>());
      expect((state as AwaitingQuestions).questionsConfigured, isTrue);
      expect(container.read(sessionProvider), isNull);
    },
  );

  test('a wrong password leaves the state and the session alone', () async {
    auth.signInError = const AuthException(
      'Invalid login credentials',
      statusCode: '400',
      code: 'invalid_credentials',
    );
    await start();

    await expectLater(
      controller().signInWithPassword('admin@example.com', 'wrong'),
      throwsA(
        isA<IdentityException>().having(
          (e) => e.error,
          'error',
          IdentityError.invalidCredentials,
        ),
      ),
    );
    expect(container.read(identityControllerProvider).value, isA<SignedOut>());
    expect(container.read(sessionProvider), isNull);
  });

  test('verified questions sign in and store the token', () async {
    await start();
    await controller().signInWithPassword('admin@example.com', 'secret');

    await controller().verifyQuestions(
      favTeacher: 'Miss Ayesha',
      bestNightDate: '2026-10-31',
    );

    expect(container.read(identityControllerProvider).value, isA<SignedIn>());
    expect((await store.readAdminToken())?.token, 'minted-token');
    expect(container.read(sessionProvider)?.sessionToken, 'minted-token');
  });

  test('setting the questions verifies them in the same step', () async {
    functions.configured = false;
    await start();
    await controller().signInWithPassword('admin@example.com', 'secret');

    await controller().setQuestions(
      favTeacher: 'Miss Ayesha',
      bestNightDate: '2026-10-31',
    );

    expect(functions.verifies, 1);
    expect(container.read(identityControllerProvider).value, isA<SignedIn>());
  });

  test('a Google callback that matches the pending state signs in', () async {
    await seedAdmin();
    await start();

    final url = await controller().startGoogleSignIn();
    final state = Uri.parse(auth.redirectTo!).queryParameters['state']!;
    expect(url, contains('provider=google'));

    await controller().completeGoogleSignIn(
      'flowpost://auth-callback?state=$state&code=the-code',
    );

    expect(container.read(identityControllerProvider).value, isA<SignedIn>());
    expect(container.read(sessionProvider)?.accessToken, 'access-token');
  });

  test(
    'sign out clears the state, the tokens and the secure records',
    () async {
      auth.restored = _FakeAuth.session;
      await seedAdmin();
      await start();

      await controller().signOut();

      expect(
        container.read(identityControllerProvider).value,
        isA<SignedOut>(),
      );
      expect(container.read(sessionProvider), isNull);
      expect(auth.signOuts, 1);
      expect(await store.readSession(), isNull);
      expect(await store.readAdminToken(), isNull);
    },
  );

  test('sign out still clears this PC when the network is down', () async {
    auth.restored = _FakeAuth.session;
    await seedAdmin();
    auth.signOutError = const SocketException('no route');
    await start();

    await controller().signOut();

    expect(container.read(identityControllerProvider).value, isA<SignedOut>());
    expect(await store.readSession(), isNull);
    expect(container.read(sessionProvider), isNull);
  });

  test('a reconnect revalidates an offline session', () async {
    auth.restored = _FakeAuth.session;
    await seedAdmin();
    users.error = const SocketException('no route');
    await start();
    final offline = container.read(identityControllerProvider).value;
    expect((offline as SignedIn).offline, isTrue);

    users.error = null;
    final revalidated = Completer<void>();
    functions.onSessionCheck = revalidated.complete;

    container.read(connectivityProvider.notifier).lost();
    container.read(connectivityProvider.notifier).reached();
    await revalidated.future;
    await pumpEventQueue();

    expect(container.read(identityControllerProvider).value, isA<SignedIn>());
    expect(
      (container.read(identityControllerProvider).value as SignedIn).offline,
      isFalse,
    );
  });
}
