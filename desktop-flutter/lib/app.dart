import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/config/config_controller.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/identity/data/identity_models.dart';
import 'features/identity/identity_controller.dart';

class FlowPostApp extends ConsumerStatefulWidget {
  const FlowPostApp({
    super.key,
    this.initialDeepLink,
    this.refreshListenable,
    this.pendingDeepLink,
    this.identityGuard = false,
  });

  final String? initialDeepLink;
  final Listenable? refreshListenable;

  /// Returns a route to navigate to now, or null to stay put; must consume
  /// the pending value so redirects don't loop.
  final String? Function()? pendingDeepLink;

  /// Set by [main]; page-level widget tests build the app without identity.
  final bool identityGuard;

  @override
  ConsumerState<FlowPostApp> createState() => _FlowPostAppState();
}

class _FlowPostAppState extends ConsumerState<FlowPostApp> {
  final _AuthRefresh _authRefresh = _AuthRefresh();

  // Built once so navigation state survives rebuilds; the redirect reads the
  // config when it runs, so a save or a clear is picked up on the next move.
  late final GoRouter _router = buildRouter(
    initialDeepLink: widget.initialDeepLink,
    refreshListenable: widget.refreshListenable == null
        ? _authRefresh
        : Listenable.merge([widget.refreshListenable!, _authRefresh]),
    pendingDeepLink: widget.pendingDeepLink,
    needsSetup: () => ref.read(configControllerProvider).needsSetup,
    authState: widget.identityGuard
        ? () => ref.read(identityControllerProvider).value
        : null,
    authLoading: widget.identityGuard
        ? () => ref.read(identityControllerProvider).isLoading
        : null,
  );

  @override
  void dispose() {
    _authRefresh.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.identityGuard) {
      ref.listen<AsyncValue<AuthState>>(identityControllerProvider, (_, _) {
        _authRefresh.notify();
      });
    }
    return MaterialApp.router(
      title: 'FlowPost Studio',
      debugShowCheckedModeBanner: false,
      theme: flowPostLightTheme(),
      routerConfig: _router,
    );
  }
}

/// Routes refresh when the sign-in state changes, not only on deep links.
class _AuthRefresh extends ChangeNotifier {
  void notify() => notifyListeners();
}
