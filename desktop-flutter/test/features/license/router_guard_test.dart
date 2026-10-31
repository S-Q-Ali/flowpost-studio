import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/router/app_router.dart';
import 'package:flowpost_desktop/features/license/data/license_client.dart';
import 'package:flowpost_desktop/features/license/data/license_models.dart';
import 'package:flowpost_desktop/features/license/data/license_service.dart';
import 'package:flowpost_desktop/features/license/data/license_store.dart';
import 'package:flowpost_desktop/features/license/license_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/config_overrides.dart';

class _NoApi implements LicenseApi {
  @override
  Future<LicenseGrant> activate(String key) => throw UnimplementedError();
}

class _ActiveStore implements LicenseStore {
  @override
  Future<LicenseRecord?> read() async => LicenseRecord(
    token: 'token-1',
    expiresAt: DateTime.utc(2100),
    key: 'key-1',
  );

  @override
  Future<void> write(LicenseRecord record) async {}

  @override
  Future<void> clear() async {}
}

void main() {
  late ProviderContainer container;

  setUp(() {
    container = ProviderContainer(
      overrides: [
        seededConfig(
          const AppConfig(
            supabaseUrl: 'https://test.supabase.co',
            supabaseAnonKey: 'test-anon',
            updateManifestUrl: '',
          ),
        ),
        licenseServiceProvider.overrideWithValue(
          LicenseService(api: _NoApi(), store: _ActiveStore()),
        ),
      ],
    );
  });

  tearDown(() => container.dispose());

  Future<void> pumpApp(
    WidgetTester tester, {
    required String initial,
    required LicenseState? license,
    bool loading = false,
    bool needsSetup = false,
    String? Function()? pendingDeepLink,
  }) async {
    final router = buildRouter(
      initialDeepLink: initial,
      needsSetup: () => needsSetup,
      licenseState: () => license,
      licenseLoading: () => loading,
      pendingDeepLink: pendingDeepLink,
    );
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pump();
  }

  final active = Active(expiresAt: DateTime.utc(2100));

  testWidgets('a locked app lands on the license screen', (tester) async {
    await pumpApp(
      tester,
      initial: '/queue',
      license: const Locked(LicenseError.missing),
    );

    expect(find.text('Unlock FlowPost'), findsOneWidget);
    expect(find.text('Queue'), findsNothing);
  });

  testWidgets('an active license opens the app shell', (tester) async {
    await pumpApp(tester, initial: '/', license: active);

    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Unlock FlowPost'), findsNothing);
  });

  testWidgets('the license screen stays reachable while active', (
    tester,
  ) async {
    await pumpApp(tester, initial: licenseRoute, license: active);

    expect(find.text('Unlock FlowPost'), findsOneWidget);
    expect(find.byKey(const Key('license-active')), findsOneWidget);
  });

  testWidgets('the starting screen shows while the grant is read', (
    tester,
  ) async {
    await pumpApp(tester, initial: '/settings', license: null, loading: true);

    expect(find.text('Starting FlowPost…'), findsOneWidget);
    expect(find.text('Unlock FlowPost'), findsNothing);
  });

  testWidgets('a stale starting route opens the app', (tester) async {
    await pumpApp(tester, initial: startingRoute, license: active);

    expect(find.text('Home'), findsOneWidget);
  });

  testWidgets('a pending link runs once the app is open', (tester) async {
    String? pending = '/queue';
    String? takePending() {
      final route = pending;
      pending = null;
      return route;
    }

    await pumpApp(
      tester,
      initial: '/',
      license: active,
      pendingDeepLink: takePending,
    );

    expect(find.text('Queue'), findsWidgets);
  });

  testWidgets('setup wins over the license gate', (tester) async {
    await pumpApp(
      tester,
      initial: '/queue',
      license: const Locked(LicenseError.missing),
      needsSetup: true,
    );

    expect(find.text('Set up FlowPost'), findsOneWidget);
    expect(find.text('Unlock FlowPost'), findsNothing);
  });
}
