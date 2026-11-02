import 'package:flowpost_desktop/app.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/features/accounts/accounts_providers.dart';
import 'package:flowpost_desktop/features/accounts/connect_controller.dart';
import 'package:flowpost_desktop/features/accounts/data/accounts_repository.dart';
import 'package:flowpost_desktop/features/accounts/domain/connected_account.dart';
import 'package:flowpost_desktop/features/license/license_providers.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/config_overrides.dart';
import '../../support/fake_accounts.dart';
import '../../support/fake_connect.dart';
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

const _expiredTiktok = ConnectedAccount(
  platform: SocialPlatform.tiktok,
  accountName: 'FlowPost',
  status: AccountStatus.expired,
  accountId: 'tt-1',
  serverPlatform: 'tiktok',
);

const _expiredMega = ConnectedAccount(
  platform: SocialPlatform.mega,
  accountName: 'FlowPost on MEGA',
  status: AccountStatus.expired,
  accountId: 'm-1',
  serverPlatform: 'mega',
);

late FakeConnectGateway _gateway;
late FakeBrowser _browser;
late ValueNotifier<String?> _connectLinks;

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
        connectGatewayProvider.overrideWithValue(_gateway),
        connectCallbackProvider.overrideWithValue(_connectLinks),
        urlLauncherProvider.overrideWithValue(_browser.call),
      ],
      child: FlowPostApp(initialDeepLink: initialLocation),
    ),
  );
  await tester.pumpAndSettle();
}

/// Lets the queued work run while the waiting panel spins: an indeterminate
/// progress indicator keeps scheduling frames, so `pumpAndSettle` would never
/// return.
Future<void> _flush(WidgetTester tester) async {
  for (var i = 0; i < 4; i++) {
    await tester.pump();
  }
}

