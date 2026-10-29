import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../domain/publish_errors.dart';
import '../domain/publish_target.dart';

/// What the publish service answered.
class PublishReply {
  const PublishReply({
    required this.statusCode,
    required this.body,
    this.failure,
  });

  final int statusCode;

  /// The parsed JSON body. Empty when the answer was not JSON.
  final Map<String, dynamic> body;

  /// The failure of a call that never reached the service. Null when the
  /// service answered.
  final PublishFailure? failure;
}

/// What a successful publish call left behind.
class PublishResult {
  const PublishResult({this.platformId});

  /// The id the platform gave the post, when it gave one. YouTube does not.
  final String? platformId;
}

/// A publish call that failed in a way the admin can act on.
class PublishException implements Exception {
  const PublishException(this.failure);

  final PublishFailure failure;

  @override
  String toString() => 'PublishException: ${failure.message}';
}

/// Carries one publish call.
abstract class PublishTransport {
  Future<PublishReply> send({
    required Uri url,
    required String body,
    String? token,
  });
}

/// The one call the publish functions make.
abstract class PublishApi {
  /// Publishes the post the row points to.
  ///
  /// The body is `{"postId": "…"}`; the caption, the media and the token stay
  /// on the server.
  Future<PublishResult> publish({
    required PublishTarget target,
    required String postId,
  });
}

/// Publishes through the existing edge functions.
class PublishClient implements PublishApi {
  PublishClient({
    required this.supabaseUrl,
    required this.token,
    PublishTransport? transport,
  }) : _transport = transport ?? HttpPublishTransport();

  final String supabaseUrl;

  /// The session token. Null while there is no identity, and then nothing is
  /// sent.
  final String? token;

  final PublishTransport _transport;

  /// The keys the functions use for the id of the published post.
  static const List<String> platformIdKeys = [
    'instagram_post_id',
    'facebook_id',
    'linkedin_post_id',
    'publish_id',
    'storyId',
    'video_id',
  ];

  @override
  Future<PublishResult> publish({
    required PublishTarget target,
    required String postId,
  }) async {
    final token = this.token;
    if (token == null || token.isEmpty) {
      throw const PublishException(
        PublishFailure(
          PublishErrorCode.notSignedIn,
          'Sign in required to publish.',
        ),
      );
    }
    final url = Uri.parse('$supabaseUrl/functions/v1/${target.edgeFunction}');
    final reply = await _transport.send(
      url: url,
      body: jsonEncode({'postId': postId}),
      token: token,
    );
    final failure = reply.failure;
    if (failure != null) {
      throw PublishException(failure);
    }
    if (reply.statusCode < 200 || reply.statusCode >= 300) {
      final error = reply.body['error'];
      throw PublishException(
        mapPublishFailure(
          statusCode: reply.statusCode,
          text: error is String ? error : null,
        ),
      );
    }
    for (final key in platformIdKeys) {
      final value = reply.body[key];
      if (value is String && value.isNotEmpty) {
        return PublishResult(platformId: value);
      }
    }
    return const PublishResult();
  }
}

/// The real transport: one JSON call with the session token.
class HttpPublishTransport implements PublishTransport {
  HttpPublishTransport({this.timeout = defaultPublishTimeout});

  /// The whole call gets this long.
  ///
  /// The Instagram function waits on the platform for about two minutes
  /// before it answers, so the client has to outlast it: a client that gave
  /// up earlier would call a finished publish a timeout.
  final Duration timeout;

  @override
  Future<PublishReply> send({
    required Uri url,
    required String body,
    String? token,
  }) async {
    final client = HttpClient();
    // One budget for the whole call: the connection, the answer and the
    // body. Two timeouts would make the budget twice as long as it says.
    final clock = Stopwatch()..start();
    Duration left() => timeout - clock.elapsed;
    try {
      final request = await client.postUrl(url).timeout(left());
      request.headers.contentType = ContentType.json;
      if (token != null) {
        request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      }
      request.write(body);
      final response = await request.close().timeout(left());
      final text = await response
          .transform(utf8.decoder)
          .join()
          .timeout(left());
      Object? decoded;
      try {
        decoded = text.isEmpty ? null : jsonDecode(text);
      } on FormatException {
        decoded = null;
      }
      return PublishReply(
        statusCode: response.statusCode,
        body: decoded is Map ? Map<String, dynamic>.from(decoded) : const {},
      );
    } on TimeoutException {
      return _noAnswer(publishTimeoutFailure);
    } on IOException {
      return _noAnswer(publishNetworkFailure);
    } finally {
      client.close(force: true);
    }
  }

  /// The call never reached the service.
  PublishReply _noAnswer(PublishFailure failure) =>
      PublishReply(statusCode: 0, body: const {}, failure: failure);
}

/// How long a publish call may take before the client gives up on it.
const Duration defaultPublishTimeout = Duration(seconds: 180);
