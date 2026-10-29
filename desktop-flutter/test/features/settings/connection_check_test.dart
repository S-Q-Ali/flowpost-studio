import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/features/settings/data/connection_check.dart';

const _config = AppConfig(
  supabaseUrl: 'https://project.supabase.co',
  supabaseAnonKey: 'anon-key',
  updateManifestUrl: '',
);

const _withManifest = AppConfig(
  supabaseUrl: 'https://project.supabase.co',
  supabaseAnonKey: 'anon-key',
  updateManifestUrl: 'https://example.com/update.json',
);

void main() {
  test('a 2xx answer is a working connection', () async {
    final seen = <Uri>[];
    final answer = await checkCredentialsConnection(
      _withManifest,
      probe: (url, {headers = const {}}) async {
        seen.add(url);
        return 200;
      },
    );
    expect(answer, 'The server answered.');
    expect(seen, [
      Uri.parse('https://project.supabase.co/rest/v1/'),
      Uri.parse('https://example.com/update.json'),
    ]);
  });

  test('the key travels in the apikey header, and nowhere else', () async {
    Map<String, String>? sent;
    await checkCredentialsConnection(
      _config,
      probe: (url, {headers = const {}}) async {
        sent = headers;
        return 204;
      },
    );
    expect(sent, {'apikey': 'anon-key'});
  });

  for (final status in [401, 403]) {
    test('a $status answer names the key as the problem', () async {
      final answer = await checkCredentialsConnection(
        _config,
        probe: (url, {headers = const {}}) async => status,
      );
      expect(answer, 'The server answered but refused this key.');
    });
  }

  test('another non-2xx answer reports the status', () async {
    final answer = await checkCredentialsConnection(
      _config,
      probe: (url, {headers = const {}}) async => 500,
    );
    expect(answer, 'The server answered with 500.');
  });

  test('a manifest that fails is named apart from the key', () async {
    final answer = await checkCredentialsConnection(
      _withManifest,
      probe: (url, {headers = const {}}) async =>
          url.host == 'example.com' ? 404 : 200,
    );
    expect(answer, 'The update address answered with 404.');
  });

  test('a refused connection reads as unreachable', () async {
    final answer = await checkCredentialsConnection(
      _config,
      probe: (url, {headers = const {}}) async =>
          throw const SocketException('refused'),
    );
    expect(answer, 'Could not reach the server.');
  });

  test('a refused manifest also reads as unreachable', () async {
    final answer = await checkCredentialsConnection(
      _withManifest,
      probe: (url, {headers = const {}}) async {
        if (url.host == 'example.com') throw const SocketException('gone');
        return 200;
      },
    );
    expect(answer, 'Could not reach the server.');
  });
}
