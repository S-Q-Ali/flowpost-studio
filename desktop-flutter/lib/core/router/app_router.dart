import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/accounts/presentation/accounts_page.dart';
import '../../features/home/home_page.dart';
import '../../features/media/presentation/media_page.dart';
import '../../features/publishing/presentation/publish_page.dart';
import '../../features/scheduling/presentation/calendar_page.dart';
import '../../features/scheduling/presentation/queue_page.dart';
import '../../features/settings/presentation/settings_page.dart';
import '../shell/app_shell.dart';

const String homeRoute = '/';
const String accountsRoute = '/accounts';
const String uploadRoute = '/upload';
const String publishRoute = '/publish';
const String queueRoute = '/queue';
const String calendarRoute = '/calendar';
const String settingsRoute = '/settings';

/// SPEC-shell Success Criterion 6: only these protocol paths are honoured.
const List<String> deepLinkAllowlist = ['/', '/auth-callback'];

GoRouter buildRouter({
  String? initialDeepLink,
  Listenable? refreshListenable,
  String? Function()? pendingDeepLink,
}) {
  return GoRouter(
    initialLocation: initialDeepLink ?? homeRoute,
    refreshListenable: refreshListenable,
    redirect: (context, state) => pendingDeepLink?.call(),
    routes: [
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
      GoRoute(
        path: '/auth-callback',
        builder: (context, state) =>
            const Scaffold(body: _PendingModulePage(name: 'Sign-in')),
      ),
    ],
    errorBuilder: (context, state) =>
        UnknownRoutePage(location: state.uri.toString()),
  );
}

/// Placeholder until the module mounts its real screen.
class _PendingModulePage extends StatelessWidget {
  const _PendingModulePage({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(name, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          const Text('Coming soon in the next module.'),
        ],
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
