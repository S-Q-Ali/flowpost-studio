import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'license_models.dart';

/// What a successful activation left behind.
class LicenseGrant {
  const LicenseGrant({required this.token, required this.expiresAt});

  final String token;
  final DateTime expiresAt;
}

/// What the activation call answered.
class LicenseReply {
  const LicenseReply({
    required this.statusCode,
    required this.body,
    this.failure,
  });

  final int statusCode;

  /// The parsed JSON body. Empty when the answer was not JSON.
  final Map<String, dynamic> body;

  /// The failure of a call that never reached the service. Null when the
  /// service answered.
  final LicenseError? failure;
}

/// Carries one activation call.
abstract class LicenseTransport {
  Future<LicenseReply> send({
    required Uri url,
    required String body,
    required String anonKey,
  });
}

/// The two calls the license module makes.
abstract class LicenseApi {
  /// Exchanges a license key for a session.
  Future<LicenseGrant> activate(String key);
}

/// Activates through the `verify-license` edge function.
class LicenseClient implements LicenseApi {
  LicenseClient({
    required this.supabaseUrl,
    required this.anonKey,
    LicenseTransport? transport,
  }) : _transport = transport ?? HttpLicenseTransport();

  final String supabaseUrl;

  /// The public anon key the function gateway requires.
  final String anonKey;

  final LicenseTransport _transport;

  static const String function = 'verify-license';

  @override
  Future<LicenseGrant> activate(String key) async {
    final url = Uri.parse('$supabaseUrl/functions/v1/$function');
    final reply = await _transport.send(
      url: url,
      body: jsonEncode({'licenseKey': key}),
      anonKey: anonKey,
    );

    final failure = reply.failure;
    if (failure != null) throw LicenseException(failure);

    switch (reply.statusCode) {
      case 200:
        break;
      case 400:
      case 401:
        throw const LicenseException(LicenseError.invalidKey);
      case 429:
        throw LicenseException(
          LicenseError.rateLimited,
          serverMessage: _serverMessage(reply.body),
        );
      default:
        throw const LicenseException(LicenseError.unexpected);
    }

    final token = reply.body['token'];
    final expiresAt = DateTime.tryParse('${reply.body['expiresAt']}');
    if (reply.body['valid'] != true ||
        token is! String ||
        token.isEmpty ||
        expiresAt == null) {
      throw const LicenseException(LicenseError.unexpected);
    }
    return LicenseGrant(token: token, expiresAt: expiresAt.toUtc());
  }
}

/// The real transport: one JSON call with the anon key.
class HttpLicenseTransport implements LicenseTransport {
  HttpLicenseTransport({this.timeout = defaultLicenseTimeout});

  /// The whole call gets this long, connection and body included.
  final Duration timeout;

  @override
  Future<LicenseReply> send({
    required Uri url,
    required String body,
    required String anonKey,
  }) async {
    final client = HttpClient();
    final clock = Stopwatch()..start();
    Duration left() => timeout - clock.elapsed;
    try {
      final request = await client.postUrl(url).timeout(left());
      request.headers.contentType = ContentType.json;
      request.headers.set('apikey', anonKey);
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
      return LicenseReply(
        statusCode: response.statusCode,
        body: decoded is Map ? Map<String, dynamic>.from(decoded) : const {},
      );
    } on TimeoutException {
      return _noAnswer();
    } on IOException {
      return _noAnswer();
    } finally {
      client.close(force: true);
    }
  }

  LicenseReply _noAnswer() => const LicenseReply(
    statusCode: 0,
    body: {},
    failure: LicenseError.offline,
  );
}

/// How long an activation may take before the client gives up on it.
const Duration defaultLicenseTimeout = Duration(seconds: 30);

String? _serverMessage(Map<String, dynamic> body) {
  final value = body['error'];
  return value is String && value.isNotEmpty ? value : null;
}
