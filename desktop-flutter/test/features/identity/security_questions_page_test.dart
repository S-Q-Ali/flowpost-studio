import 'dart:io';
import 'dart:math';

import 'package:flowpost_desktop/features/identity/data/auth_repository.dart';
import 'package:flowpost_desktop/features/identity/data/identity_models.dart';
import 'package:flowpost_desktop/features/identity/data/identity_store.dart';
import 'package:flowpost_desktop/features/identity/data/oauth_flow.dart';
import 'package:flowpost_desktop/features/identity/identity_controller.dart';
import 'package:flowpost_desktop/features/identity/identity_providers.dart';
import 'package:flowpost_desktop/features/identity/presentation/security_questions_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show FunctionException;

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

  AuthSession? restored;

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
  Future<AuthSession?> restoreSession() async => restored;

  @override
  Future<void> signOut() async {}
}

class _FakeUsers implements UsersGateway {
  @override
  Future<AdminLookup> lookupAdmin(String userId) async => AdminLookup.admin;
}

class _FakeFunctions implements FunctionsGateway {
  bool configured = true;
  bool sessionValid = true;
  Object? verifyError;
  Object? setError;
  int verifies = 0;
  int sets = 0;
  String? lastTeacher;
  String? lastDate;

  @override
  Future<bool> questionsConfigured() async => configured;

  @override
  Future<bool> verifySession(String token) async => sessionValid;

  @override
  Future<AdminToken> verifyQuestions({
    required String favTeacher,
    required String bestNightDate,
  }) async {
    verifies++;
    lastTeacher = favTeacher;
    lastDate = bestNightDate;
    final error = verifyError;
    if (error != null) throw error;
    return AdminToken(token: 'minted-token', issuedAt: DateTime.utc(2026));
  }

  @override
  Future<void> setQuestions({
    required String favTeacher,
    required String bestNightDate,
  }) async {
    sets++;
    final error = setError;
    if (error != null) throw error;
  }
}

