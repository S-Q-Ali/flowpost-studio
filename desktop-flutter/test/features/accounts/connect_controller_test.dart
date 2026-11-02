import 'dart:async';

import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/features/accounts/accounts_providers.dart';
import 'package:flowpost_desktop/features/accounts/connect_controller.dart';
import 'package:flowpost_desktop/features/accounts/data/pending_connect_store.dart';
import 'package:flowpost_desktop/features/accounts/domain/connected_account.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flutter/foundation.dart' show ValueNotifier;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:logging/logging.dart';

import '../../support/fake_accounts.dart';
import '../../support/fake_connect.dart';

const _youtube = ConnectedAccount(
  platform: SocialPlatform.youtube,
  accountName: 'FlowPost Studio',
  status: AccountStatus.connected,
  accountId: 'UC-1',
  serverPlatform: 'youtube',
);

void main() {
  late FakeConnectGateway gateway;
  late FakeBrowser browser;
  late FakeAccountsRepository repository;
  late ValueNotifier<String?> links;
  late PendingConnectStore store;
  late ProviderContainer container;
  late DateTime now;
  late List<LogRecord> records;
  late StreamSubscription<LogRecord> subscription;

  setUp(() {
    now = DateTime.utc(2026, 11, 2, 9, 30);
    gateway = FakeConnectGateway();
    browser = FakeBrowser();
    repository = FakeAccountsRepository(const []);
    links = ValueNotifier<String?>(null);
    store = PendingConnectStore(now: () => now);
    records = [];
    Logger.root.level = Level.ALL;
    subscription = Logger.root.onRecord.listen(records.add);
    container = ProviderContainer(
      overrides: [
        connectGatewayProvider.overrideWithValue(gateway),
        pendingConnectStoreProvider.overrideWithValue(store),
        connectCallbackProvider.overrideWithValue(links),
        urlLauncherProvider.overrideWithValue(browser.call),
        accountsRepositoryProvider.overrideWith((ref) => repository),
      ],
    );
    // The screen listens to the list, so an invalidation re-reads it here
    // exactly as it does in the app.
    container.listen(accountsControllerProvider, (_, _) {});
  });

  tearDown(() {
    subscription.cancel();
    container.dispose();
  });

  ConnectController controller() =>
      container.read(connectControllerProvider.notifier);

  ConnectState state() => container.read(connectControllerProvider);

  /// Starts a connect and answers the nonce it is waiting on.
  Future<String> started(String platform) async {
    await controller().start(platform);
    return store.waiting().single.nonce;
  }

  void answered(String platform, String nonce, {String result = 'connected'}) {
    links.value =
        'flowpost://connect-callback?platform=$platform&nonce=$nonce&result=$result';
  }

  test('connect asks the server, opens the browser and waits', () async {
    await controller().start('youtube');

    expect(gateway.connects.single.platform, 'youtube');
    expect(gateway.connects.single.nonce, matches(RegExp(r'^[0-9a-f]{64}$')));
    expect(
      browser.opened.single,
      Uri.parse('https://test.supabase.co/functions/v1/youtube-auth?state=x'),
    );
    expect(state().waitingOn, 'youtube');
  });

  test('a browser that will not open ends the wait and says so', () async {
    browser.opens = false;

    await controller().start('youtube');

    expect(state().waitingOn, isNull);
    expect(
      state().message,
      'The browser did not open. The connect did not start.',
    );
    // Nothing is left waiting, so a callback that arrives later is not taken
    // for an answer to a connect this app never started.
    expect(store.waiting(), isEmpty);
  });

  test(
    'a server that refuses the connect says why and waits for nothing',
    () async {
      gateway.failure = const PostsException('The connect could not start.');

      await controller().start('youtube');

      expect(state().waitingOn, isNull);
      expect(state().message, 'The connect could not start.');
      expect(store.waiting(), isEmpty);
      expect(browser.opened, isEmpty);
    },
  );

  test('one connect waits at a time', () async {
    await started('youtube');

    await controller().start('tiktok');

    expect(gateway.connects, hasLength(1));
    expect(state().waitingOn, 'youtube');
  });

  test(
    'a connected callback closes the wait and reads the accounts again',
    () async {
      final nonce = await started('youtube');
      repository.accounts = const [_youtube];

      answered('youtube', nonce);
      await Future<void>.delayed(Duration.zero);

      expect(state().waitingOn, isNull);
      expect(state().message, 'Connected to YouTube.');
      expect(repository.reads, 2);
      final read = await container.read(accountsControllerProvider.future);
      expect(read.accounts, [_youtube]);
      // The link is spent: the browser reloading it changes nothing.
      final reads = repository.reads;
      answered('youtube', nonce);
      expect(repository.reads, reads);
      expect(state().message, 'Connected to YouTube.');
    },
  );

  test('a callback naming no result is not an answer', () async {
    final nonce = await started('youtube');

    links.value = 'flowpost://connect-callback?platform=youtube&nonce=$nonce';
    await Future<void>.delayed(Duration.zero);

    expect(state().waitingOn, 'youtube');
    expect(state().message, isNull);
    expect(repository.reads, 1);
  });

  test('a denied callback says the user cancelled it', () async {
    final nonce = await started('instagram');

    answered('instagram', nonce, result: 'denied');
    await Future<void>.delayed(Duration.zero);

    expect(state().waitingOn, isNull);
    expect(state().message, 'The connect was cancelled in the browser.');
  });

  test('a failed callback says the connect did not finish', () async {
    final nonce = await started('tiktok');

    answered('tiktok', nonce, result: 'failed');
    await Future<void>.delayed(Duration.zero);

    expect(state().waitingOn, isNull);
    expect(state().message, 'The connect did not finish. Start it again.');
  });

  test(
    'a callback whose ten minutes are up tells the user to start again',
    () async {
      final nonce = await started('youtube');
      now = now.add(const Duration(minutes: 11));

      answered('youtube', nonce);
      await Future<void>.delayed(Duration.zero);

      expect(state().waitingOn, isNull);
      expect(state().message, 'That connect took too long. Start it again.');
      expect(repository.reads, 1);
    },
  );

  test('a callback for a wait this app does not have is ignored', () async {
    await started('youtube');

    answered('youtube', '0' * 64);
    await Future<void>.delayed(Duration.zero);

    // The connect is still open, so the real callback can still land.
    expect(state().waitingOn, 'youtube');
    expect(repository.reads, 1);
  });

  test(
    'a callback for another platform is refused and the wait stays open',
    () async {
      final nonce = await started('youtube');

      answered('mega', nonce);
      await Future<void>.delayed(Duration.zero);

      expect(state().waitingOn, 'youtube');

      answered('youtube', nonce);
      await Future<void>.delayed(Duration.zero);

      expect(state().message, 'Connected to YouTube.');
    },
  );

  test(
    'a link that is not a connect answer is ignored without naming it',
    () async {
      await started('youtube');

      links.value = 'flowpost://focus?token=${'s' * 64}';
      await Future<void>.delayed(Duration.zero);

      expect(state().waitingOn, 'youtube');
      expect(state().message, isNull);
      expect(
        records.any((record) => record.message.contains('token=')),
        isFalse,
      );
    },
  );

  test('cancel closes the wait so a late callback changes nothing', () async {
    final nonce = await started('youtube');

    controller().stop();
    expect(state().waitingOn, isNull);
    expect(store.waiting(), isEmpty);

    answered('youtube', nonce);
    await Future<void>.delayed(Duration.zero);

    expect(state().message, isNull);
    expect(repository.reads, 1);
  });

  test('starting again after a cancel opens a fresh wait', () async {
    final first = await started('youtube');
    controller().stop();

    final second = await started('youtube');

    expect(second, isNot(first));
    expect(gateway.connects, hasLength(2));
    expect(state().waitingOn, 'youtube');
  });

  test('disconnect names the row and reads the accounts again', () async {
    await controller().disconnect(_youtube);
    await Future<void>.delayed(Duration.zero);

    expect(gateway.disconnects.single.platform, 'youtube');
    expect(gateway.disconnects.single.accountId, 'UC-1');
    expect(state().message, 'Disconnected from YouTube.');
    expect(repository.reads, 2);
  });

  test('a failed disconnect keeps the card and says why', () async {
    gateway.failure = const PostsException('The disconnect did not answer.');

    await controller().disconnect(_youtube);

    expect(state().message, 'The disconnect did not answer.');
    expect(repository.reads, 1);
  });

  test('the message has a way to dismiss it', () async {
    gateway.failure = const PostsException('The connect could not start.');
    await controller().start('youtube');

    controller().clearMessage();

    expect(state().message, isNull);
  });

  test(
    'the address the server answers with is never written to the log',
    () async {
      await controller().start('youtube');

      expect(
        records.any((record) => record.message.contains('youtube-auth')),
        isFalse,
      );
    },
  );
}
