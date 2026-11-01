import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../../../core/logging/app_logger.dart';

/// What one guided-setup call answered.
class SetupReply {
  const SetupReply({
    required this.statusCode,
    required this.body,
    this.unreachable = false,
  });

  /// True when the request never reached the server.
  final bool unreachable;
  final int statusCode;

  /// The parsed JSON body; empty when the answer was not JSON.
  final Map<String, dynamic> body;
}

/// Carries one call to a setup function.
abstract class SetupTransport {
  Future<SetupReply> send({
    required Uri url,
    required Map<String, Object?> body,
    required String anonKey,
    String? token,
  });
}

/// Every failure the wizard can show, in words the operator can act on.
enum SetupError {
  signRequired('Activate the license key of this server before setting it up.'),
  notOperator(
    'This license is not the account that runs the server, so it cannot '
    'change the server’s own keys.',
  ),
  refused('The server did not accept that value.'),
  offline('FlowPost cannot reach the server. Check the address and network.'),
  unexpected('Something went wrong. Try again.');

  const SetupError(this.message);

  final String message;
}

/// A refusal of a setup call.
///
/// The values sent are never part of it: the message carries the server's own
/// sentence, cleaned, and nothing else — so a failure that reaches a log or a
/// screen cannot carry a credential with it.
class SetupException implements Exception {
  const SetupException(this.error, {this.serverMessage});

  final SetupError error;
  final String? serverMessage;

  String get message => serverMessage ?? error.message;

  @override
  String toString() => 'SetupException(${error.name})';
}

/// Which of the server's own keys hold a value.
class ServerConfig {
  const ServerConfig(this.present);

  /// The names with a value, as the server reported them.
  final Set<String> present;

  bool has(String name) => present.contains(name);

  bool hasAll(List<String> names) => names.every(present.contains);
}

/// The two functions the guided setup talks to.
abstract class SetupApi {
  /// Which names the server already has a value for.
  Future<ServerConfig> status(String token);

  /// Stores [values] on the server and answers the names it took.
  Future<List<String>> store(Map<String, String> values, String token);
}

/// Calls `config-status` and `operator-config` with the license session.
class SetupClient implements SetupApi {
  SetupClient({
    required this.supabaseUrl,
    required this.anonKey,
    SetupTransport? transport,
  }) : _transport = transport ?? HttpSetupTransport();

  final String supabaseUrl;
  final String anonKey;
  final SetupTransport _transport;

  static const String statusFunction = 'config-status';
  static const String storeFunction = 'operator-config';

  @override
  Future<ServerConfig> status(String token) async {
    final reply = await _post(statusFunction, const {}, token);
    final values = reply.body['values'];
    if (values is! Map) throw const SetupException(SetupError.unexpected);
    return ServerConfig({
      for (final entry in values.entries)
        if (entry.value == true) '${entry.key}',
    });
  }

  @override
  Future<List<String>> store(Map<String, String> values, String token) async {
    final reply = await _post(storeFunction, {'values': values}, token);
    final saved = reply.body['saved'];
    if (saved is! List) throw const SetupException(SetupError.unexpected);
    return [
      for (final name in saved)
        if (name is String) name,
    ];
  }

  Future<SetupReply> _post(
    String function,
    Map<String, Object?> body,
    String token,
  ) async {
    final reply = await _transport.send(
      url: Uri.parse('$supabaseUrl/functions/v1/$function'),
      body: body,
      anonKey: anonKey,
      token: token,
    );
    if (reply.unreachable) throw const SetupException(SetupError.offline);
    switch (reply.statusCode) {
      case 200:
        return reply;
      case 400:
        throw SetupException(
          SetupError.refused,
          serverMessage: _serverText(reply.body),
        );
      case 401:
        throw SetupException(
          SetupError.signRequired,
          serverMessage: _serverText(reply.body),
        );
      case 403:
        throw SetupException(
          SetupError.notOperator,
          serverMessage: _serverText(reply.body),
        );
      default:
        throw SetupException(
          SetupError.unexpected,
          serverMessage: _serverText(reply.body),
        );
    }
  }
}

/// The real transport: one JSON POST with the anon key and the session bearer.
class HttpSetupTransport implements SetupTransport {
  HttpSetupTransport({this.timeout = const Duration(seconds: 30)});

  /// The whole call gets this long, connection and body included.
  final Duration timeout;

  @override
  Future<SetupReply> send({
    required Uri url,
    required Map<String, Object?> body,
    required String anonKey,
    String? token,
  }) async {
    final client = HttpClient();
    final clock = Stopwatch()..start();
    Duration left() => timeout - clock.elapsed;
    try {
      final request = await client.postUrl(url).timeout(left());
      request.headers.contentType = ContentType.json;
      request.headers.set('apikey', anonKey);
      if (token != null && token.isNotEmpty) {
        request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      }
      request.write(jsonEncode(body));
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
      return SetupReply(
        statusCode: response.statusCode,
        body: decoded is Map ? Map<String, dynamic>.from(decoded) : const {},
      );
    } on TimeoutException {
      return const SetupReply(statusCode: 0, body: {}, unreachable: true);
    } on IOException {
      return const SetupReply(statusCode: 0, body: {}, unreachable: true);
    } finally {
      client.close(force: true);
    }
  }
}

/// The server's own sentence, made safe to show: no links, no paths, no
/// control characters, and no second line.
String? _serverText(Map<String, dynamic> body) {
  final value = body['error'];
  if (value is! String) return null;
  final cleaned = cleanFailureText(value);
  return cleaned.isEmpty ? null : cleaned;
}