void main() {
  late _FakeAuth auth;
  late _FakeUsers users;
  late _FakeFunctions functions;
  late SecureIdentityStore store;
  late ProviderContainer container;

  ProviderContainer buildContainer() {
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
        random: Random(11),
      ),
      store: store,
    );
    return ProviderContainer(
      overrides: [identityServiceProvider.overrideWith((ref) async => service)],
    );
  }

  setUp(() {
    auth = _FakeAuth();
    users = _FakeUsers();
    functions = _FakeFunctions();
    store = SecureIdentityStore(vault: _MemoryVault());
    container = buildContainer();
  });

  tearDown(() => container.dispose());

  Future<void> reachQuestions() async {
    await container.read(identityControllerProvider.future);
    await container
        .read(identityControllerProvider.notifier)
        .signInWithPassword('admin@example.com', 'secret');
  }

  Future<void> pumpQuestions(WidgetTester tester) async {
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: SecurityQuestionsPage()),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> pickTodaysDate(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('questions-date')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
  }

  testWidgets('the verify form names both questions', (tester) async {
    await reachQuestions();
    await pumpQuestions(tester);

    expect(find.text('Security verification'), findsOneWidget);
    expect(find.text("What is your favorite teacher's name?"), findsOneWidget);
    expect(
      find.text('What is the date of your best night ever?'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('questions-submit')), findsOneWidget);
  });

  testWidgets('both answers are required before a call', (tester) async {
    await reachQuestions();
    await pumpQuestions(tester);

    await tester.tap(find.byKey(const Key('questions-submit')));
    await tester.pump();

    expect(find.text('Answer both security questions.'), findsOneWidget);
    expect(functions.verifies, 0);
  });

  testWidgets('wrong answers show the server message', (tester) async {
    functions.verifyError = const FunctionException(
      status: 401,
      details: {'error': 'Incorrect answers'},
    );
    await reachQuestions();
    await pumpQuestions(tester);

    await tester.enterText(
      find.byKey(const Key('questions-teacher')),
      'Miss Ayesha',
    );
    await pickTodaysDate(tester);
    await tester.tap(find.byKey(const Key('questions-submit')));
    await tester.pumpAndSettle();

    expect(find.text('Incorrect answers'), findsOneWidget);
    expect(find.byKey(const Key('questions-error')), findsOneWidget);
  });

  testWidgets('a lockout shows the server countdown verbatim', (tester) async {
    functions.verifyError = const FunctionException(
      status: 429,
      details: {'error': 'Too many failed attempts. Try again in 12 minutes.'},
    );
    await reachQuestions();
    await pumpQuestions(tester);

    await tester.enterText(
      find.byKey(const Key('questions-teacher')),
      'Miss Ayesha',
    );
    await pickTodaysDate(tester);
    await tester.tap(find.byKey(const Key('questions-submit')));
    await tester.pumpAndSettle();

    expect(
      find.text('Too many failed attempts. Try again in 12 minutes.'),
      findsOneWidget,
    );
  });

  testWidgets('offline answers keep the readable offline message', (
    tester,
  ) async {
    functions.verifyError = const SocketException('no route');
    await reachQuestions();
    await pumpQuestions(tester);

    await tester.enterText(
      find.byKey(const Key('questions-teacher')),
      'Miss Ayesha',
    );
    await pickTodaysDate(tester);
    await tester.tap(find.byKey(const Key('questions-submit')));
    await tester.pumpAndSettle();

    expect(find.text(IdentityError.offline.message), findsOneWidget);
  });

  testWidgets('a correct answer signs in with the minted token', (
    tester,
  ) async {
    await reachQuestions();
    await pumpQuestions(tester);

    await tester.enterText(
      find.byKey(const Key('questions-teacher')),
      'Miss Ayesha',
    );
    await pickTodaysDate(tester);
    await tester.tap(find.byKey(const Key('questions-submit')));
    await tester.pumpAndSettle();

    expect(container.read(identityControllerProvider).value, isA<SignedIn>());
    expect((await store.readAdminToken())?.token, 'minted-token');
    expect(functions.lastTeacher, 'Miss Ayesha');
    expect(functions.lastDate, isNotNull);
  });

  testWidgets('an unconfigured backend asks the admin to set the questions', (
    tester,
  ) async {
    functions.configured = false;
    await reachQuestions();
    await pumpQuestions(tester);

    expect(find.text('Set up security questions'), findsOneWidget);
    expect(
      find.text('Set up two security questions for additional protection.'),
      findsOneWidget,
    );

    await tester.enterText(
      find.byKey(const Key('questions-teacher')),
      'Miss Ayesha',
    );
    await pickTodaysDate(tester);
    await tester.tap(find.byKey(const Key('questions-submit')));
    await tester.pumpAndSettle();

    expect(functions.sets, 1);
    expect(functions.verifies, 1);
    expect(container.read(identityControllerProvider).value, isA<SignedIn>());
  });

  testWidgets('an expired admin session explains itself', (tester) async {
    container.dispose();
    auth.restored = _FakeAuth.session;
    functions.sessionValid = false;
    await store.writeAdminToken(
      AdminToken(token: 'expired-token', issuedAt: DateTime.utc(2026)),
    );
    container = buildContainer();

    await container.read(identityControllerProvider.future);
    await pumpQuestions(tester);

    expect(find.text(IdentityError.adminTokenExpired.message), findsOneWidget);
  });

  testWidgets('sign out leaves the questions screen signed out', (
    tester,
  ) async {
    await reachQuestions();
    await pumpQuestions(tester);

    await tester.tap(find.byKey(const Key('questions-signout')));
    await tester.pumpAndSettle();

    expect(container.read(identityControllerProvider).value, isA<SignedOut>());
    expect(await store.readAdminToken(), isNull);
    expect(await store.readSession(), isNull);
  });
}
