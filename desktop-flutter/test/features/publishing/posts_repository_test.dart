import 'dart:convert';
import 'dart:io';

import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flutter_test/flutter_test.dart';

/// A transport that answers from memory.
class _FakeTransport implements PostsTransport {
  final List<String> methods = [];
  final List<Uri> urls = [];
  final List<String?> bodies = [];
  final List<String?> tokens = [];

  /// The rows the table answers with.
  List<Map<String, Object?>> rows = const [];

  @override
  Future<List<Map<String, Object?>>> send({
    required String method,
    required Uri url,
    String? body,
    String? token,
  }) async {
    methods.add(method);
    urls.add(url);
    bodies.add(body);
    tokens.add(token);
    return rows;
  }
}

/// A token with the user id in the claim the Auth service puts it in.
String _token(String userId) {
  String segment(Map<String, Object?> claims) =>
      base64Url.encode(utf8.encode(jsonEncode(claims))).replaceAll('=', '');
  return '${segment({'alg': 'none'})}.${segment({'sub': userId})}.signature';
}

PostgrestPostsRepository _repository(
  _FakeTransport transport, {
  String? token,
}) {
  return PostgrestPostsRepository(
    supabaseUrl: 'https://test.supabase.co',
    anonKey: 'anon',
    token: token,
    transport: transport,
  );
}

final _draft = PostDraft(
  videoId: 'video-1',
  platform: 'instagram',
  accountId: 'ig-1',
  postType: 'feed',
  scheduledAt: DateTime.utc(2026, 10, 29, 12),
  status: 'processing',
);

void main() {
  test('the row carries the user of the token', () async {
    final transport = _FakeTransport()
      ..rows = [
        {'id': 'post-1'},
      ];

    await _repository(transport, token: _token('user-1')).insert(_draft);

    final row = jsonDecode(transport.bodies.single!) as Map<String, dynamic>;
    expect(row['user_id'], 'user-1');
    expect(transport.tokens.single, isNotNull);
  });

  test('the row carries the platform, the account and the post type', () async {
    final transport = _FakeTransport()
      ..rows = [
        {'id': 'post-1'},
      ];

    await _repository(transport, token: _token('user-1')).insert(_draft);

    final row = jsonDecode(transport.bodies.single!) as Map<String, dynamic>;
    expect(row['platform'], 'instagram');
    expect(row['account_id'], 'ig-1');
    expect(row['post_type'], 'feed');
    expect(row['video_id'], 'video-1');
    expect(row['status'], 'processing');
    expect(row['captions_enabled'], isTrue);
  });

  test('the instant is stored in UTC', () async {
    final transport = _FakeTransport()
      ..rows = [
        {'id': 'post-1'},
      ];

    await _repository(transport, token: _token('user-1')).insert(_draft);

    final row = jsonDecode(transport.bodies.single!) as Map<String, dynamic>;
    expect(row['scheduled_at'], endsWith('Z'));
  });

  test('the id of the row comes back', () async {
    final transport = _FakeTransport()
      ..rows = [
        {'id': 'post-42'},
      ];

    final id = await _repository(
      transport,
      token: _token('user-1'),
    ).insert(_draft);

    expect(id, 'post-42');
  });

  test('a table that answers nothing is a refused post', () async {
    final transport = _FakeTransport();

    await expectLater(
      _repository(transport, token: _token('user-1')).insert(_draft),
      throwsA(
        isA<PostsException>().having(
          (error) => error.message,
          'message',
          'The post could not be prepared.',
        ),
      ),
    );
  });

  test('without a token nothing is written', () async {
    final transport = _FakeTransport();

    await expectLater(
      _repository(transport).insert(_draft),
      throwsA(
        isA<PostsException>().having(
          (error) => error.message,
          'message',
          'Sign in required to publish.',
        ),
      ),
    );
    expect(transport.bodies, isEmpty);
  });

  test('a broken token does not make up an owner', () async {
    final transport = _FakeTransport();

    await expectLater(
      _repository(transport, token: 'not-a-token').insert(_draft),
      throwsA(
        isA<PostsException>().having(
          (error) => error.message,
          'message',
          'Sign in again to publish.',
        ),
      ),
    );
    expect(transport.bodies, isEmpty);
  });

  test('the row is read back with its status', () async {
    final transport = _FakeTransport()
      ..rows = [
        {'id': 'post-1', 'platform': 'instagram', 'status': 'published'},
      ];

    final row = await _repository(
      transport,
      token: _token('user-1'),
    ).read('post-1');

    expect(row, isNotNull);
    expect(row!.status, PostStatus.published);
    expect(row.platform, 'instagram');
    expect(transport.methods.single, 'GET');
    expect(transport.urls.single.queryParameters['id'], 'eq.post-1');
  });

  test('a status the database does not allow is not a success', () async {
    final transport = _FakeTransport()
      ..rows = [
        {'id': 'post-1', 'platform': 'instagram', 'status': 'unknown'},
      ];

    final row = await _repository(
      transport,
      token: _token('user-1'),
    ).read('post-1');

    expect(row, isNull);
  });

  test('a row that is gone reads as nothing', () async {
    final transport = _FakeTransport();

    final row = await _repository(
      transport,
      token: _token('user-1'),
    ).read('post-1');

    expect(row, isNull);
  });

  test('a retry only moves a row that is still failed', () async {
    final transport = _FakeTransport()
      ..rows = [
        {'id': 'post-1'},
      ];

    final moved = await _repository(
      transport,
      token: _token('user-1'),
    ).rescheduleFailed('post-1', DateTime.utc(2026, 10, 29, 12));

    expect(moved, isTrue);
    expect(transport.methods.single, 'PATCH');
    final url = transport.urls.single;
    expect(url.queryParameters['id'], 'eq.post-1');
    expect(url.queryParameters['status'], 'eq.failed');
    final body = jsonDecode(transport.bodies.single!) as Map<String, dynamic>;
    expect(body['status'], 'scheduled');
  });

  test('a retry that changed nothing is not a retry', () async {
    final transport = _FakeTransport();

    final moved = await _repository(
      transport,
      token: _token('user-1'),
    ).rescheduleFailed('post-1', DateTime.utc(2026, 10, 29, 12));

    expect(moved, isFalse);
  });

  group('the http transport', () {
    test('a dropped connection is a refused answer', () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final port = server.port;
      await server.close(force: true);

      await expectLater(
        HttpPostsTransport(anonKey: 'anon').send(
          method: 'GET',
          url: Uri.parse('http://127.0.0.1:$port/rest/v1/posts'),
        ),
        throwsA(
          isA<PostsException>().having(
            (error) => error.message,
            'message',
            'The queue did not answer. Try again.',
          ),
        ),
      );
    });

    test('a call that runs out of time is a refused answer', () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      // The server takes the request and never answers.
      server.listen((request) async {
        await request.drain<void>();
      });

      await expectLater(
        HttpPostsTransport(
          anonKey: 'anon',
          timeout: const Duration(milliseconds: 200),
        ).send(
          method: 'GET',
          url: Uri.parse('http://127.0.0.1:${server.port}/rest/v1/posts'),
        ),
        throwsA(
          isA<PostsException>().having(
            (error) => error.message,
            'message',
            'The queue did not answer. Try again.',
          ),
        ),
      );
    });
  });
}
