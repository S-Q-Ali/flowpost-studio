import 'package:flowpost_desktop/app.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/features/accounts/accounts_providers.dart';
import 'package:flowpost_desktop/features/accounts/data/accounts_repository.dart';
import 'package:flowpost_desktop/features/accounts/domain/connected_account.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/config_overrides.dart';

const _config = AppConfig(
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-anon',
  updateManifestUrl: '',
);

class _MemoryAccountsRepository implements AccountsRepository {
  _MemoryAccountsRepository([List<ConnectedAccount>? initial])
    : accounts = initial ?? seedAccounts;

  List<ConnectedAccount> accounts;

  @override
  Future<List<ConnectedAccount>> load() async => accounts;

  @override
  Future<void> save(List<ConnectedAccount> accounts) async {
    this.accounts = accounts;
  }
}

class _FailingAccountsRepository implements AccountsRepository {
  @override
  Future<List<ConnectedAccount>> load() async =>
      throw StateError('disk unavailable');

  @override
  Future<void> save(List<ConnectedAccount> accounts) async {}
}

class _SaveFailingRepository extends _MemoryAccountsRepository {
  @override
  Future<void> save(List<ConnectedAccount> accounts) async =>
      throw StateError('disk full');
}

Future<void> _pumpApp(
  WidgetTester tester,
  AccountsRepository repository, {
  String initialLocation = '/accounts',
  Size size = const Size(1280, 800),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        seededConfig(_config),
        accountsRepositoryProvider.overrideWith((ref) => repository),
      ],
      child: FlowPostApp(initialDeepLink: initialLocation),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('shows the six platform cards', (tester) async {
    await _pumpApp(tester, _MemoryAccountsRepository());

    for (final platform in SocialPlatform.values) {
      expect(find.byKey(Key('account-${platform.name}')), findsOneWidget);
    }
  });

  testWidgets('connect and disconnect update the stored account', (
    tester,
  ) async {
    final repository = _MemoryAccountsRepository();
    await _pumpApp(tester, repository);
    final card = find.byKey(const Key('account-youtube'));

    expect(
      find.descendant(of: card, matching: find.text('Not connected')),
      findsOneWidget,
    );

    await tester.tap(find.descendant(of: card, matching: find.text('Connect')));
    await tester.pumpAndSettle();

    expect(
      repository.accounts
          .firstWhere((account) => account.platform == SocialPlatform.youtube)
          .status,
      AccountStatus.connected,
    );
    expect(
      find.descendant(of: card, matching: find.text('Connected')),
      findsOneWidget,
    );

    await tester.tap(
      find.descendant(of: card, matching: find.text('Disconnect')),
    );
    await tester.pumpAndSettle();

    expect(
      repository.accounts
          .firstWhere((account) => account.platform == SocialPlatform.youtube)
          .status,
      AccountStatus.disconnected,
    );
  });

  testWidgets('expired account offers reconnect', (tester) async {
    final repository = _MemoryAccountsRepository([
      const ConnectedAccount(
        platform: SocialPlatform.tiktok,
        accountName: 'FlowPost Studio',
        status: AccountStatus.expired,
      ),
    ]);
    await _pumpApp(tester, repository);
    final card = find.byKey(const Key('account-tiktok'));

    expect(
      find.descendant(of: card, matching: find.text('Expired')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: card, matching: find.text('Reconnect')),
      findsOneWidget,
    );
  });

  testWidgets('load failure shows a readable error', (tester) async {
    await _pumpApp(tester, _FailingAccountsRepository());

    expect(find.text('Could not load your accounts.'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('save failure leaves the card unchanged and shows a message', (
    tester,
  ) async {
    await _pumpApp(tester, _SaveFailingRepository());
    final card = find.byKey(const Key('account-youtube'));

    await tester.tap(find.descendant(of: card, matching: find.text('Connect')));
    await tester.pumpAndSettle();

    expect(
      find.descendant(of: card, matching: find.text('Not connected')),
      findsOneWidget,
    );
    expect(find.text('Could not save the account. Try again.'), findsOneWidget);
  });

  testWidgets('cards grow with large text at the minimum window size', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await _pumpApp(
      tester,
      _MemoryAccountsRepository(),
      size: const Size(1024, 640),
    );

    expect(tester.takeException(), isNull);
    for (final platform in SocialPlatform.values) {
      expect(find.byKey(Key('account-${platform.name}')), findsOneWidget);
    }
  });

  testWidgets('navigation rail moves between screens', (tester) async {
    await _pumpApp(tester, _MemoryAccountsRepository(), initialLocation: '/');

    expect(
      find.text('The native desktop experience starts here.'),
      findsOneWidget,
    );

    await tester.tap(find.text('Accounts'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('account-youtube')), findsOneWidget);

    await tester.tap(find.text('Calendar'));
    await tester.pumpAndSettle();
    // The calendar is real now; with no session it says what it needs.
    expect(find.text('Sign in required to see the calendar.'), findsOneWidget);

    await tester.tap(find.text('Settings'));
    await tester.pumpAndSettle();
    expect(find.text('Not signed in'), findsOneWidget);
    expect(find.text('This build has no update source.'), findsOneWidget);
  });
}
