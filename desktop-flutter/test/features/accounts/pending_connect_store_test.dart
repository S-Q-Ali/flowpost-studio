import 'package:flowpost_desktop/features/accounts/data/pending_connect_store.dart';
import 'package:flowpost_desktop/features/accounts/domain/connect_link.dart';
import 'package:flutter_test/flutter_test.dart';

ConnectCallback _callbackOf(PendingConnect wait, {String? platform}) =>
    ConnectCallback(
      platform: platform ?? wait.platform,
      nonce: wait.nonce,
      result: ConnectResult.connected,
    );

void main() {
  late DateTime now;
  late PendingConnectStore store;

  setUp(() {
    now = DateTime.utc(2026, 11, 2, 9, 30);
    store = PendingConnectStore(now: () => now);
  });

  test('a wait is a 32-byte nonce bound to one platform for ten minutes', () {
    final wait = store.start('tiktok');

    expect(wait.platform, 'tiktok');
    expect(wait.nonce, matches(RegExp(r'^[0-9a-f]{64}$')));
    expect(wait.expiresAt, now.add(const Duration(minutes: 10)));
  });

  test('a platform the app cannot name never gets a nonce', () {
    expect(() => store.start('myspace'), throwsArgumentError);
  });

  test('two waits never share a nonce', () {
    final first = store.start('youtube');
    final second = store.start('instagram');

    expect(first.nonce, isNot(second.nonce));
  });

  test('the nonce a wait was started with is trusted', () {
    final wait = store.start('linkedin');

    expect(store.answer(_callbackOf(wait)), ConnectAnswer.trusted);
  });

  test('a nonce used once is refused the second time', () {
    final wait = store.start('linkedin');
    store.answer(_callbackOf(wait));

    expect(store.answer(_callbackOf(wait)), ConnectAnswer.unknown);
  });

  test('a nonce nobody asked for is refused', () {
    store.start('youtube');
    final forged = ConnectCallback(
      platform: 'youtube',
      nonce: '0' * 64,
      result: ConnectResult.connected,
    );

    expect(store.answer(forged), ConnectAnswer.unknown);
  });

  test('a denied answer is still the wait it belongs to', () {
    final wait = store.start('instagram');
    final denied = ConnectCallback(
      platform: 'instagram',
      nonce: wait.nonce,
      result: ConnectResult.denied,
    );

    expect(store.answer(denied), ConnectAnswer.trusted);
  });

  test('a link naming another platform is refused and the wait stays open', () {
    final wait = store.start('tiktok');

    expect(
      store.answer(_callbackOf(wait, platform: 'mega')),
      ConnectAnswer.wrongPlatform,
    );
    expect(store.waiting(), hasLength(1));
    expect(store.answer(_callbackOf(wait)), ConnectAnswer.trusted);
  });

  test('a wait whose minute is up is refused and dropped', () {
    final wait = store.start('facebook');
    now = now.add(const Duration(minutes: 10));

    expect(store.answer(_callbackOf(wait)), ConnectAnswer.expired);
    // The dead wait is gone, so the same link is not even a wait any more.
    expect(store.answer(_callbackOf(wait)), ConnectAnswer.unknown);
  });

  test('a wait one second inside its minute is still trusted', () {
    final wait = store.start('facebook');
    now = now.add(const Duration(minutes: 9, seconds: 59));

    expect(store.answer(_callbackOf(wait)), ConnectAnswer.trusted);
  });

  test('starting again replaces the wait for that platform', () {
    final first = store.start('youtube');
    final second = store.start('youtube');

    expect(store.answer(_callbackOf(first)), ConnectAnswer.unknown);
    expect(store.answer(_callbackOf(second)), ConnectAnswer.trusted);
  });

  test('the open waits are listed and a spent one is not', () {
    final youtube = store.start('youtube');
    store.start('mega');
    expect(store.waiting().map((w) => w.platform), ['youtube', 'mega']);

    store.answer(_callbackOf(youtube));
    expect(store.waiting().map((w) => w.platform), ['mega']);

    now = now.add(const Duration(minutes: 11));
    expect(store.waiting(), isEmpty);
  });
}
