import 'dart:math';

import 'package:flowpost_desktop/features/identity/data/auth_repository.dart';
import 'package:flowpost_desktop/features/identity/data/identity_models.dart';
import 'package:flowpost_desktop/features/identity/data/identity_store.dart';
import 'package:flowpost_desktop/features/identity/data/oauth_flow.dart';
import 'package:flowpost_desktop/features/identity/identity_controller.dart';
import 'package:flowpost_desktop/features/identity/identity_providers.dart';
import 'package:flowpost_desktop/features/identity/presentation/login_page.dart';
import 'package:flutter/material.dart';
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
  String? redirectTo;
  int exchanges = 0;

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
    exchanges++;
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
  late IdentityService service;
  late List<Uri> launched;
  bool launcherWorks = true;

  ProviderContainer makeContainer() => ProviderContainer(
    overrides: [
      identityServiceProvider.overrideWith((ref) async => service),
      browserLauncherProvider.overrideWithValue((url) async {
        launched.add(url);
        return launcherWorks;
      }),
    ],
  );

  setUp(() {
    auth = _FakeAuth();
    store = SecureIdentityStore(vault: _MemoryVault());
    final repository = AuthRepository(
      auth: auth,
      users: _FakeUsers(),
      functions: _FakeFunctions(),
      store: store,
    );
    service = IdentityService(
      repository: repository,
      oauth: OAuthFlow(
        auth: auth,
        repository: repository,
        store: store,
        random: Random(9),
      ),
      store: store,
    );
    launched = [];
    launcherWorks = true;
  });

  Future<void> pumpLogin(
    WidgetTester tester,
    ProviderContainer container,
  ) async {
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: LoginPage()),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('the idle page has both sign-in paths', (tester) async {
    final container = makeContainer();
    addTearDown(container.dispose);
    await pumpLogin(tester, container);

    expect(find.text('Sign in to FlowPost'), findsOneWidget);
    expect(find.byKey(const Key('login-email')), findsOneWidget);
    expect(find.byKey(const Key('login-password')), findsOneWidget);
    expect(find.byKey(const Key('login-submit')), findsOneWidget);
    expect(find.byKey(const Key('login-google')), findsOneWidget);
  });

  testWidgets('an empty form is refused before any call', (tester) async {
    final container = makeContainer();
    addTearDown(container.dispose);
    await pumpLogin(tester, container);

    await tester.tap(find.byKey(const Key('login-submit')));
    await tester.pump();

    expect(find.text('Enter your email address and password.'), findsOneWidget);
  });

  testWidgets('a wrong password is shown as text, not a snackbar', (
    tester,
  ) async {
    auth.signInError = const AuthException(
      'Invalid login credentials',
      statusCode: '400',
      code: 'invalid_credentials',
    );
    final container = makeContainer();
    addTearDown(container.dispose);
    await pumpLogin(tester, container);

    await tester.enterText(
      find.byKey(const Key('login-email')),
      'admin@example.com',
    );
    await tester.enterText(find.byKey(const Key('login-password')), 'wrong');
    await tester.tap(find.byKey(const Key('login-submit')));
    await tester.pumpAndSettle();

    expect(find.text(IdentityError.invalidCredentials.message), findsOneWidget);
    expect(find.byKey(const Key('login-error')), findsOneWidget);
  });

  testWidgets('Enter in the password field signs in', (tester) async {
    final container = makeContainer();
    addTearDown(container.dispose);
    await pumpLogin(tester, container);

    await tester.enterText(
      find.byKey(const Key('login-email')),
      'admin@example.com',
    );
    await tester.enterText(find.byKey(const Key('login-password')), 'secret');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    final state = container.read(identityControllerProvider).value;
    expect(state, isNot(isA<SignedOut>()));
  });

  testWidgets('Google opens the browser and offers Cancel', (tester) async {
    final container = makeContainer();
    addTearDown(container.dispose);
    await pumpLogin(tester, container);

    await tester.tap(find.byKey(const Key('login-google')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(launched, hasLength(1));
    expect(launched.single.toString(), contains('provider=google'));
    final pending = await store.readPendingOAuth();
    final state = Uri.parse(auth.redirectTo!).queryParameters['state'];
    expect(pending?.state, state);
    expect(find.byKey(const Key('login-waiting')), findsOneWidget);

    await tester.tap(find.byKey(const Key('login-cancel-google')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('login-google')), findsOneWidget);
    expect(await store.readPendingOAuth(), isNull);
  });

  testWidgets('a browser that will not open is reported', (tester) async {
    launcherWorks = false;
    final container = makeContainer();
    addTearDown(container.dispose);
    await pumpLogin(tester, container);

    await tester.tap(find.byKey(const Key('login-google')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byKey(const Key('login-error')), findsOneWidget);
    expect(find.byKey(const Key('login-google')), findsOneWidget);
    expect(await store.readPendingOAuth(), isNull);
  });

  testWidgets('the waiting state gives up after five minutes', (tester) async {
    final container = makeContainer();
    addTearDown(container.dispose);
    await pumpLogin(tester, container);

    await tester.tap(find.byKey(const Key('login-google')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(minutes: 5));
    await tester.pump();

    expect(find.text(IdentityError.oauthStateInvalid.message), findsOneWidget);
    expect(find.byKey(const Key('login-google')), findsOneWidget);
    expect(await store.readPendingOAuth(), isNull);
  });
}
