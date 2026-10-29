import 'dart:io';

import '../../../core/config/app_config.dart';

/// How one address answered, as a seam the tests answer.
typedef StatusProbe = Future<int> Function(
  Uri url, {
  Map<String, String> headers,
});

/// Tests the typed values without needing a session (SPEC-credentials
/// Decision 9): the Supabase root says whether the server is there and
/// whether it accepts the key, and the manifest must answer when it is set.
Future<String> checkCredentialsConnection(
  AppConfig config, {
  StatusProbe probe = httpStatus,
}) async {
  try {
    final status = await probe(
      Uri.parse('${config.supabaseUrl}/rest/v1/'),
      headers: {'apikey': config.supabaseAnonKey},
    );
    if (status == 401 || status == 403) {
      return 'The server answered but refused this key.';
    }
    if (status < 200 || status >= 300) {
      return 'The server answered with $status.';
    }
    if (config.updateManifestUrl.isNotEmpty) {
      final manifest = await probe(Uri.parse(config.updateManifestUrl));
      if (manifest < 200 || manifest >= 300) {
        return 'The update address answered with $manifest.';
      }
    }
    return 'The server answered.';
  } on Object {
    return 'Could not reach the server.';
  }
}

/// One GET with no body kept; the caller only needs the status line.
Future<int> httpStatus(
  Uri url, {
  Map<String, String> headers = const {},
}) async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 10);
  try {
    final request = await client.getUrl(url);
    headers.forEach(request.headers.set);
    final response = await request.close();
    await response.drain<void>();
    return response.statusCode;
  } finally {
    client.close(force: true);
  }
}
