import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/config/config_controller.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

class FlowPostApp extends ConsumerStatefulWidget {
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
  ConsumerState<FlowPostApp> createState() => _FlowPostAppState();
}

class _FlowPostAppState extends ConsumerState<FlowPostApp> {
  // Built once so navigation state survives rebuilds; the redirect reads the
  // config when it runs, so a save or a clear is picked up on the next move.
  late final GoRouter _router = buildRouter(
    initialDeepLink: widget.initialDeepLink,
    refreshListenable: widget.refreshListenable,
    pendingDeepLink: widget.pendingDeepLink,
    needsSetup: () => ref.read(configControllerProvider).needsSetup,
  );

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'FlowPost Studio',
      debugShowCheckedModeBanner: false,
      theme: flowPostLightTheme(),
      routerConfig: _router,
    );
  }
}
