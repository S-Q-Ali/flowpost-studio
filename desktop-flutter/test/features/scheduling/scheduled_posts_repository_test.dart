import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/scheduling/data/scheduled_posts_repository.dart';
import 'package:flowpost_desktop/features/scheduling/domain/post_edit.dart';
import 'package:flowpost_desktop/features/scheduling/domain/scheduled_post.dart';
import 'package:flutter_test/flutter_test.dart';

/// A transport that answers from memory, one answer per call.
class _FakeTransport implements PostsTransport {
  final List<Map<String, Object?>> bodies = [];
  final List<String?> tokens = [];

  /// The rows each call answers with, in call order. Past the end the
  /// function answers nothing.
  final List<List<Map<String, Object?>>> answers = [];

  int _call = 0;

  @override
  Future<List<Map<String, Object?>>> send({
    required Map<String, Object?> body,
    String? token,
  }) async {
    bodies.add(body);
    tokens.add(token);
    final answer = _call < answers.length
        ? answers[_call]
        : const <Map<String, Object?>>[];
    _call++;
    return answer;
  }
}

PostsApiScheduledPostsRepository _repository(
  _FakeTransport transport, {
  String? token = 'token',
}) {
  return PostsApiScheduledPostsRepository(
    sessionToken: token,
    transport: transport,
  );
}

Map<String, Object?> _row({
  String id = 'post-1',
  String status = 'scheduled',
  String accountId = 'ig-1',
  String? scheduledAt = '2026-10-29T08:30:00Z',
  String? publishedAt,
  String? title = 'A video',
}) {
  return {
    'id': id,
    'platform': 'instagram',
    'status': status,
    'account_id': accountId,
    'post_type': 'feed',
    'scheduled_at': scheduledAt,
    'published_at': publishedAt,
    'caption': 'A caption',
    'hashtags': null,
    'contains_altered_content': false,
    'videos': {'title': title, 'thumbnail_url': null},
  };
}