void main() {
  setUp(() {
    _gateway = FakeConnectGateway();
    _browser = FakeBrowser();
    _connectLinks = ValueNotifier<String?>(null);
  });

  testWidgets('one card per account the server named', (tester) async {
    await _pumpApp(tester, FakeAccountsRepository([_youtube, _instagram]));

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
      FakeAccountsRepository([
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
    await _pumpApp(tester, FakeAccountsRepository(const []));

    expect(
      find.textContaining('No accounts yet. Connect a platform'),
      findsOneWidget,
    );
  });

  testWidgets('an offline read says the list came from this PC', (
    tester,
  ) async {
    await _pumpApp(
      tester,
      FakeAccountsRepository([_youtube, _instagram])..offline = true,
    );

    expect(
      find.text(
        'Showing the accounts this PC kept. The live list returns with '
        'a connection.',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const Key('account-youtube-UC-1')), findsOneWidget);
  });

  testWidgets('an offline read with nothing kept is still empty', (
    tester,
  ) async {
    await _pumpApp(tester, FakeAccountsRepository(const [])..offline = true);

    expect(find.textContaining('No accounts yet'), findsOneWidget);
    expect(find.textContaining('this PC kept'), findsNothing);
  });

  testWidgets('a live read does not claim to be a copy', (tester) async {
    await _pumpApp(tester, FakeAccountsRepository([_youtube, _instagram]));

    expect(find.textContaining('this PC kept'), findsNothing);
  });

  testWidgets('a refused session shows a readable error', (tester) async {
    await _pumpApp(
      tester,
      FakeAccountsRepository([_youtube, _instagram])
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
      FakeAccountsRepository([_youtube, _instagram]),
      size: const Size(1024, 640),
    );

    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('account-youtube-UC-1')), findsOneWidget);
    expect(find.byKey(const Key('account-meta-ig-1')), findsOneWidget);
  });

  testWidgets('navigation rail moves between screens', (tester) async {
    await _pumpApp(
      tester,
      FakeAccountsRepository([_youtube, _instagram]),
      initialLocation: '/',
    );

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

  testWidgets('a connect chip opens the browser and waits', (tester) async {
    await _pumpApp(tester, FakeAccountsRepository(const []));

    await tester.tap(find.byKey(const Key('connect-youtube')));
    await _flush(tester);

    expect(_gateway.connects.single.platform, 'youtube');
    expect(
      _browser.opened.single.toString(),
      startsWith('https://test.supabase.co/functions/v1/youtube-auth'),
    );
    expect(find.byKey(const Key('connect-waiting')), findsOneWidget);
    expect(find.textContaining('Waiting for YouTube'), findsOneWidget);
  });

  testWidgets('no second connect starts while one waits', (tester) async {
    await _pumpApp(tester, FakeAccountsRepository(const []));
    await tester.tap(find.byKey(const Key('connect-youtube')));
    await _flush(tester);

    await tester.tap(find.byKey(const Key('connect-tiktok')));
    await _flush(tester);

    expect(_gateway.connects, hasLength(1));
    expect(find.textContaining('Waiting for YouTube'), findsOneWidget);
  });

  testWidgets('the waiting panel can be cancelled', (tester) async {
    await _pumpApp(tester, FakeAccountsRepository(const []));
    await tester.tap(find.byKey(const Key('connect-youtube')));
    await _flush(tester);

    await tester.tap(find.byKey(const Key('connect-cancel')));
    await _flush(tester);

    expect(find.byKey(const Key('connect-waiting')), findsNothing);
    expect(_browser.opened, hasLength(1));
  });

  testWidgets('a connected callback puts the new account on the list', (
    tester,
  ) async {
    final repository = FakeAccountsRepository(const []);
    await _pumpApp(tester, repository);
    await tester.tap(find.byKey(const Key('connect-youtube')));
    await _flush(tester);

    repository.accounts = const [_youtube];
    _connectLinks.value =
        'flowpost://connect-callback?platform=youtube'
        '&nonce=${_gateway.connects.single.nonce}&result=connected';
    await _flush(tester);

    expect(find.byKey(const Key('account-youtube-UC-1')), findsOneWidget);
    expect(find.text('Connected to YouTube.'), findsOneWidget);
    expect(find.byKey(const Key('connect-waiting')), findsNothing);
  });

  testWidgets('a connect the server refuses is readable', (tester) async {
    _gateway.failure = const PostsException('The connect could not start.');
    await _pumpApp(tester, FakeAccountsRepository(const []));

    await tester.tap(find.byKey(const Key('connect-youtube')));
    await _flush(tester);

    expect(find.text('The connect could not start.'), findsOneWidget);
    expect(find.byKey(const Key('connect-waiting')), findsNothing);
  });

  testWidgets('a result the admin has read can be dismissed', (tester) async {
    await _pumpApp(tester, FakeAccountsRepository(const []));
    await tester.tap(find.byKey(const Key('connect-youtube')));
    await _flush(tester);
    _connectLinks.value =
        'flowpost://connect-callback?platform=youtube'
        '&nonce=${_gateway.connects.single.nonce}&result=denied';
    await _flush(tester);

    await tester.tap(find.byKey(const Key('connect-message-dismiss')));
    await _flush(tester);

    expect(
      find.text('The connect was cancelled in the browser.'),
      findsNothing,
    );
  });

  testWidgets('disconnect asks first, then tells the server', (tester) async {
    final repository = FakeAccountsRepository([_youtube]);
    await _pumpApp(tester, repository);

    await tester.tap(find.byKey(const Key('disconnect-youtube-UC-1')));
    await tester.pumpAndSettle();
    expect(find.text('Disconnect YouTube?'), findsOneWidget);

    repository.accounts = const [];
    await tester.tap(find.byKey(const Key('disconnect-confirm')));
    await tester.pumpAndSettle();

    expect(_gateway.disconnects.single.platform, 'youtube');
    expect(_gateway.disconnects.single.accountId, 'UC-1');
    expect(find.byKey(const Key('account-youtube-UC-1')), findsNothing);
    expect(find.text('Disconnected from YouTube.'), findsOneWidget);
  });

  testWidgets('leaving the question unanswered tells the server nothing', (
    tester,
  ) async {
    await _pumpApp(tester, FakeAccountsRepository([_youtube]));

    await tester.tap(find.byKey(const Key('disconnect-youtube-UC-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('disconnect-cancel')));
    await tester.pumpAndSettle();

    expect(_gateway.disconnects, isEmpty);
    expect(find.byKey(const Key('account-youtube-UC-1')), findsOneWidget);
  });

  testWidgets('an expired account reconnects from its card', (tester) async {
    await _pumpApp(tester, FakeAccountsRepository([_expiredTiktok]));

    await tester.tap(find.byKey(const Key('reconnect-tiktok-tt-1')));
    await _flush(tester);

    expect(_gateway.connects.single.platform, 'tiktok');
    expect(find.textContaining('Waiting for TikTok'), findsOneWidget);
  });

  testWidgets('a MEGA card cannot reconnect but can disconnect', (
    tester,
  ) async {
    await _pumpApp(tester, FakeAccountsRepository([_expiredMega]));

    // MEGA signs in inside the browser tab and has no return link the
    // desktop can wait for, so no connect is offered for it.
    expect(find.byKey(const Key('reconnect-mega-m-1')), findsNothing);
    expect(find.byKey(const Key('connect-mega')), findsNothing);
    expect(find.byKey(const Key('disconnect-mega-m-1')), findsOneWidget);
  });

  testWidgets('an account the server never gave an id has nothing to cut', (
    tester,
  ) async {
    await _pumpApp(
      tester,
      FakeAccountsRepository(const [
        ConnectedAccount(
          platform: SocialPlatform.youtube,
          accountName: 'FlowPost Studio',
          status: AccountStatus.connected,
          serverPlatform: 'youtube',
        ),
      ]),
    );

    expect(find.byKey(const Key('disconnect-youtube-')), findsNothing);
  });

  testWidgets('the screen no longer sends the admin to the web dashboard', (
    tester,
  ) async {
    await _pumpApp(tester, FakeAccountsRepository(const []));

    expect(find.textContaining('in the web dashboard'), findsNothing);
  });

  testWidgets('connect chips and card actions hold at 200% text', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await _pumpApp(
      tester,
      FakeAccountsRepository([_youtube, _instagram]),
      size: const Size(1024, 640),
    );

    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('connect-youtube')), findsOneWidget);
    expect(find.byKey(const Key('disconnect-youtube-UC-1')), findsOneWidget);
    expect(find.byKey(const Key('disconnect-meta-ig-1')), findsOneWidget);
  });
}
