import 'dart:async';
import 'dart:math';

import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/router/app_router.dart';
import 'package:flowpost_desktop/features/identity/data/auth_repository.dart';
import 'package:flowpost_desktop/features/identity/data/identity_models.dart';
import 'package:flowpost_desktop/features/identity/data/identity_store.dart';
import 'package:flowpost_desktop/features/identity/data/oauth_flow.dart';
import 'package:flowpost_desktop/features/identity/identity_controller.dart';
import 'package:flowpost_desktop/features/identity/identity_providers.dart';
import 'package:flowpost_desktop/features/identity/presentation/auth_callback_page.dart';
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

  final List<String> codes = [];
  Completer<AuthSession>? gate;
  Object? error;

  @override
  Future<String> oauthSignInUrl({required String redirectTo}) async => '';

  @override
  Future<AuthSession> signInWithPassword({
    required String email,
    required String password,
  }) async => session;

  @override
  Future<AuthSession> exchangeCode(String code) async {
    codes.add(code);
    final pending = gate;
    if (pending != null) return pending.future;
    final failure = error;
    if (failure != null) throw failure;
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
  }) async => AdminToken(token: 'token', issuedAt: DateTime.utc(2026));

  @override
  Future<void> setQuestions({
    required String favTeacher,
    required String bestNightDate,
  }) async {}
}

void main() {
  late _FakeAuth auth;
  late SecureIdentityStore store;
  late ProviderContainer container;

  setUp(() {
    auth = _FakeAuth();
    store = SecureIdentityStore(vault: _MemoryVault());
    final repository = AuthRepository(
      auth: auth,
      users: _FakeUsers(),
      functions: _FakeFunctions(),
      store: store,
    );
    final service = IdentityService(
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

  Future<void> writePending([String state = 'st']) => store.writePendingOAuth(
    PendingOAuth(state: state, createdAt: DateTime.now()),
  );

  Future<void> pumpPage(WidgetTester tester, String location) async {
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(home: AuthCallbackPage(uri: Uri.parse(location))),
      ),
    );
    await tester.pump();
  }

  testWidgets('the spinner shows while the code is exchanged', (tester) async {
    auth.gate = Completer<AuthSession>();
    await writePending();

    await pumpPage(tester, '/auth-callback?code=abc&state=st');

    expect(find.text('Signing you in…'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    auth.gate!.complete(_FakeAuth.session);
    await tester.pump();
    await tester.pump();

    expect(auth.codes, ['abc']);
    expect(
      container.read(identityControllerProvider).value,
      isA<AwaitingQuestions>(),
    );
    expect(await store.readPendingOAuth(), isNull);
  });

  testWidgets('a matching state exchanges the code once', (tester) async {
    await writePending();

    await pumpPage(tester, '/auth-callback?code=abc&state=st');
    await tester.pump();

    expect(auth.codes, ['abc']);
    expect(await store.readPendingOAuth(), isNull);
    expect(
      container.read(identityControllerProvider).value,
      isA<AwaitingQuestions>(),
    );
  });

  testWidgets('an unknown state fails closed with the readable message', (
    tester,
  ) async {
    await pumpPage(tester, '/auth-callback?code=abc&state=unknown');
    await tester.pump();

    expect(find.text(IdentityError.oauthStateInvalid.message), findsOneWidget);
    expect(find.byKey(const Key('callback-error')), findsOneWidget);
    expect(auth.codes, isEmpty);
  });

  testWidgets('a provider error cancels and drops the pending state', (
    tester,
  ) async {
    await writePending();

    await pumpPage(tester, '/auth-callback?error=access_denied&state=st');
    await tester.pump();

    expect(find.text(IdentityError.oauthCancelled.message), findsOneWidget);
    expect(await store.readPendingOAuth(), isNull);
    expect(auth.codes, isEmpty);
  });

  testWidgets('a failed exchange says so and keeps the way back', (
    tester,
  ) async {
    auth.error = const IdentityException(IdentityError.oauthExchangeFailed);
    await writePending();

    await pumpPage(tester, '/auth-callback?code=abc&state=st');
    await tester.pump();

    expect(
      find.text(IdentityError.oauthExchangeFailed.message),
      findsOneWidget,
    );
    expect(find.byKey(const Key('callback-back')), findsOneWidget);
  });

  testWidgets('the way back goes to the login page', (tester) async {
    final router = buildRouter(
      initialDeepLink: '/auth-callback?code=abc&state=unknown',
    );

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pump();

    await tester.tap(find.byKey(const Key('callback-back')));
    await tester.pump();

    expect(find.text('Sign in to FlowPost'), findsOneWidget);
  });
}
