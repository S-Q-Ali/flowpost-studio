/// Shell-level configuration parsed once from `--dart-define-from-file`.
///
/// Supabase credentials are only validated for presence here; using them
/// belongs to the `identity` module.
library;

class ConfigException implements Exception {
  const ConfigException(this.message);

  final String message;

  @override
  String toString() => 'ConfigException: $message';
}

class AppConfig {
  const AppConfig({
    required this.supabaseUrl,
    required this.supabaseAnonKey,
    required this.updateManifestUrl,
  });

  factory AppConfig.fromEnvironment() {
    const url = String.fromEnvironment('SUPABASE_URL');
    const anonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
    const manifest = String.fromEnvironment('UPDATE_MANIFEST_URL');
    if (url.isEmpty || anonKey.isEmpty) {
      throw const ConfigException(
        'SUPABASE_URL and SUPABASE_ANON_KEY are required '
        '(pass --dart-define-from-file=config/dev.json)',
      );
    }
    // ignore: prefer_const_constructors
    return AppConfig(
      supabaseUrl: url,
      supabaseAnonKey: anonKey,
      updateManifestUrl: manifest,
    );
  }

  final String supabaseUrl;
  final String supabaseAnonKey;
  final String updateManifestUrl;
}
