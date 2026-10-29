import 'dart:convert';

import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/scheduling/data/scheduled_posts_repository.dart';
import 'package:flowpost_desktop/features/scheduling/domain/post_edit.dart';
import 'package:flowpost_desktop/features/scheduling/domain/scheduled_post.dart';
import 'package:flutter_test/flutter_test.dart';

/// A transport that answers from memory, one answer per call.
class _FakeTransport implements PostsTransport {
  final List<Uri> urls = [];
  final List<String?> tokens = [];
  final List<String> methods = [];
  final List<String?> bodies = [];

  /// The rows each call answers with, in call order. Past the end the table
  /// answers nothing.
  final List<List<Map<String, Object?>>> answers = [];

  int _call = 0;

  @override
  Future<List<Map<String, Object?>>> send({
    required String method,
    required Uri url,
    String? body,
    String? token,
  }) async {
    urls.add(url);
    tokens.add(token);
    methods.add(method);
    bodies.add(body);
    final answer = _call < answers.length
        ? answers[_call]
        : const <Map<String, Object?>>[];
    _call++;
    return answer;
  }
}

PostgrestScheduledPostsRepository _repository(
  _FakeTransport transport, {
  String? token = 'token',
}) {
  return PostgrestScheduledPostsRepository(
    supabaseUrl: 'https://test.supabase.co',
    anonKey: 'anon',
    token: token,
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
  test('without a token the queue is not read', () async {
    final transport = _FakeTransport();

    await expectLater(
      _repository(transport, token: null).load(),
      throwsA(
        isA<PostsException>().having(
          (error) => error.message,
          'message',
          'Sign in required to see the queue.',
        ),
      ),
    );
    expect(transport.urls, isEmpty);
  });

  test('an empty table is an empty page, not an error', () async {
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
      expect(transport.urls.first.queryParameters['limit'], '3');
      expect(transport.urls.first.queryParameters['offset'], '0');
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

    expect(transport.urls.first.queryParameters['offset'], '200');
  });

  test('the rows are ordered by the time they go out, then by age', () async {
    final transport = _FakeTransport();

    await _repository(transport).load();

    expect(
      transport.urls.first.queryParameters['order'],
      'scheduled_at.asc.nullslast,created_at.asc',
    );
  });

  test('the filter asks the table for that status', () async {
    final transport = _FakeTransport();

    await _repository(transport).load(filter: QueueFilter.scheduled);

    expect(transport.urls.first.queryParameters['status'], 'eq.scheduled');
  });

  test('the whole queue asks for no status', () async {
    final transport = _FakeTransport();

    await _repository(transport).load(filter: QueueFilter.all);

    expect(transport.urls.first.queryParameters.containsKey('status'), isFalse);
  });

  test('the platform filter asks the table for that platform', () async {
    final transport = _FakeTransport();

    await _repository(transport).load(platform: PublishPlatform.instagram);

    expect(transport.urls.first.queryParameters['platform'], 'eq.instagram');
  });

  test('the whole queue asks for no platform', () async {
    final transport = _FakeTransport();

    await _repository(transport).load();

    expect(
      transport.urls.first.queryParameters.containsKey('platform'),
      isFalse,
    );
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
      final asked = transport.urls[1];
      expect(asked.queryParameters['account_id'], contains('"ig-1"'));
      expect(asked.queryParameters['account_id'], contains('"yt-1"'));
      expect(
        asked.queryParameters['select'],
        'account_id,account_name,display_name',
      );
    },
  );

  test('an account the table does not name leaves the name out', () async {
    final transport = _FakeTransport()..answers.add([_row()]);

    final post = (await _repository(transport).load()).posts.single;

    expect(post.accountName, isNull);
  });

  test('the read never asks for a token field', () async {
    final transport = _FakeTransport()..answers.add([_row()]);

    await _repository(transport).load();

    for (final url in transport.urls) {
      expect(url.toString(), isNot(contains('access_token')));
      expect(url.toString(), isNot(contains('refresh_token')));
      expect(url.toString(), isNot(contains('token_expiry')));
    }
  });

  group('the calendar', () {
    test('asks for the days it shows, as instants', () async {
      final transport = _FakeTransport();
      final from = DateTime(2026, 10, 1);
      final to = DateTime(2026, 11, 1);

      await _repository(transport).loadBetween(from, to);

      final bounds = transport.urls.first.queryParametersAll['scheduled_at']!;
      expect(bounds, hasLength(2));
      final gte = bounds.firstWhere((bound) => bound.startsWith('gte.'));
      final lt = bounds.firstWhere((bound) => bound.startsWith('lt.'));
      expect(DateTime.parse(gte.substring(4)).toUtc(), from.toUtc());
      expect(DateTime.parse(lt.substring(3)).toUtc(), to.toUtc());
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

    test('without a token the calendar is not read', () async {
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
            'Sign in required to see the calendar.',
          ),
        ),
      );
      expect(transport.urls, isEmpty);
    });

    test('the rows are ordered by the time they go out', () async {
      final transport = _FakeTransport();

      await _repository(transport)
          .loadBetween(DateTime(2026, 10, 1), DateTime(2026, 11, 1));

      expect(
        transport.urls.first.queryParameters['order'],
        'scheduled_at.asc.nullslast,created_at.asc',
      );
    });
  });

  group('changing a row', () {
    PostEdit edit() => PostEdit(
      caption: 'New caption',
      hashtags: '#new',
      containsAlteredContent: true,
      scheduledAt: DateTime.utc(2026, 10, 30, 9),
    );

    test('an edit is a compare-and-set on a scheduled row', () async {
      final transport = _FakeTransport()
        ..answers.add([
          {'id': 'post-1'},
        ]);

      final saved = await _repository(transport)
          .updateScheduled('post-1', edit());

      expect(saved, isTrue);
      expect(transport.methods.single, 'PATCH');
      final url = transport.urls.single;
      expect(url.queryParameters['id'], 'eq.post-1');
      expect(url.queryParameters['status'], 'eq.scheduled');
      expect(jsonDecode(transport.bodies.single!), {
        'caption': 'New caption',
        'hashtags': '#new',
        'contains_altered_content': true,
        'scheduled_at': '2026-10-30T09:00:00.000Z',
      });
    });

    test('an edit that no longer matches changes nothing', () async {
      final saved = await _repository(_FakeTransport())
          .updateScheduled('post-1', edit());

      expect(saved, isFalse);
    });

    test('an edit without a token is refused', () async {
      final transport = _FakeTransport();

      await expectLater(
        _repository(transport, token: null).updateScheduled('post-1', edit()),
        throwsA(
          isA<PostsException>().having(
            (error) => error.message,
            'message',
            'Sign in required to change a post.',
          ),
        ),
      );
      expect(transport.urls, isEmpty);
    });

    test('a delete asks the table for that row', () async {
      final transport = _FakeTransport()
        ..answers.add([
          {'id': 'post-1'},
        ]);

      final deleted = await _repository(transport).delete('post-1');

      expect(deleted, isTrue);
      expect(transport.methods.single, 'DELETE');
      expect(transport.urls.single.queryParameters['id'], 'eq.post-1');
    });

    test('a delete of a row that is already gone says so', () async {
      final deleted = await _repository(_FakeTransport()).delete('post-1');

      expect(deleted, isFalse);
    });

    test('a delete without a token is refused', () async {
      await expectLater(
        _repository(_FakeTransport(), token: null).delete('post-1'),
        throwsA(
          isA<PostsException>().having(
            (error) => error.message,
            'message',
            'Sign in required to delete a post.',
          ),
        ),
      );
    });
  });
}
