import 'package:flowpost_desktop/features/accounts/data/connect_gateway.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flutter_test/flutter_test.dart';

/// Records the calls and answers the rows the test names.
class _FakeTransport implements PostsTransport {
  _FakeTransport([this.rows = const []]);

  List<Map<String, Object?>> rows;

  /// What the next call throws instead of answering.
  Object? failure;

  final List<Map<String, Object?>> bodies = [];
  final List<String?> tokens = [];

  @override
  Future<List<Map<String, Object?>>> send({
    required Map<String, Object?> body,
    String? token,
  }) async {
    bodies.add(body);
    tokens.add(token);
    final failure = this.failure;
    if (failure != null) throw failure;
    return rows;
  }
}

void main() {
  final nonce = 'a' * 64;

  test(
    'the connect address comes from the row the server answers with',
    () async {
      final transport = _FakeTransport([
        {
          'url': 'https://proj/functions/v1/youtube-auth?state=x',
          'platform': 'youtube',
        },
      ]);
      final gateway = ServerConnectGateway(
        sessionToken: 'session-1',
        transport: transport,
      );

      final url = await gateway.connectUrl(platform: 'youtube', nonce: nonce);

      expect(url, 'https://proj/functions/v1/youtube-auth?state=x');
      expect(transport.bodies.single, {
        'action': 'connect-url',
        'platform': 'youtube',
        'nonce': nonce,
      });
      // The session is what names the owner: the server never takes one from
      // the body.
      expect(transport.tokens.single, 'session-1');
    },
  );

  test(
    'an answer with no address is a failure, not an empty browser',
    () async {
      final gateway = ServerConnectGateway(
        sessionToken: 'session-1',
        transport: _FakeTransport(const [
          {'platform': 'youtube'},
        ]),
      );

      expect(
        () => gateway.connectUrl(platform: 'youtube', nonce: nonce),
        throwsA(
          isA<PostsException>().having(
            (e) => e.message,
            'message',
            'The connect could not start.',
          ),
        ),
      );
    },
  );

  test('no rows at all is the same failure', () async {
    final gateway = ServerConnectGateway(
      sessionToken: 'session-1',
      transport: _FakeTransport(),
    );

    await expectLater(
      gateway.connectUrl(platform: 'youtube', nonce: nonce),
      throwsA(isA<PostsException>()),
    );
  });

  test('a refusal is passed on with the words the server used', () async {
    final transport = _FakeTransport()
      ..failure = const PostsException(
        'Your session is no longer accepted. Activate your license.',
        kind: PostsErrorKind.rejected,
      );
    final gateway = ServerConnectGateway(
      sessionToken: 'old-session',
      transport: transport,
    );

    await expectLater(
      gateway.connectUrl(platform: 'youtube', nonce: nonce),
      throwsA(
        isA<PostsException>().having(
          (e) => e.kind,
          'kind',
          PostsErrorKind.rejected,
        ),
      ),
    );
  });

  test('a disconnect names the platform and the account row', () async {
    final transport = _FakeTransport(const [
      {'id': 'row-1'},
    ]);
    final gateway = ServerConnectGateway(
      sessionToken: 'session-1',
      transport: transport,
    );

    await gateway.disconnect(platform: 'instagram', accountId: 'ig-1');

    expect(transport.bodies.single, {
      'action': 'disconnect',
      'platform': 'instagram',
      'accountId': 'ig-1',
    });
    expect(transport.tokens.single, 'session-1');
  });

  test('a disconnect that removed nothing still counts', () async {
    // The server answers with the rows that went; an empty answer means the
    // row was already gone, which is what the caller wanted either way.
    final gateway = ServerConnectGateway(
      sessionToken: 'session-1',
      transport: _FakeTransport(),
    );

    await gateway.disconnect(platform: 'tiktok', accountId: 'tt-1');
  });
}
