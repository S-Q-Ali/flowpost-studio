import 'dart:convert';
import 'dart:io';

import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flutter_test/flutter_test.dart';

/// A transport that answers from memory.
class _FakeTransport implements PostsTransport {
  final List<Map<String, Object?>> bodies = [];
  final List<String?> tokens = [];

  /// The rows the function answers with.
  List<Map<String, Object?>> rows = const [];

  @override
  Future<List<Map<String, Object?>>> send({
    required Map<String, Object?> body,
    String? token,
  }) async {
    bodies.add(body);
    tokens.add(token);
    return rows;
  }
}

PostsApiRepository _repository(_FakeTransport transport, {String? token}) {
  return PostsApiRepository(sessionToken: token, transport: transport);
}

final draft = PostDraft(
  id: '5c1f0a3e-7f5b-4a0e-9a4e-2f7c1d8b0a11',
  videoId: 'video-1',
  platform: 'instagram',
  accountId: 'ig-1',
  postType: 'feed',
  scheduledAt: DateTime.utc(2026, 10, 29, 12),
  status: 'processing',
);

void main() {
  test('a new post id is a v4 uuid', () {
    expect(
      newPostId(),
      matches(
        RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ),
      ),
    );
  });

  test('two new post ids differ', () {
    expect(newPostId(), isNot(newPostId()));
  });

  test('the insert is one call to the posts function', () async {
    final transport = _FakeTransport()
      ..rows = [
        {'id': draft.id},
      ];

    await _repository(transport, token: 'license-session').insert(draft);

    expect(transport.bodies.single['action'], 'insert');
    expect(transport.tokens.single, 'license-session');
  });

  test('the row carries the platform, the account and the post type', () async {
    final transport = _FakeTransport()
      ..rows = [
        {'id': draft.id},
      ];

    await _repository(transport, token: 'license-session').insert(draft);

    final row = transport.bodies.single['row']! as Map<String, Object?>;
    expect(row['platform'], 'instagram');
    expect(row['account_id'], 'ig-1');
    expect(row['post_type'], 'feed');
    expect(row['video_id'], 'video-1');
    expect(row['status'], 'processing');
    expect(row['captions_enabled'], isTrue);
  });

  test('the row does not name an owner the client could fake', () async {
    final transport = _FakeTransport()
      ..rows = [
        {'id': draft.id},
      ];

    await _repository(transport, token: 'license-session').insert(draft);

    final row = transport.bodies.single['row']! as Map<String, Object?>;
    expect(row.containsKey('user_id'), isFalse);
  });

  test('the instant is sent in UTC', () async {
    final transport = _FakeTransport()
      ..rows = [
        {'id': draft.id},
      ];

    await _repository(transport, token: 'license-session').insert(draft);

    final row = transport.bodies.single['row']! as Map<String, Object?>;
    expect(row['scheduled_at'], endsWith('Z'));
  });

  test('the row carries the id the client picked', () async {
    final transport = _FakeTransport()
      ..rows = [
        {'id': draft.id},
      ];

    await _repository(transport, token: 'license-session').insert(draft);

    final row = transport.bodies.single['row']! as Map<String, Object?>;
    expect(row['id'], draft.id);
  });

  test('the id the client picked comes back', () async {
    final transport = _FakeTransport()
      ..rows = [
        {'id': 'a-different-id'},
      ];

    final id = await _repository(
      transport,
      token: 'license-session',
    ).insert(draft);

    expect(id, draft.id);
  });

  test('a function that answers nothing is a refused post', () async {
    final transport = _FakeTransport();

    await expectLater(
      _repository(transport, token: 'license-session').insert(draft),
      throwsA(
        isA<PostsException>().having(
          (error) => error.message,
          'message',
          'The post could not be prepared.',
        ),
      ),
    );
  });

  test('without a session nothing is written', () async {
    final transport = _FakeTransport();

    await expectLater(
      _repository(transport).insert(draft),
      throwsA(
        isA<PostsException>().having(
          (error) => error.message,
          'message',
          'Activate a license to publish.',
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
      token: 'license-session',
    ).read('post-1');

    expect(row, isNotNull);
    expect(row!.status, PostStatus.published);
    expect(row.platform, 'instagram');
    expect(transport.bodies.single, {'action': 'read', 'id': 'post-1'});
  });

  test('the publish instant comes back from the row', () async {
    final transport = _FakeTransport()
      ..rows = [
        {
          'id': 'post-1',
          'platform': 'instagram',
          'status': 'published',
          'published_at': '2026-10-29T12:00:00Z',
        },
      ];

    final row = await _repository(
      transport,
      token: 'license-session',
    ).read('post-1');

    expect(row!.publishedAt, DateTime.utc(2026, 10, 29, 12));
  });

  test('a status the database does not allow is not a success', () async {
    final transport = _FakeTransport()
      ..rows = [
        {'id': 'post-1', 'platform': 'instagram', 'status': 'unknown'},
      ];

    final row = await _repository(
      transport,
      token: 'license-session',
    ).read('post-1');

    expect(row, isNull);
  });

  test('a row that is gone reads as nothing', () async {
    final transport = _FakeTransport();

    final row = await _repository(
      transport,
      token: 'license-session',
    ).read('post-1');

    expect(row, isNull);
  });

  test('without a session the row is not asked for', () async {
    final transport = _FakeTransport();

    final row = await _repository(transport).read('post-1');

    expect(row, isNull);
    expect(transport.bodies, isEmpty);
  });

  test('a retry asks the function to move the row', () async {
    final transport = _FakeTransport()
      ..rows = [
        {'id': 'post-1'},
      ];

    final moved = await _repository(
      transport,
      token: 'license-session',
    ).rescheduleFailed('post-1', DateTime.utc(2026, 10, 29, 12));

    expect(moved, isTrue);
    expect(transport.bodies.single, {
      'action': 'retry',
      'id': 'post-1',
      'scheduledAt': '2026-10-29T12:00:00.000Z',
    });
  });

  test('a retry that changed nothing is not a retry', () async {
    final transport = _FakeTransport();

    final moved = await _repository(
      transport,
      token: 'license-session',
    ).rescheduleFailed('post-1', DateTime.utc(2026, 10, 29, 12));

    expect(moved, isFalse);
  });

  test('without a session nothing is retried', () async {
    final transport = _FakeTransport();

    final moved = await _repository(transport)
        .rescheduleFailed('post-1', DateTime.utc(2026, 10, 29, 12));

    expect(moved, isFalse);
    expect(transport.bodies, isEmpty);
  });

  group('the http transport', () {
    test('the call goes to the posts function', () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      final paths = <String>[];
      final sent = <String>[];
      final keys = <String?>[];
      server.listen((request) async {
        paths.add(request.uri.path);
        keys.add(request.headers.value('apikey'));
        sent.add(await utf8.decoder.bind(request).join());
        request.response.headers.contentType = ContentType.json;
        request.response.write('{"rows":[{"id":"post-1"}]}');
        await request.response.close();
      });

      final rows = await HttpPostsTransport(
        supabaseUrl: 'http://127.0.0.1:${server.port}',
        anonKey: 'anon',
      ).send(body: {'action': 'list'}, token: 'license-session');

      expect(rows, [
        {'id': 'post-1'},
      ]);
      expect(paths.single, '/functions/v1/posts-api');
      expect(sent.single, '{"action":"list"}');
      expect(keys.single, 'anon');
    });

    test('a dropped connection is a refused answer', () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final port = server.port;
      await server.close(force: true);

      await expectLater(
        HttpPostsTransport(
          supabaseUrl: 'http://127.0.0.1:$port',
          anonKey: 'anon',
        ).send(body: {'action': 'list'}),
        throwsA(
          isA<PostsException>()
              .having(
                (error) => error.message,
                'message',
                'The queue did not answer. Try again.',
              )
              .having((error) => error.kind, 'kind', PostsErrorKind.connection),
        ),
      );
    });

    test('a call that runs out of time did reach the server', () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      server.listen((request) async {
        await request.drain<void>();
      });

      await expectLater(
        HttpPostsTransport(
          supabaseUrl: 'http://127.0.0.1:${server.port}',
          anonKey: 'anon',
          timeout: const Duration(milliseconds: 200),
        ).send(body: {'action': 'list'}),
        throwsA(
          isA<PostsException>().having(
            (error) => error.kind,
            'kind',
            PostsErrorKind.timeout,
          ),
        ),
      );
    });

    test('an answer with an error status is a server failure', () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      server.listen((request) async {
        await request.drain<void>();
        request.response.statusCode = 500;
        await request.response.close();
      });

      await expectLater(
        HttpPostsTransport(
          supabaseUrl: 'http://127.0.0.1:${server.port}',
          anonKey: 'anon',
        ).send(body: {'action': 'list'}),
        throwsA(
          isA<PostsException>()
              .having(
                (error) => error.message,
                'message',
                'The queue did not accept the call (500).',
              )
              .having((error) => error.kind, 'kind', PostsErrorKind.server),
        ),
      );
    });

    test('a refused session is its own kind of failure', () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      server.listen((request) async {
        await request.drain<void>();
        request.response.statusCode = 401;
        await request.response.close();
      });

      await expectLater(
        HttpPostsTransport(
          supabaseUrl: 'http://127.0.0.1:${server.port}',
          anonKey: 'anon',
        ).send(body: {'action': 'list'}, token: 'dead-session'),
        throwsA(
          isA<PostsException>()
              .having(
                (error) => error.message,
                'message',
                'Your session is no longer accepted. Activate your license.',
              )
              .having((error) => error.kind, 'kind', PostsErrorKind.rejected),
        ),
      );
    });

    test('a body that is not a rows answer reads as nothing', () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      server.listen((request) async {
        await request.drain<void>();
        request.response.write('{"error":"Unauthorized"}');
        await request.response.close();
      });

      final rows = await HttpPostsTransport(
        supabaseUrl: 'http://127.0.0.1:${server.port}',
        anonKey: 'anon',
      ).send(body: {'action': 'list'});

      expect(rows, isEmpty);
    });
  });
}
