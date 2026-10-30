import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/config/credentials_store.dart';

void main() {
  late Directory folder;
  late CredentialsStore store;

  setUp(() async {
    folder = await Directory.systemTemp.createTemp('flowpost-credentials-');
    store = CredentialsStore(folder: () async => folder);
  });

  tearDown(() async {
    if (await folder.exists()) await folder.delete(recursive: true);
  });

  File file() =>
      File('${folder.path}${Platform.pathSeparator}credentials.json');

  const valid = AppConfig(
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'public-anon-key',
    updateManifestUrl: 'https://example.com/update.json',
  );

  group('configFieldProblem', () {
    test('accepts an https address and an anon key', () {
      expect(
        configFieldProblem(
          ConfigField.supabaseUrl,
          'https://example.supabase.co',
        ),
        isNull,
      );
      expect(
        configFieldProblem(ConfigField.supabaseAnonKey, 'public-anon-key'),
        isNull,
      );
    });

    test('names the fix for a plain http address', () {
      final problem = configFieldProblem(
        ConfigField.supabaseUrl,
        'http://example.supabase.co',
      );
      expect(problem, contains('https'));
    });

    test('rejects an empty address and an empty key', () {
      expect(configFieldProblem(ConfigField.supabaseUrl, '  '), isNotNull);
      expect(configFieldProblem(ConfigField.supabaseAnonKey, ''), isNotNull);
    });

    test('refuses a secret key and a service-role JWT', () {
      final payload = base64Url
          .encode(utf8.encode('{"role":"service_role"}'))
          .replaceAll('=', '');
      expect(
        configFieldProblem(ConfigField.supabaseAnonKey, 'sb_secret_123'),
        contains('service-role'),
      );
      expect(
        configFieldProblem(
          ConfigField.supabaseAnonKey,
          'header.$payload.signature',
        ),
        contains('service-role'),
      );
    });

    test('leaves the manifest URL optional but keeps it https', () {
      expect(configFieldProblem(ConfigField.updateManifestUrl, ''), isNull);
      expect(
        configFieldProblem(ConfigField.updateManifestUrl, 'http://example.com'),
        isNotNull,
      );
    });
  });

  group('AppConfig.fromValues', () {
    test('trims a trailing slash so endpoints never double it', () {
      final config = AppConfig.fromValues(
        supabaseUrl: 'https://example.supabase.co/',
        supabaseAnonKey: 'public-anon-key',
        updateManifestUrl: 'https://example.com/update.json/',
      );
      expect(config.supabaseUrl, 'https://example.supabase.co');
      expect(config.updateManifestUrl, 'https://example.com/update.json');
    });

    test('throws with the field message', () {
      expect(
        () => AppConfig.fromValues(
          supabaseUrl: 'http://example.supabase.co',
          supabaseAnonKey: 'public-anon-key',
        ),
        throwsA(
          isA<ConfigException>().having(
            (e) => e.message,
            'message',
            configFieldProblem(
              ConfigField.supabaseUrl,
              'http://example.supabase.co',
            ),
          ),
        ),
      );
    });
  });

  group('CredentialsStore', () {
    test('answers absent when no file exists', () async {
      expect(await store.read(), isA<CredentialsAbsent>());
    });

    test('round-trips a saved config', () async {
      expect(await store.write(valid), isTrue);

      final read = await store.read();
      expect(read, isA<CredentialsFound>());
      final config = (read as CredentialsFound).config;
      expect(config.supabaseUrl, valid.supabaseUrl);
      expect(config.supabaseAnonKey, valid.supabaseAnonKey);
      expect(config.updateManifestUrl, valid.updateManifestUrl);
    });

    test('writes through a temporary file and leaves no .tmp behind', () async {
      await store.write(valid);
      final names = folder.listSync().map((e) => e.uri.pathSegments.last);
      expect(names, contains('credentials.json'));
      expect(names.where((n) => n.endsWith('.tmp')), isEmpty);
    });

    test('reports a corrupt file instead of treating it as absent', () async {
      await file().writeAsString('{not json');
      final read = await store.read();
      expect(read, isA<CredentialsInvalid>());
      expect((read as CredentialsInvalid).reason, isNotEmpty);
    });

    test('reports a file whose key is a secret', () async {
      await file().writeAsString(
        jsonEncode({
          'supabaseUrl': 'https://example.supabase.co',
          'supabaseAnonKey': 'sb_secret_123',
          'updateManifestUrl': '',
        }),
      );
      final read = await store.read();
      expect(read, isA<CredentialsInvalid>());
      expect((read as CredentialsInvalid).reason, contains('service-role'));
    });

    test('clear removes the file and answers absent', () async {
      await store.write(valid);
      expect(await store.clear(), isTrue);
      expect(await file().exists(), isFalse);
      expect(await store.read(), isA<CredentialsAbsent>());
    });

    test('clearing when there is no file is not a failure', () async {
      expect(await store.clear(), isTrue);
    });

    test('a write into a file that cannot be created answers false', () async {
      final blocked = CredentialsStore(
        folder: () async => Directory('${folder.path}/missing/\u0000bad'),
      );
      expect(await blocked.write(valid), isFalse);
    });
  });
}
