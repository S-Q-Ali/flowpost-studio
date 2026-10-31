import 'dart:math';

import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/router/app_router.dart';
import 'package:flowpost_desktop/features/identity/data/auth_repository.dart';
import 'package:flowpost_desktop/features/identity/data/identity_models.dart';
import 'package:flowpost_desktop/features/identity/data/identity_store.dart';
import 'package:flowpost_desktop/features/identity/data/oauth_flow.dart';
import 'package:flowpost_desktop/features/identity/identity_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/config_overrides.dart';

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
  static const AuthSession session = AuthSession(
    accessToken: 'access-token',
    userId: 'user-1',
    email: 'admin@example.com',
  );

  @override
  Future<String> oauthSignInUrl({required String redirectTo}) async => '';

  @override
  Future<AuthSession> signInWithPassword({
    required String email,
    required String password,
  }) async => session;

  @override
  Future<AuthSession> exchangeCode(String code) async => session;

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
  }) async => AdminToken(token: 'token', issuedAt: DateTime.utc(2026));

  @override
  Future<void> setQuestions({
    required String favTeacher,
    required String bestNightDate,
  }) async {}
}

void main() {
  late _FakeAuth auth;
  late _FakeUsers users;
  late _FakeFunctions functions;
  late SecureIdentityStore store;
  late ProviderContainer container;

  setUp(() {
    auth = _FakeAuth();
    users = _FakeUsers();
    functions = _FakeFunctions();
    store = SecureIdentityStore(vault: _MemoryVault());
    final repository = AuthRepository(
      auth: auth,
      users: users,
      functions: functions,
      store: store,
    );
    final service = IdentityService(
      repository: repository,
      oauth: OAuthFlow(
        auth: auth,
        repository: repository,
        store: store,
        random: Random(7),
      ),
      store: store,
    );
    container = ProviderContainer(
      overrides: [
        seededConfig(
          const AppConfig(
            supabaseUrl: 'https://test.supabase.co',
            supabaseAnonKey: 'test-anon',
            updateManifestUrl: '',
          ),
        ),
        identityServiceProvider.overrideWith((ref) async => service),
      ],
    );
  });

  tearDown(() => container.dispose());

  Future<void> pumpApp(
    WidgetTester tester, {
    required String initial,
    required AuthState? auth,
    bool loading = false,
    String? Function()? pendingDeepLink,
  }) async {
    final router = buildRouter(
      initialDeepLink: initial,
      authState: () => auth,
      authLoading: () => loading,
      pendingDeepLink: pendingDeepLink,
    );
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pump();
  }

  testWidgets('a signed-out start lands on login, not the app shell', (
    tester,
  ) async {
    await pumpApp(tester, initial: '/queue', auth: const SignedOut());

    expect(find.text('Sign in to FlowPost'), findsOneWidget);
    expect(find.text('Home'), findsNothing);
  });

  testWidgets('awaiting questions lands on the questions page', (tester) async {
    await pumpApp(
      tester,
      initial: '/settings',
      auth: const AwaitingQuestions(questionsConfigured: true),
    );

    expect(find.text('Security verification'), findsOneWidget);
    expect(find.text('Settings'), findsNothing);
  });

  testWidgets('a signed-in user is sent from login to the shell', (
    tester,
  ) async {
    await pumpApp(
      tester,
      initial: loginRoute,
      auth: const SignedIn(userId: 'user-1', isAdmin: true),
    );

    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Sign in to FlowPost'), findsNothing);
  });

  testWidgets('a signed-in user is sent from the questions to the shell', (
    tester,
  ) async {
    await pumpApp(
      tester,
      initial: questionsRoute,
      auth: const SignedIn(userId: 'user-1', isAdmin: true),
    );

    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Security verification'), findsNothing);
  });

  testWidgets('a callback is reachable while signed out', (tester) async {
    await pumpApp(
      tester,
      initial: '$authCallbackRoute?code=abc&state=unknown',
      auth: const SignedOut(),
    );

    expect(find.byKey(const Key('callback-error')), findsOneWidget);
    expect(find.text('Sign in to FlowPost'), findsNothing);
  });

  testWidgets('a pending callback wins over the signed-out guard', (
    tester,
  ) async {
    String? callback() => '$authCallbackRoute?code=abc&state=unknown';

    await pumpApp(
      tester,
      initial: loginRoute,
      auth: const SignedOut(),
      pendingDeepLink: callback,
    );

    expect(find.byKey(const Key('callback-error')), findsOneWidget);
  });

  testWidgets('the starting screen shows while the session is read', (
    tester,
  ) async {
    await pumpApp(tester, initial: homeRoute, auth: null, loading: true);

    expect(find.text('Starting FlowPost…'), findsOneWidget);
    expect(find.text('Sign in to FlowPost'), findsNothing);
  });
}
