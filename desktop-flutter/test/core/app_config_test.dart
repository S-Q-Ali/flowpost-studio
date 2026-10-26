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
  });
}
