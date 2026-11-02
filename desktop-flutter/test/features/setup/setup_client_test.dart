import 'package:flowpost_desktop/features/setup/data/setup_client.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeTransport implements SetupTransport {
  SetupReply reply = const SetupReply(statusCode: 200, body: {});

  final List<Uri> urls = [];
  final List<Map<String, Object?>> bodies = [];
  final List<String?> tokens = [];
  final List<String> anonKeys = [];

  @override
  Future<SetupReply> send({
    required Uri url,
    required Map<String, Object?> body,
    required String anonKey,
    String? token,
  }) async {
    urls.add(url);
    bodies.add(body);
    anonKeys.add(anonKey);
    tokens.add(token);
    return reply;
  }
}

SetupClient _client(_FakeTransport transport) => SetupClient(
  supabaseUrl: 'https://test.supabase.co',
  anonKey: 'anon-key',
  transport: transport,
);

/// Runs [call] and hands back what it threw, or null when it did not.
Future<Object?> _failureOf(Future<void> Function() call) async {
  try {
    await call();
  } on Object catch (error) {
    return error;
  }
  return null;
}

void main() {
  group('status', () {
    test('asks config-status with the session and keeps the names that hold a value', () async {
      final transport = _FakeTransport()
        ..reply = const SetupReply(
          statusCode: 200,
          body: {
            'values': {
              'GROQ_API_KEY': true,
              'R2_BUCKET': true,
              'YT_CLIENT_ID': false,
            },
          },
        );

      final status = await _client(transport).status('session-token');

      expect(
        transport.urls.single,
        Uri.parse('https://test.supabase.co/functions/v1/config-status'),
      );
      expect(transport.tokens.single, 'session-token');
      expect(transport.anonKeys.single, 'anon-key');
      expect(status.present, {'GROQ_API_KEY', 'R2_BUCKET'});
      expect(status.hasAll(['GROQ_API_KEY', 'R2_BUCKET']), isTrue);
      expect(status.has('YT_CLIENT_ID'), isFalse);
    });

    test('a refused session is the sign-in sentence, not a crash', () async {
      final transport = _FakeTransport()
        ..reply = const SetupReply(
          statusCode: 401,
          body: {'error': 'Sign in with the license key of this server first.'},
        );

      await expectLater(
        _client(transport).status('dead-token'),
        throwsA(
          isA<SetupException>().having(
            (e) => e.error,
            'error',
            SetupError.signRequired,
          ),
        ),
      );
    });
  });

  group('store', () {
    test(
      'posts the values to operator-config and returns the names it took',
      () async {
        final transport = _FakeTransport()
          ..reply = const SetupReply(
            statusCode: 200,
            body: {
              'saved': ['GROQ_API_KEY'],
            },
          );

        final saved = await _client(transport)
            .store({'GROQ_API_KEY': 'gsk_abc123'}, 'session-token');

        expect(
          transport.urls.single,
          Uri.parse('https://test.supabase.co/functions/v1/operator-config'),
        );
        expect(transport.bodies.single, {
          'values': {'GROQ_API_KEY': 'gsk_abc123'},
        });
        expect(saved, ['GROQ_API_KEY']);
      },
    );

    test(
      'a name the server will not store is refused in the server’s words',
      () async {
        final transport = _FakeTransport()
          ..reply = const SetupReply(
            statusCode: 400,
            body: {'error': 'NOT_A_NAME is not a value this app stores.'},
          );

        final failure = await _failureOf(
          () => _client(transport).store({'NOT_A_NAME': 'x'}, 'session-token'),
        );

        expect(
          failure,
          isA<SetupException>()
              .having((e) => e.error, 'error', SetupError.refused)
              .having(
                (e) => e.message,
                'message',
                'NOT_A_NAME is not a value this app stores.',
              ),
        );
      },
    );

    test('an account that does not run the server is told so', () async {
      final transport = _FakeTransport()
        ..reply = const SetupReply(
          statusCode: 403,
          body: {
            'error':
                'Only the account that runs this server can store its keys.',
          },
        );

      await expectLater(
        _client(transport).store({'GROQ_API_KEY': 'gsk_abc'}, 'session-token'),
        throwsA(
          isA<SetupException>().having(
            (e) => e.error,
            'error',
            SetupError.notOperator,
          ),
        ),
      );
    });

    test('the value is nowhere in the failure it produces', () async {
      final transport = _FakeTransport()
        ..reply = const SetupReply(
          statusCode: 500,
          body: {'error': 'Could not store.'},
        );

      final failure = await _failureOf(
        () =>
            _client(transport)
                .store({'GROQ_API_KEY': 'gsk_do_not_log_me'}, 'session-token'),
      );

      expect(failure, isA<SetupException>());
      expect(failure.toString(), isNot(contains('gsk_do_not_log_me')));
      expect(
        (failure as SetupException).message,
        isNot(contains('gsk_do_not_log_me')),
      );
    });
  });

  group('a call that never lands', () {
    test('reports the offline sentence rather than a status code', () async {
      final transport = _FakeTransport()
        ..reply = const SetupReply(statusCode: 0, body: {}, unreachable: true);

      await expectLater(
        _client(transport).status('session-token'),
        throwsA(
          isA<SetupException>().having(
            (e) => e.error,
            'error',
            SetupError.offline,
          ),
        ),
      );
    });

    test(
      'an answer that is not the shape the function documents is unexpected',
      () async {
        final transport = _FakeTransport()
          ..reply = const SetupReply(
            statusCode: 200,
            body: {'values': 'not a map'},
          );

        await expectLater(
          _client(transport).status('session-token'),
          throwsA(
            isA<SetupException>().having(
              (e) => e.error,
              'error',
              SetupError.unexpected,
            ),
          ),
        );
      },
    );
  });
}
