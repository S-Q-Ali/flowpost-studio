import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/accounts/presentation/accounts_page.dart';
import '../../features/home/home_page.dart';
import '../../features/license/data/license_models.dart';
import '../../features/license/presentation/license_gate_page.dart';
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
const String licenseRoute = '/license';
const String startingRoute = '/starting';

/// The unwired identity module's screens still name these; no route serves
/// them since the license replaced sign-in (SPEC-license).
const String loginRoute = '/login';
const String questionsRoute = '/security-questions';
const String authCallbackRoute = '/auth-callback';

/// SPEC-shell Success Criterion 6: only these protocol paths are honoured.
const List<String> deepLinkAllowlist = ['/'];

/// The guard only runs when [licenseState] is supplied; page-level widget
/// tests build the app without the license gate.
GoRouter buildRouter({
  String? initialDeepLink,
  Listenable? refreshListenable,
  String? Function()? pendingDeepLink,
  bool Function()? needsSetup,
  LicenseState? Function()? licenseState,
  bool Function()? licenseLoading,
}) {
  final guarded = licenseState != null;
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
      return _licenseRedirect(
        state,
        licenseState,
        licenseLoading,
        pendingDeepLink,
      );
    },
    routes: [
      GoRoute(path: setupRoute, builder: (context, state) => const SetupPage()),
      GoRoute(
        path: licenseRoute,
        builder: (context, state) => const LicenseGatePage(),
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

/// The license screen and the app shell, in that order of precedence.
///
/// The license screen stays reachable while active (Settings links to it), and
/// the starting screen only while no state is known yet.
String? _licenseRedirect(
  GoRouterState state,
  LicenseState? Function() licenseState,
  bool Function()? licenseLoading,
  String? Function()? pendingDeepLink,
) {
  final path = state.uri.path;
  if (licenseLoading?.call() ?? false) {
    return path == startingRoute ? null : startingRoute;
  }
  if (licenseState() is! Active) {
    return path == licenseRoute ? null : licenseRoute;
  }
  if (path == startingRoute) return homeRoute;
  return pendingDeepLink?.call();
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
