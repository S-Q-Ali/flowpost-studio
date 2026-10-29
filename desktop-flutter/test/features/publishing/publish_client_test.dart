import 'dart:convert';

import 'package:flowpost_desktop/features/publishing/data/publish_client.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_errors.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flutter_test/flutter_test.dart';

/// A transport that answers from memory.
class _FakeTransport implements PublishTransport {
  PublishReply reply = const PublishReply(statusCode: 200, body: {});

  final List<Uri> urls = [];
  final List<String> bodies = [];
  final List<String?> tokens = [];

  @override
  Future<PublishReply> send({
    required Uri url,
    required String body,
    String? token,
  }) async {
    urls.add(url);
    bodies.add(body);
    tokens.add(token);
    return reply;
  }
}

PublishClient _client(_FakeTransport transport, {String? token = 'session'}) {
  return PublishClient(
    supabaseUrl: 'https://test.supabase.co',
    token: token,
    transport: transport,
  );
}

void main() {
  test('the call carries the post id and the session token', () async {
    final transport = _FakeTransport();
    final client = _client(transport);

    await client.publish(
      target: const PublishTarget(
        platform: PublishPlatform.instagram,
        accountId: 'ig-1',
        accountName: 'FlowPost',
      ),
      postId: 'post-1',
    );

    expect(
      transport.urls.single,
      Uri.parse('https://test.supabase.co/functions/v1/instagram-upload'),
    );
    expect(jsonDecode(transport.bodies.single), {'postId': 'post-1'});
    expect(transport.tokens.single, 'session');
  });

  test('every platform has its own function', () async {
    const targets = {
      'youtube-upload': PublishTarget(
        platform: PublishPlatform.youtube,
        accountId: 'a',
        accountName: 'n',
      ),
      'facebook-upload': PublishTarget(
        platform: PublishPlatform.facebook,
        accountId: 'a',
        accountName: 'n',
      ),
      'instagram-upload': PublishTarget(
        platform: PublishPlatform.instagram,
        accountId: 'a',
        accountName: 'n',
      ),
      'tiktok-upload': PublishTarget(
        platform: PublishPlatform.tiktok,
        accountId: 'a',
        accountName: 'n',
      ),
      'linkedin-upload': PublishTarget(
        platform: PublishPlatform.linkedin,
        accountId: 'a',
        accountName: 'n',
      ),
      'post-story': PublishTarget(
        platform: PublishPlatform.instagram,
        accountId: 'a',
        accountName: 'n',
        postType: PostType.story,
      ),
    };

    for (final entry in targets.entries) {
      final transport = _FakeTransport();
      await _client(transport).publish(target: entry.value, postId: 'post-1');
      expect(
        transport.urls.single.path,
        endsWith('/functions/v1/${entry.key}'),
      );
    }
  });

  test('the id the platform gave is read from the answer', () async {
    final transport = _FakeTransport()
      ..reply = const PublishReply(
        statusCode: 200,
        body: {'success': true, 'instagram_post_id': 'ig-99'},
      );

    final result = await _client(transport).publish(
      target: const PublishTarget(
        platform: PublishPlatform.instagram,
        accountId: 'ig-1',
        accountName: 'FlowPost',
      ),
      postId: 'post-1',
    );

    expect(result.platformId, 'ig-99');
  });

  test('an answer without an id still counts as published', () async {
    final transport = _FakeTransport()
      ..reply = const PublishReply(
        statusCode: 200,
        body: {'success': true, 'postId': 'post-1'},
      );

    final result = await _client(transport).publish(
      target: const PublishTarget(
        platform: PublishPlatform.youtube,
        accountId: 'yt-1',
        accountName: 'FlowPost',
      ),
      postId: 'post-1',
    );

    expect(result.platformId, isNull);
  });

  test('without a token nothing is sent', () async {
    final transport = _FakeTransport();
    final client = _client(transport, token: null);

    await expectLater(
      client.publish(
        target: const PublishTarget(
          platform: PublishPlatform.instagram,
          accountId: 'ig-1',
          accountName: 'FlowPost',
        ),
        postId: 'post-1',
      ),
      throwsA(
        isA<PublishException>().having(
          (error) => error.failure.code,
          'code',
          PublishErrorCode.notSignedIn,
        ),
      ),
    );
    expect(transport.urls, isEmpty);
  });

  test('a rejected token asks for a new sign-in', () async {
    final transport = _FakeTransport()
      ..reply = const PublishReply(
        statusCode: 401,
        body: {'error': 'Unauthorized'},
      );

    final failure = await _failureOf(transport);

    expect(failure.code, PublishErrorCode.unauthorized);
    expect(failure.message, 'Sign in again to publish.');
  });

  test('a missing post is not in the queue any more', () async {
    final transport = _FakeTransport()
      ..reply = const PublishReply(
        statusCode: 404,
        body: {'error': 'Post not found'},
      );

    final failure = await _failureOf(transport);

    expect(failure.code, PublishErrorCode.postNotFound);
    expect(failure.message, 'The post is no longer in the queue.');
  });

  test('a missing account asks for a new connection', () async {
    final transport = _FakeTransport()
      ..reply = const PublishReply(
        statusCode: 404,
        body: {'error': 'Connected Instagram account not found'},
      );

    final failure = await _failureOf(transport);

    expect(failure.code, PublishErrorCode.accountNotConnected);
    expect(
      failure.message,
      'That account is no longer connected. Connect it again.',
    );
  });

  test('missing media asks for a new upload', () async {
    final transport = _FakeTransport()
      ..reply = const PublishReply(
        statusCode: 404,
        body: {'error': 'Video not found or missing file_url'},
      );

    final failure = await _failureOf(transport);

    expect(failure.code, PublishErrorCode.mediaMissing);
    expect(
      failure.message,
      'The media for this post is missing. Upload it again.',
    );
  });

  test('a post of another platform is refused', () async {
    final transport = _FakeTransport()
      ..reply = const PublishReply(
        statusCode: 400,
        body: {'error': 'Post is not for YouTube'},
      );

    final failure = await _failureOf(transport);

    expect(failure.code, PublishErrorCode.wrongPlatform);
    expect(failure.message, 'That post belongs to another platform.');
  });

  test('a broken request says the post could not be prepared', () async {
    final transport = _FakeTransport()
      ..reply = const PublishReply(
        statusCode: 400,
        body: {'error': 'postId required'},
      );

    final failure = await _failureOf(transport);

    expect(failure.code, PublishErrorCode.invalidRequest);
    expect(failure.message, 'The post could not be prepared.');
  });

  test('the sentence of the platform is kept', () async {
    final transport = _FakeTransport()
      ..reply = const PublishReply(
        statusCode: 502,
        body: {'error': 'YouTube upload failed: quota exceeded'},
      );

    final failure = await _failureOf(transport);

    expect(failure.code, PublishErrorCode.platformRejected);
    expect(failure.message, 'YouTube upload failed: quota exceeded');
  });

  test('a link in the sentence of the platform is removed', () async {
    final transport = _FakeTransport()
      ..reply = const PublishReply(
        statusCode: 502,
        body: {'error': 'Upload failed for https://cdn.example.com/clip.mp4'},
      );

    final failure = await _failureOf(transport);

    expect(failure.message, isNot(contains('cdn.example.com')));
  });

  test('a control byte in the sentence of the platform is removed', () async {
    final transport = _FakeTransport()
      ..reply = const PublishReply(
        statusCode: 502,
        body: {'error': 'Upload failed\nforged record'},
      );

    final failure = await _failureOf(transport);

    expect(failure.message, isNot(contains('\n')));
  });

  test('an empty answer says the publish failed', () async {
    final transport = _FakeTransport()
      ..reply = const PublishReply(statusCode: 500, body: {});

    final failure = await _failureOf(transport);

    expect(failure.code, PublishErrorCode.unknown);
    expect(failure.message, 'The publish failed. Try again.');
  });
}

Future<PublishFailure> _failureOf(_FakeTransport transport) async {
  try {
    await _client(transport).publish(
      target: const PublishTarget(
        platform: PublishPlatform.instagram,
        accountId: 'ig-1',
        accountName: 'FlowPost',
      ),
      postId: 'post-1',
    );
  } on PublishException catch (error) {
    return error.failure;
  }
  fail('The publish should have failed.');
}
