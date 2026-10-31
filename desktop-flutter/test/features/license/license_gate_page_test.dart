import 'dart:async';

import 'package:flowpost_desktop/features/license/data/license_client.dart';
import 'package:flowpost_desktop/features/license/data/license_models.dart';
import 'package:flowpost_desktop/features/license/data/license_service.dart';
import 'package:flowpost_desktop/features/license/data/license_store.dart';
import 'package:flowpost_desktop/features/license/license_providers.dart';
import 'package:flowpost_desktop/features/license/presentation/license_gate_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeApi implements LicenseApi {
  LicenseGrant? grant;
  LicenseException? failure;
  Completer<LicenseGrant>? pending;
  final List<String> keys = [];

  @override
  Future<LicenseGrant> activate(String key) async {
    keys.add(key);
    final pending = this.pending;
    if (pending != null) return pending.future;
    final failure = this.failure;
    if (failure != null) throw failure;
    return grant!;
  }
}

class _MemoryStore implements LicenseStore {
  LicenseRecord? record;

  @override
  Future<LicenseRecord?> read() async => record;

  @override
  Future<void> write(LicenseRecord record) async => this.record = record;

  @override
  Future<void> clear() async => record = null;
}

void main() {
  late _FakeApi api;
  late _MemoryStore store;

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          licenseServiceProvider.overrideWithValue(
            LicenseService(api: api, store: store),
          ),
        ],
        child: const MaterialApp(home: LicenseGatePage()),
      ),
    );
    await tester.pumpAndSettle();
  }

  setUp(() {
    api = _FakeApi()
      ..grant = LicenseGrant(
        token: 'token-1',
        expiresAt: DateTime.utc(2099, 1, 1),
      );
    store = _MemoryStore();
  });

  testWidgets('a valid key unlocks the app', (tester) async {
    await pumpPage(tester);

    await tester.enterText(
      find.byKey(const Key('license-key')),
      'flowpost-license-key-0001',
    );
    await tester.tap(find.byKey(const Key('license-submit')));
    await tester.pumpAndSettle();

    expect(api.keys, ['flowpost-license-key-0001']);
    expect(store.record?.token, 'token-1');
    expect(find.byKey(const Key('license-error')), findsNothing);
  });

  testWidgets('an invalid key is explained and cleared from the field', (
    tester,
  ) async {
    api.failure = const LicenseException(LicenseError.invalidKey);
    await pumpPage(tester);

    await tester.enterText(find.byKey(const Key('license-key')), 'wrong-key');
    await tester.tap(find.byKey(const Key('license-submit')));
    await tester.pumpAndSettle();

    expect(find.text('This license key is not valid.'), findsOneWidget);
    final field = tester.widget<TextField>(
      find.byKey(const Key('license-key')),
    );
    expect(field.controller?.text, isEmpty);
  });

  testWidgets('a lockout keeps the server countdown', (tester) async {
    api.failure = const LicenseException(
      LicenseError.rateLimited,
      serverMessage: 'Too many attempts. Try again in 14 minutes.',
    );
    await pumpPage(tester);

    await tester.enterText(find.byKey(const Key('license-key')), 'key-1');
    await tester.tap(find.byKey(const Key('license-submit')));
    await tester.pumpAndSettle();

    expect(
      find.text('Too many attempts. Try again in 14 minutes.'),
      findsOneWidget,
    );
  });

  testWidgets('a dead network says so without blaming the key', (tester) async {
    api.failure = const LicenseException(LicenseError.offline);
    await pumpPage(tester);

    await tester.enterText(find.byKey(const Key('license-key')), 'key-1');
    await tester.tap(find.byKey(const Key('license-submit')));
    await tester.pumpAndSettle();

    expect(
      find.text("Can't reach FlowPost. Check your connection."),
      findsOneWidget,
    );
  });

  testWidgets('an empty field is refused before any call', (tester) async {
    await pumpPage(tester);

    await tester.tap(find.byKey(const Key('license-submit')));
    await tester.pumpAndSettle();

    expect(api.keys, isEmpty);
    expect(find.text('Enter your license key.'), findsOneWidget);
  });

  testWidgets('the submit is busy and disabled while the call runs', (
    tester,
  ) async {
    api.pending = Completer<LicenseGrant>();
    await pumpPage(tester);

    await tester.enterText(find.byKey(const Key('license-key')), 'key-1');
    await tester.tap(find.byKey(const Key('license-submit')));
    await tester.pump();

    expect(find.text('Checking…'), findsOneWidget);
    final button = tester.widget<FilledButton>(
      find.byKey(const Key('license-submit')),
    );
    expect(button.onPressed, isNull);

    api.pending!.complete(
      LicenseGrant(token: 'token-1', expiresAt: DateTime.utc(2099, 1, 1)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Unlock'), findsOneWidget);
  });

  testWidgets('Enter submits the key', (tester) async {
    await pumpPage(tester);

    await tester.enterText(find.byKey(const Key('license-key')), 'key-1');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    expect(api.keys, ['key-1']);
  });

  testWidgets('the key field has an accessible name', (tester) async {
    await pumpPage(tester);

    expect(find.bySemanticsLabel('License key'), findsOneWidget);
  });

  testWidgets('deactivate removes the stored grant', (tester) async {
    store.record = LicenseRecord(
      token: 'token-1',
      expiresAt: DateTime.utc(2099, 1, 1),
      key: 'key-1',
    );
    await pumpPage(tester);

    await tester.tap(find.byKey(const Key('license-deactivate')));
    await tester.pumpAndSettle();

    expect(store.record, isNull);
  });

  testWidgets('a restored grant shows the current license', (tester) async {
    store.record = LicenseRecord(
      token: 'token-1',
      expiresAt: DateTime.utc(2099, 1, 1),
      key: 'key-1',
    );
    await pumpPage(tester);

    expect(find.textContaining('Active'), findsOneWidget);
    expect(find.byKey(const Key('license-error')), findsNothing);
  });
}
