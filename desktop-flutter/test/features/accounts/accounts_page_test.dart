import 'package:flowpost_desktop/app.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/features/accounts/accounts_providers.dart';
import 'package:flowpost_desktop/features/accounts/data/accounts_repository.dart';
import 'package:flowpost_desktop/features/accounts/domain/connected_account.dart';
import 'package:flowpost_desktop/features/license/license_providers.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/config_overrides.dart';
import '../../support/fake_license.dart';

const _config = AppConfig(
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-anon',
  updateManifestUrl: '',
);

const _youtube = ConnectedAccount(
  platform: SocialPlatform.youtube,
  accountName: 'FlowPost Studio',
  status: AccountStatus.connected,
  accountId: 'UC-1',
  serverPlatform: 'youtube',
);

const _instagram = ConnectedAccount(
  platform: SocialPlatform.meta,
  accountName: 'flowpost.studio',
  status: AccountStatus.connected,
  accountId: 'ig-1',
  serverPlatform: 'instagram',
);

/// Answers what the test names, so each state of the screen has its own.
class _FakeAccountsRepository implements AccountsRepository {
  _FakeAccountsRepository([List<ConnectedAccount>? accounts])
    : accounts = accounts ?? [_youtube, _instagram];

  List<ConnectedAccount> accounts;

  /// Whether the answer came from this PC rather than the server.
  bool offline = false;

  /// What the read throws instead of answering.
  Object? error;

  int reads = 0;

  @override
  Future<AccountsRead> read() async {
    reads++;
    if (error != null) throw error!;
    return AccountsRead(accounts: accounts, offline: offline);
  }
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
        licenseStoreProvider.overrideWithValue(MemoryLicenseStore()),
      ],
      child: FlowPostApp(initialDeepLink: initialLocation),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('one card per account the server named', (tester) async {
    await _pumpApp(tester, _FakeAccountsRepository());

    expect(find.byKey(const Key('account-youtube-UC-1')), findsOneWidget);
    expect(find.byKey(const Key('account-meta-ig-1')), findsOneWidget);
    expect(find.text('FlowPost Studio'), findsOneWidget);
    expect(find.text('Instagram & Facebook'), findsOneWidget);
    // The list is the server's, so no card is offered for a platform that
    // was never connected.
    expect(find.byKey(const Key('account-mega-')), findsNothing);
  });

  testWidgets('an account that is not connected says so', (tester) async {
    await _pumpApp(
      tester,
      _FakeAccountsRepository([
        const ConnectedAccount(
          platform: SocialPlatform.tiktok,
          accountName: 'FlowPost',
          status: AccountStatus.expired,
          accountId: 'tt-1',
          serverPlatform: 'tiktok',
        ),
      ]),
    );

    final card = find.byKey(const Key('account-tiktok-tt-1'));
    expect(
      find.descendant(of: card, matching: find.text('Expired')),
      findsOneWidget,
    );
  });

  testWidgets('no account is the empty state, not six placeholders', (
    tester,
  ) async {
    await _pumpApp(tester, _FakeAccountsRepository(const []));

    expect(find.text('No accounts yet.'), findsOneWidget);
  });

  testWidgets('an offline read says the list came from this PC', (
    tester,
  ) async {
    await _pumpApp(tester, _FakeAccountsRepository()..offline = true);

    expect(
      find.text(
        'Showing the accounts this PC kept. Reconnect to see the live '
        'list.',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const Key('account-youtube-UC-1')), findsOneWidget);
  });

  testWidgets('an offline read with nothing kept is still empty', (
    tester,
  ) async {
    await _pumpApp(tester, _FakeAccountsRepository(const [])..offline = true);

    expect(find.text('No accounts yet.'), findsOneWidget);
  });

  testWidgets('a live read does not claim to be a copy', (tester) async {
    await _pumpApp(tester, _FakeAccountsRepository());

    expect(find.textContaining('this PC kept'), findsNothing);
  });

  testWidgets('a refused session shows a readable error', (tester) async {
    await _pumpApp(
      tester,
      _FakeAccountsRepository()
        ..error = const PostsException(
          'Your session is no longer accepted.',
          kind: PostsErrorKind.rejected,
        ),
    );

    expect(find.text('Could not load your accounts.'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('cards grow with large text at the minimum window size', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await _pumpApp(
      tester,
      _FakeAccountsRepository(),
      size: const Size(1024, 640),
    );

    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('account-youtube-UC-1')), findsOneWidget);
    expect(find.byKey(const Key('account-meta-ig-1')), findsOneWidget);
  });

  testWidgets('navigation rail moves between screens', (tester) async {
    await _pumpApp(tester, _FakeAccountsRepository(), initialLocation: '/');

    expect(
      find.text('The native desktop experience starts here.'),
      findsOneWidget,
    );

    await tester.tap(find.text('Accounts'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('account-youtube-UC-1')), findsOneWidget);

    await tester.tap(find.text('Calendar'));
    await tester.pumpAndSettle();
    // The calendar is real now; with no session it says what it needs.
    expect(
      find.text('Activate a license to see the calendar.'),
      findsOneWidget,
    );

    await tester.tap(find.text('Settings'));
    await tester.pumpAndSettle();
    expect(find.text('No active license.'), findsOneWidget);
    expect(find.text('This build has no update source.'), findsOneWidget);
  });
}
