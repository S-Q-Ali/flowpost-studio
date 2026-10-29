import 'package:flutter/material.dart';

import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

class FlowPostApp extends StatelessWidget {
  const FlowPostApp({
    super.key,
    this.initialDeepLink,
    this.refreshListenable,
    this.pendingDeepLink,
  });

  final String? initialDeepLink;
  final Listenable? refreshListenable;

  /// Returns a route to navigate to now, or null to stay put; must consume
  /// the pending value so redirects don't loop.
  final String? Function()? pendingDeepLink;

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'FlowPost Studio',
      debugShowCheckedModeBanner: false,
      theme: flowPostLightTheme(),
      routerConfig: buildRouter(
        initialDeepLink: initialDeepLink,
        refreshListenable: refreshListenable,
        pendingDeepLink: pendingDeepLink,
      ),
    );
  }
}

/// Shown when configuration fails: the app never boots silently (spec: fail fast).
class ConfigErrorApp extends StatelessWidget {
  const ConfigErrorApp({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FlowPost Studio',
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 48),
                const SizedBox(height: 16),
                Text(
                  'FlowPost could not start',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(message, textAlign: TextAlign.center),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
