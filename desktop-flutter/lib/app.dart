import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/config/config_controller.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/license/data/license_models.dart';
import 'features/license/license_controller.dart';

class FlowPostApp extends ConsumerStatefulWidget {
  const FlowPostApp({
    super.key,
    this.initialDeepLink,
    this.refreshListenable,
    this.pendingDeepLink,
    this.licenseGuard = false,
  });

  final String? initialDeepLink;
  final Listenable? refreshListenable;

  /// Returns a route to navigate to now, or null to stay put; must consume
  /// the pending value so redirects don't loop.
  final String? Function()? pendingDeepLink;

  /// Set by [main]; page-level widget tests build the app without the gate.
  final bool licenseGuard;

  @override
  ConsumerState<FlowPostApp> createState() => _FlowPostAppState();
}

class _FlowPostAppState extends ConsumerState<FlowPostApp> {
  final _RouterRefresh _routerRefresh = _RouterRefresh();

  // Built once so navigation state survives rebuilds; the redirect reads the
  // config when it runs, so a save or a clear is picked up on the next move.
  late final GoRouter _router = buildRouter(
    initialDeepLink: widget.initialDeepLink,
    refreshListenable: widget.refreshListenable == null
        ? _routerRefresh
        : Listenable.merge([widget.refreshListenable!, _routerRefresh]),
    pendingDeepLink: widget.pendingDeepLink,
    needsSetup: () => ref.read(configControllerProvider).needsSetup,
    licenseState: widget.licenseGuard
        ? () => ref.read(licenseControllerProvider).value
        : null,
    licenseLoading: widget.licenseGuard ? _licenseLoading : null,
  );

  /// True only before the first state is known; an activation keeps the
  /// previous state, so the license screen shows its own busy state.
  bool _licenseLoading() {
    final current = ref.read(licenseControllerProvider);
    return current.isLoading && !current.hasValue;
  }

  @override
  void dispose() {
    _routerRefresh.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.licenseGuard) {
      ref.listen<AsyncValue<LicenseState>>(licenseControllerProvider, (_, _) {
        _routerRefresh.notify();
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

/// Routes refresh when the license state changes, not only on deep links.
class _RouterRefresh extends ChangeNotifier {
  void notify() => notifyListeners();
}
