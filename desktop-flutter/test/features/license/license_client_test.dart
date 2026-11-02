import 'dart:convert';

import 'package:flowpost_desktop/features/license/data/license_client.dart';
import 'package:flowpost_desktop/features/license/data/license_models.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeTransport implements LicenseTransport {
  LicenseReply reply = const LicenseReply(statusCode: 200, body: {});

  final List<Uri> urls = [];
  final List<String> bodies = [];
  final List<String> keys = [];

  @override
  Future<LicenseReply> send({
    required Uri url,
    required String body,
    required String anonKey,
  }) async {
    urls.add(url);
    bodies.add(body);
    keys.add(anonKey);
    return reply;
  }
}

LicenseClient _client(_FakeTransport transport) => LicenseClient(
  supabaseUrl: 'https://test.supabase.co',
  anonKey: 'anon-key',
  transport: transport,
);

void main() {
  test(
    'activation posts the key with the anon key and returns the grant',
    () async {
      final transport = _FakeTransport()
        ..reply = const LicenseReply(
          statusCode: 200,
          body: {
            'valid': true,
            'token': 'token-1',
            'expiresAt': '2026-11-07T12:00:00.000Z',
          },
        );

      final grant = await _client(transport)
          .activate('flowpost-license-key-0001');

      expect(
        transport.urls.single,
        Uri.parse('https://test.supabase.co/functions/v1/verify-license'),
      );
      expect(transport.keys.single, 'anon-key');
      expect(jsonDecode(transport.bodies.single), {
        'licenseKey': 'flowpost-license-key-0001',
      });
      expect(grant.token, 'token-1');
      expect(grant.expiresAt, DateTime.utc(2026, 11, 7, 12));
    },
  );

  test('a 401 is the one invalid-key failure', () async {
    final transport = _FakeTransport()
      ..reply = const LicenseReply(
        statusCode: 401,
        body: {'valid': false, 'error': 'Invalid license key'},
      );

    await expectLater(
      _client(transport).activate('key'),
      throwsA(
        isA<LicenseException>().having(
          (e) => e.error,
          'error',
          LicenseError.invalidKey,
        ),
      ),
    );
  });

  test('a 429 keeps the server countdown', () async {
    final transport = _FakeTransport()
      ..reply = const LicenseReply(
        statusCode: 429,
        body: {
          'valid': false,
          'error': 'Too many attempts. Try again in 14 minutes.',
        },
      );

    await expectLater(
      _client(transport).activate('key'),
      throwsA(
        isA<LicenseException>()
            .having((e) => e.error, 'error', LicenseError.rateLimited)
            .having(
              (e) => e.message,
              'message',
              'Too many attempts. Try again in 14 minutes.',
            ),
      ),
    );
  });

  test('a call that never reached the service is offline', () async {
    final transport = _FakeTransport()
      ..reply = const LicenseReply(
        statusCode: 0,
        body: {},
        failure: LicenseError.offline,
      );

    await expectLater(
      _client(transport).activate('key'),
      throwsA(
        isA<LicenseException>().having(
          (e) => e.error,
          'error',
          LicenseError.offline,
        ),
      ),
    );
  });

  test('a 200 without a token is not accepted', () async {
    final transport = _FakeTransport()
      ..reply = const LicenseReply(statusCode: 200, body: {'valid': true});

    await expectLater(
      _client(transport).activate('key'),
      throwsA(
        isA<LicenseException>().having(
          (e) => e.error,
          'error',
          LicenseError.unexpected,
        ),
      ),
    );
  });

  test('a 200 with an unreadable expiry is not accepted', () async {
    final transport = _FakeTransport()
      ..reply = const LicenseReply(
        statusCode: 200,
        body: {'valid': true, 'token': 'token-1', 'expiresAt': 'soon'},
      );

    await expectLater(
      _client(transport).activate('key'),
      throwsA(
        isA<LicenseException>().having(
          (e) => e.error,
          'error',
          LicenseError.unexpected,
        ),
      ),
    );
  });
}
