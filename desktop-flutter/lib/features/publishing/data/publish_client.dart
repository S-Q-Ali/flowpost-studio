import 'dart:convert';
import 'dart:io';

import '../domain/publish_errors.dart';
import '../domain/publish_target.dart';

/// What the publish service answered.
class PublishReply {
  const PublishReply({required this.statusCode, required this.body});

  final int statusCode;

  /// The parsed JSON body. Empty when the answer was not JSON.
  final Map<String, dynamic> body;
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
  @override
  Future<PublishReply> send({
    required Uri url,
    required String body,
    String? token,
  }) async {
    final client = HttpClient();
    try {
      final request = await client.postUrl(url);
      request.headers.contentType = ContentType.json;
      if (token != null) {
        request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      }
      request.write(body);
      final response = await request.close();
      final text = await response.transform(utf8.decoder).join();
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
    } finally {
      client.close(force: true);
    }
  }
}
