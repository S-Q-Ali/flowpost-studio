import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';

void main() {
  group('AppConfig', () {
    test('fromEnvironment throws when Supabase keys are absent', () {
      // Tests run without --dart-define, so every value is empty.
      expect(AppConfig.fromEnvironment, throwsA(isA<ConfigException>()));
    });

    test('exposes the values it was constructed with', () {
      const config = AppConfig(
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'anon-key',
        updateManifestUrl: 'https://example.com/update.json',
      );
      expect(config.supabaseUrl, 'https://example.supabase.co');
      expect(config.supabaseAnonKey, 'anon-key');
      expect(config.updateManifestUrl, 'https://example.com/update.json');
    });

    test('accepts a valid https configuration', () {
      final config = AppConfig.fromValues(
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'public-anon-key',
        updateManifestUrl: 'https://example.com/update.json',
      );
      expect(config.supabaseUrl, 'https://example.supabase.co');
    });

    test('rejects a non-https Supabase URL', () {
      expect(
        () => AppConfig.fromValues(
          supabaseUrl: 'http://example.supabase.co',
          supabaseAnonKey: 'public-anon-key',
        ),
        throwsA(isA<ConfigException>()),
      );
    });

    test('rejects a malformed Supabase URL', () {
      expect(
        () => AppConfig.fromValues(
          supabaseUrl: 'not-a-url',
          supabaseAnonKey: 'public-anon-key',
        ),
        throwsA(isA<ConfigException>()),
      );
    });

    test('rejects a Supabase URL that carries a path', () {
      // Every endpoint is built by appending its own path, so this would put
      // /rest/v1 inside every request.
      expect(
        () => AppConfig.fromValues(
          supabaseUrl: 'https://example.supabase.co/rest/v1',
          supabaseAnonKey: 'public-anon-key',
        ),
        throwsA(isA<ConfigException>()),
      );
    });

    test('accepts a Supabase URL with a trailing slash', () {
      final config = AppConfig.fromValues(
        supabaseUrl: 'https://example.supabase.co/',
        supabaseAnonKey: 'public-anon-key',
      );
      expect(config.supabaseUrl, 'https://example.supabase.co');
    });

    test('rejects a service-role JWT', () {
      final payload = base64Url
          .encode(utf8.encode('{"role":"service_role"}'))
          .replaceAll('=', '');
      final key = 'header.$payload.signature';
      expect(
        () => AppConfig.fromValues(
          supabaseUrl: 'https://example.supabase.co',
          supabaseAnonKey: key,
        ),
        throwsA(isA<ConfigException>()),
      );
    });

    test('rejects a secret API key', () {
      expect(
        () => AppConfig.fromValues(
          supabaseUrl: 'https://example.supabase.co',
          supabaseAnonKey: 'sb_secret_123',
        ),
        throwsA(isA<ConfigException>()),
      );
    });

    test('rejects a non-https update manifest URL', () {
      expect(
        () => AppConfig.fromValues(
          supabaseUrl: 'https://example.supabase.co',
          supabaseAnonKey: 'public-anon-key',
          updateManifestUrl: 'http://example.com/update.json',
        ),
        throwsA(isA<ConfigException>()),
      );
    });

    test('allows an empty update manifest URL', () {
      final config = AppConfig.fromValues(
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'public-anon-key',
      );
      expect(config.updateManifestUrl, isEmpty);
    });
  });
}