void main() {
  test('without a session the queue is not read', () async {
    final transport = _FakeTransport();

    await expectLater(
      _repository(transport, token: null).load(),
      throwsA(
        isA<PostsException>().having(
          (error) => error.message,
          'message',
          'Activate a license to see the queue.',
        ),
      ),
    );
    expect(transport.bodies, isEmpty);
  });

  test('an empty answer is an empty page, not an error', () async {
    final page = await _repository(_FakeTransport()).load();

    expect(page.posts, isEmpty);
    expect(page.hasMore, isFalse);
  });

  test(
    'the page asks for one row past its size, so it knows there is more',
    () async {
      final transport = _FakeTransport()
        ..answers.add([_row(id: 'p1'), _row(id: 'p2'), _row(id: 'p3')]);

      final page = await _repository(transport).load(limit: 2);

      expect(page.posts, hasLength(2));
      expect(page.hasMore, isTrue);
      expect(transport.bodies.first, {
        'action': 'list',
        'offset': 0,
        'limit': 3,
      });
    },
  );

  test('a page with no extra row has no more', () async {
    final transport = _FakeTransport()
      ..answers.add([_row(id: 'p1'), _row(id: 'p2')]);

    final page = await _repository(transport).load(limit: 2);

    expect(page.hasMore, isFalse);
  });

  test('the next page starts where the last one ended', () async {
    final transport = _FakeTransport();

    await _repository(transport).load(offset: 200);

    expect(transport.bodies.first['offset'], 200);
  });

  test('the filter asks the function for that status', () async {
    final transport = _FakeTransport();

    await _repository(transport).load(filter: QueueFilter.scheduled);

    expect(transport.bodies.first['status'], 'scheduled');
  });

  test('the whole queue asks for no status', () async {
    final transport = _FakeTransport();

    await _repository(transport).load(filter: QueueFilter.all);

    expect(transport.bodies.first.containsKey('status'), isFalse);
  });

  test('the platform filter asks the function for that platform', () async {
    final transport = _FakeTransport();

    await _repository(transport).load(platform: PublishPlatform.instagram);

    expect(transport.bodies.first['platform'], 'instagram');
  });

  test('the whole queue asks for no platform', () async {
    final transport = _FakeTransport();

    await _repository(transport).load();

    expect(transport.bodies.first.containsKey('platform'), isFalse);
  });

  test('a row is read with its media, its status and its times', () async {
    final transport = _FakeTransport()
      ..answers.add([_row(publishedAt: '2026-10-29T09:00:00Z')]);

    final page = await _repository(transport).load();
    final post = page.posts.single;

    expect(post.id, 'post-1');
    expect(post.platform, PublishPlatform.instagram);
    expect(post.status, PostStatus.scheduled);
    expect(post.videoTitle, 'A video');
    expect(post.caption, 'A caption');
    expect(post.scheduledAt, DateTime.utc(2026, 10, 29, 8, 30));
    expect(post.publishedAt, DateTime.utc(2026, 10, 29, 9));
  });

  test('a status the database does not allow is left out', () async {
    final transport = _FakeTransport()
      ..answers.add([_row(id: 'p1', status: 'cancelled'), _row(id: 'p2')]);

    final page = await _repository(transport).load();

    expect(page.posts.single.id, 'p2');
  });

  test(
    'a platform this build does not know is not shown as a known one',
    () async {
      final transport = _FakeTransport()
        ..answers.add([
          {..._row(), 'platform': 'threads'},
        ]);

      final post = (await _repository(transport).load()).posts.single;

      expect(post.platform, isNull);
      expect(post.targetLabel, 'Unknown platform');
    },
  );

  test('a row whose media is gone still reads', () async {
    final transport = _FakeTransport()
      ..answers.add([
        {..._row(), 'videos': null},
      ]);

    final post = (await _repository(transport).load()).posts.single;

    expect(post.videoTitle, isNull);
    expect(post.thumbnailUrl, isNull);
  });

  test(
    'the account name comes from the display fields of the page accounts',
    () async {
      final transport = _FakeTransport()
        ..answers.add([
          _row(id: 'p1', accountId: 'ig-1'),
          _row(id: 'p2', accountId: 'yt-1'),
        ])
        ..answers.add([
          {'account_id': 'ig-1', 'account_name': '@flow', 'display_name': null},
          {
            'account_id': 'yt-1',
            'account_name': null,
            'display_name': 'FlowPost',
          },
        ]);

      final page = await _repository(transport).load();

      expect(page.posts[0].accountName, '@flow');
      expect(page.posts[1].accountName, 'FlowPost');
      expect(transport.bodies[1], {
        'action': 'accounts',
        'ids': ['ig-1', 'yt-1'],
      });
    },
  );

  test('an account the function does not name leaves the name out', () async {
    final transport = _FakeTransport()..answers.add([_row()]);

    final post = (await _repository(transport).load()).posts.single;

    expect(post.accountName, isNull);
  });

  test('every call carries the session token and no owner', () async {
    final transport = _FakeTransport()..answers.add([_row()]);

    await _repository(transport, token: 'license-session').load();

    expect(transport.tokens, everyElement('license-session'));
    for (final body in transport.bodies) {
      expect(body.containsKey('user_id'), isFalse);
    }
  });

  group('the calendar', () {
    test('asks for the days it shows, as instants', () async {
      final transport = _FakeTransport();
      final from = DateTime(2026, 10, 1);
      final to = DateTime(2026, 11, 1);

      await _repository(transport).loadBetween(from, to);

      final body = transport.bodies.first;
      expect(body['action'], 'range');
      expect(DateTime.parse(body['from']! as String).toUtc(), from.toUtc());
      expect(DateTime.parse(body['to']! as String).toUtc(), to.toUtc());
    });

    test('reads the rows with their names, as the queue does', () async {
      final transport = _FakeTransport()
        ..answers.add([_row(id: 'p1')])
        ..answers.add([
          {'account_id': 'ig-1', 'account_name': '@flow', 'display_name': null},
        ]);

      final posts = await _repository(transport)
          .loadBetween(DateTime(2026, 10, 1), DateTime(2026, 11, 1));

      expect(posts.single.id, 'p1');
      expect(posts.single.accountName, '@flow');
      expect(posts.single.scheduledAt, DateTime.utc(2026, 10, 29, 8, 30));
    });

    test('without a session the calendar is not read', () async {
      final transport = _FakeTransport();

      await expectLater(
        _repository(
          transport,
          token: null,
        ).loadBetween(DateTime(2026, 10, 1), DateTime(2026, 11, 1)),
        throwsA(
          isA<PostsException>().having(
            (error) => error.message,
            'message',
            'Activate a license to see the calendar.',
          ),
        ),
      );
      expect(transport.bodies, isEmpty);
    });
  });

  group('changing a row', () {
    PostEdit edit() => PostEdit(
      caption: 'New caption',
      hashtags: '#new',
      containsAlteredContent: true,
      scheduledAt: DateTime.utc(2026, 10, 30, 9),
    );

    test('an edit asks the function to change the scheduled row', () async {
      final transport = _FakeTransport()
        ..answers.add([
          {'id': 'post-1'},
        ]);

      final saved = await _repository(transport)
          .updateScheduled('post-1', edit());

      expect(saved, isTrue);
      expect(transport.bodies.single, {
        'action': 'update',
        'id': 'post-1',
        'patch': {
          'caption': 'New caption',
          'hashtags': '#new',
          'contains_altered_content': true,
          'scheduled_at': '2026-10-30T09:00:00.000Z',
        },
      });
    });

    test('an edit that no longer matches changes nothing', () async {
      final saved = await _repository(_FakeTransport())
          .updateScheduled('post-1', edit());

      expect(saved, isFalse);
    });

    test('an edit without a session is refused', () async {
      final transport = _FakeTransport();

      await expectLater(
        _repository(transport, token: null).updateScheduled('post-1', edit()),
        throwsA(
          isA<PostsException>().having(
            (error) => error.message,
            'message',
            'Activate a license to change a post.',
          ),
        ),
      );
      expect(transport.bodies, isEmpty);
    });

    test('a delete asks the function for that row', () async {
      final transport = _FakeTransport()
        ..answers.add([
          {'id': 'post-1'},
        ]);

      final deleted = await _repository(transport).delete('post-1');

      expect(deleted, isTrue);
      expect(transport.bodies.single, {'action': 'delete', 'id': 'post-1'});
    });

    test('a delete names the status the row was in', () async {
      final transport = _FakeTransport()
        ..answers.add([
          {'id': 'post-1'},
        ]);

      final deleted = await _repository(transport)
          .delete('post-1', onlyIf: PostStatus.scheduled);

      expect(deleted, isTrue);
      expect(transport.bodies.single, {
        'action': 'delete',
        'id': 'post-1',
        'onlyIf': 'scheduled',
      });
    });

    test('a delete of a row that is already gone says so', () async {
      final deleted = await _repository(_FakeTransport()).delete('post-1');

      expect(deleted, isFalse);
    });

    test('a delete without a session is refused', () async {
      await expectLater(
        _repository(_FakeTransport(), token: null).delete('post-1'),
        throwsA(
          isA<PostsException>().having(
            (error) => error.message,
            'message',
            'Activate a license to delete a post.',
          ),
        ),
      );
    });
  });
}
