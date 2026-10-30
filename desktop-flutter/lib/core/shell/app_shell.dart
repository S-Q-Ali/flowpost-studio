import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/app_theme.dart';

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.location, required this.child});

  final String location;
  final Widget child;

  static const List<_Destination> _destinations = [
    _Destination('/', 'Home'),
    _Destination('/accounts', 'Accounts'),
    _Destination('/upload', 'Upload', alsoCovers: ['/publish']),
    _Destination('/queue', 'Queue'),
    _Destination('/calendar', 'Calendar'),
    _Destination('/settings', 'Settings'),
  ];

  /// Literal `Icons` calls keep the release icon tree-shaker from dropping
  /// icons that would otherwise only be reachable through a field.
  static Widget _icon(String route, {required bool selected}) =>
      switch (route) {
        '/' =>
          selected
              ? const Icon(Icons.home_rounded)
              : const Icon(Icons.home_outlined),
        '/accounts' =>
          selected
              ? const Icon(Icons.account_circle)
              : const Icon(Icons.account_circle_outlined),
        '/upload' =>
          selected
              ? const Icon(Icons.cloud_upload_rounded)
              : const Icon(Icons.cloud_upload_outlined),
        '/queue' =>
          selected
              ? const Icon(Icons.list_alt_rounded)
              : const Icon(Icons.list_alt_outlined),
        '/calendar' =>
          selected
              ? const Icon(Icons.calendar_month_rounded)
              : const Icon(Icons.calendar_month_outlined),
        '/settings' =>
          selected
              ? const Icon(Icons.settings_rounded)
              : const Icon(Icons.settings_outlined),
        _ => const Icon(Icons.circle_outlined),
      };

  @override
  Widget build(BuildContext context) {
    final selected = _destinations.indexWhere(
      (destination) =>
          destination.route == location ||
          destination.alsoCovers.contains(location),
    );
    return Scaffold(
      body: Row(
        children: [
          NavigationRail(
            selectedIndex: selected < 0 ? 0 : selected,
            onDestinationSelected: (index) =>
                context.go(_destinations[index].route),
            labelType: NavigationRailLabelType.all,
            leading: const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Tooltip(
                message: 'FlowPost Studio',
                child: Icon(
                  Icons.campaign_rounded,
                  color: FlowPostColors.primary,
                ),
              ),
            ),
            destinations: [
              for (final destination in _destinations)
                NavigationRailDestination(
                  icon: _icon(destination.route, selected: false),
                  selectedIcon: _icon(destination.route, selected: true),
                  label: Text(destination.label),
                ),
            ],
          ),
          const VerticalDivider(width: 1),
          Expanded(child: child),
        ],
      ),
    );
  }
}

class _Destination {
  const _Destination(this.route, this.label, {this.alsoCovers = const []});

  final String route;
  final String label;

  /// The other paths that belong to this destination.
  final List<String> alsoCovers;
}
