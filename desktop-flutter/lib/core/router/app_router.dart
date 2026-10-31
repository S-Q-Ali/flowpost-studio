import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/accounts/presentation/accounts_page.dart';
import '../../features/home/home_page.dart';
import '../../features/identity/data/identity_models.dart';
import '../../features/identity/presentation/auth_callback_page.dart';
import '../../features/identity/presentation/login_page.dart';
import '../../features/identity/presentation/security_questions_page.dart';
import '../../features/media/presentation/media_page.dart';
import '../../features/publishing/presentation/publish_page.dart';
import '../../features/scheduling/presentation/calendar_page.dart';
import '../../features/scheduling/presentation/queue_page.dart';
import '../../features/settings/presentation/settings_page.dart';
import '../../features/setup/presentation/setup_page.dart';
import '../shell/app_shell.dart';

const String homeRoute = '/';
const String accountsRoute = '/accounts';
const String uploadRoute = '/upload';
const String publishRoute = '/publish';
const String queueRoute = '/queue';
const String calendarRoute = '/calendar';
const String settingsRoute = '/settings';
const String setupRoute = '/setup';
const String loginRoute = '/login';
const String questionsRoute = '/security-questions';
const String authCallbackRoute = '/auth-callback';
const String startingRoute = '/starting';

/// SPEC-shell Success Criterion 6: only these protocol paths are honoured.
const List<String> deepLinkAllowlist = ['/', authCallbackRoute];

/// The guard only runs when [authState] is supplied; page-level widget tests
/// build the app without identity and keep the old behaviour.
GoRouter buildRouter({
  String? initialDeepLink,
  Listenable? refreshListenable,
  String? Function()? pendingDeepLink,
  bool Function()? needsSetup,
  AuthState? Function()? authState,
  bool Function()? authLoading,
}) {
  final guarded = authState != null;
  return GoRouter(
    initialLocation: initialDeepLink ?? homeRoute,
    refreshListenable: refreshListenable,
    redirect: (context, state) {
      // Without backend values every screen would fail on its first read, so
      // setup owns the window until there are values (SPEC-credentials
      // Decision 7).
      if (needsSetup?.call() ?? false) {
        return state.uri.path == setupRoute ? null : setupRoute;
      }
      if (state.uri.path == setupRoute) return homeRoute;
      if (!guarded) return pendingDeepLink?.call();
      return _identityRedirect(state, authState, authLoading, pendingDeepLink);
    },
    routes: [
      GoRoute(path: setupRoute, builder: (context, state) => const SetupPage()),
      GoRoute(path: loginRoute, builder: (context, state) => const LoginPage()),
      GoRoute(
        path: questionsRoute,
        builder: (context, state) => const SecurityQuestionsPage(),
      ),
      GoRoute(
        path: authCallbackRoute,
        builder: (context, state) => AuthCallbackPage(uri: state.uri),
      ),
      GoRoute(
        path: startingRoute,
        builder: (context, state) => const _StartingPage(),
      ),
      ShellRoute(
        builder: (context, state, child) =>
            AppShell(location: state.uri.path, child: child),
        routes: [
          GoRoute(
            path: homeRoute,
            builder: (context, state) => const HomePage(),
          ),
          GoRoute(
            path: accountsRoute,
            builder: (context, state) => const AccountsPage(),
          ),
          GoRoute(
            path: uploadRoute,
            builder: (context, state) => const MediaPage(),
          ),
          GoRoute(
            path: publishRoute,
            builder: (context, state) => const PublishPage(),
          ),
          GoRoute(
            path: queueRoute,
            builder: (context, state) => const QueuePage(),
          ),
          GoRoute(
            path: calendarRoute,
            builder: (context, state) => const CalendarPage(),
          ),
          GoRoute(
            path: settingsRoute,
            builder: (context, state) => const SettingsPage(),
          ),
        ],
      ),
    ],
    errorBuilder: (context, state) =>
        UnknownRoutePage(location: state.uri.toString()),
  );
}

/// Login, questions and the app shell, in that order of precedence.
///
/// A callback arrives while signed out, so it is always allowed through; a
/// pending link runs before the guard because it may be the callback itself.
String? _identityRedirect(
  GoRouterState state,
  AuthState? Function() authState,
  bool Function()? authLoading,
  String? Function()? pendingDeepLink,
) {
  final path = state.uri.path;
  if (path == authCallbackRoute) return null;
  final pending = pendingDeepLink?.call();
  if (pending != null) return pending;
  if (authLoading?.call() ?? false) {
    return path == startingRoute ? null : startingRoute;
  }
  final auth = authState();
  if (auth is SignedIn) {
    return path == loginRoute || path == questionsRoute || path == startingRoute
        ? homeRoute
        : null;
  }
  if (auth is AwaitingQuestions) {
    return path == questionsRoute ? null : questionsRoute;
  }
  return path == loginRoute ? null : loginRoute;
}

/// Shown while the stored session is read, so no screen flashes before the
/// guard knows where the user belongs.
class _StartingPage extends StatelessWidget {
  const _StartingPage();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 28,
              height: 28,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(height: 16),
            Text('Starting FlowPost…'),
          ],
        ),
      ),
    );
  }
}

class UnknownRoutePage extends StatelessWidget {
  const UnknownRoutePage({super.key, required this.location});

  final String location;

  @override
  Widget build(BuildContext context) {
    return Scaffold(body: Center(child: Text('No such screen: $location')));
  }
}
