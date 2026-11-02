import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/router/deep_link_dispatcher.dart';
import 'package:logging/logging.dart';

void main() {
  late List<LogRecord> records;
  late StreamSubscription<LogRecord> subscription;

  setUp(() {
    records = [];
    Logger.root.level = Level.ALL;
    subscription = Logger.root.onRecord.listen(records.add);
  });
  tearDown(() => subscription.cancel());

  DeepLinkDispatcher build({
    required ValueNotifier<String?> pending,
    required Future<void> Function() showWindow,
    ValueNotifier<String?>? connectCallback,
  }) {
    return DeepLinkDispatcher(
      pendingRoute: pending,
      showWindow: showWindow,
      log: Logger('deep-link-test'),
      allowedPaths: const ['/', '/auth-callback'],
      pendingConnect: connectCallback,
    );
  }

  test('accepted callback restores the window and queues its route', () async {
    var shown = 0;
    final pending = ValueNotifier<String?>(null);
    final dispatcher = build(pending: pending, showWindow: () async => shown++);

    expect(
      dispatcher.handle('flowpost://auth-callback?code=abc&state=xyz'),
      isTrue,
    );
    await Future<void>.delayed(Duration.zero);

    expect(shown, 1);
    expect(pending.value, '/auth-callback?code=abc&state=xyz');
  });

  test('focus link restores the window without changing the route', () async {
    var shown = 0;
    final pending = ValueNotifier<String?>(null);
    final dispatcher = build(pending: pending, showWindow: () async => shown++);

    expect(dispatcher.handle('flowpost://focus'), isTrue);
    await Future<void>.delayed(Duration.zero);

    expect(shown, 1);
    expect(pending.value, isNull);
  });

  test('unknown path is rejected, logged, and does not restore', () async {
    var shown = 0;
    final pending = ValueNotifier<String?>(null);
    final dispatcher = build(pending: pending, showWindow: () async => shown++);

    expect(dispatcher.handle('flowpost://settings?token=secret'), isFalse);
    await Future<void>.delayed(Duration.zero);

    expect(shown, 0);
    expect(pending.value, isNull);
    expect(
      records.any((record) => record.message.contains('/settings')),
      isTrue,
    );
    expect(records.any((record) => record.message.contains('secret')), isFalse);
  });

  test('malformed link is rejected without leaking its query', () async {
    var shown = 0;
    final pending = ValueNotifier<String?>(null);
    final dispatcher = build(pending: pending, showWindow: () async => shown++);

    expect(dispatcher.handle('not a flowpost link?code=secret'), isFalse);
    await Future<void>.delayed(Duration.zero);

    expect(shown, 0);
    expect(records.any((record) => record.message.contains('secret')), isFalse);
  });

  test('routeFor resolves the initial link without showing the window', () {
    final pending = ValueNotifier<String?>(null);
    final dispatcher = build(pending: pending, showWindow: () async {});

    expect(
      dispatcher.routeFor('flowpost://auth-callback?code=abc'),
      '/auth-callback?code=abc',
    );
    expect(dispatcher.routeFor(null), isNull);
  });

  test('a connect callback is handed over, not routed', () async {
    var shown = 0;
    final pending = ValueNotifier<String?>(null);
    final connect = ValueNotifier<String?>(null);
    final dispatcher = build(
      pending: pending,
      showWindow: () async => shown++,
      connectCallback: connect,
    );
    final link =
        'flowpost://connect-callback?platform=youtube&nonce=${'a' * 64}&result=connected';

    expect(dispatcher.handle(link), isTrue);
    await Future<void>.delayed(Duration.zero);

    expect(shown, 1);
    expect(connect.value, link);
    // It names no screen, so the router is not sent anywhere.
    expect(pending.value, isNull);
  });

  test('a cold-start connect callback is handed over without a route', () {
    final pending = ValueNotifier<String?>(null);
    final connect = ValueNotifier<String?>(null);
    final dispatcher = build(
      pending: pending,
      showWindow: () async {},
      connectCallback: connect,
    );
    final link =
        'flowpost://connect-callback?platform=tiktok&nonce=${'b' * 64}';

    expect(dispatcher.routeFor(link), isNull);
    expect(connect.value, link);
  });

  test(
    'a connect callback nobody listens to is rejected like any path',
    () async {
      var shown = 0;
      final pending = ValueNotifier<String?>(null);
      final dispatcher = build(
        pending: pending,
        showWindow: () async => shown++,
      );

      expect(
        dispatcher.handle(
          'flowpost://connect-callback?platform=youtube&nonce=${'c' * 64}',
        ),
        isFalse,
      );
      await Future<void>.delayed(Duration.zero);

      expect(shown, 0);
      expect(pending.value, isNull);
    },
  );
}
