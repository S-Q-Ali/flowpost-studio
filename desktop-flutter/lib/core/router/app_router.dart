import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/home/home_page.dart';

const String homeRoute = '/';

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
      GoRoute(path: homeRoute, builder: (context, state) => const HomePage()),
      GoRoute(
        path: '/auth-callback',
        builder: (context, state) => const _PendingModulePage(name: 'Sign-in'),
      ),
    ],
    errorBuilder: (context, state) =>
        UnknownRoutePage(location: state.uri.toString()),
  );
}

/// Placeholder until the `identity` module mounts its real screens.
class _PendingModulePage extends StatelessWidget {
  const _PendingModulePage({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(name)),
      body: const Center(child: Text('Coming soon in the next module.')),
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
