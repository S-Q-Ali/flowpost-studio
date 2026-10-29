import '../auth/access_token.dart';

/// Shell-level configuration parsed once from `--dart-define-from-file`.
///
/// Supabase credentials are only validated for presence and safety here;
/// using them belongs to the `identity` module.
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
    return AppConfig.fromValues(
      supabaseUrl: url,
      supabaseAnonKey: anonKey,
      updateManifestUrl: manifest,
    );
  }

  /// Validates values from any source; tests and future settings reuse this.
  factory AppConfig.fromValues({
    required String supabaseUrl,
    required String supabaseAnonKey,
    String updateManifestUrl = '',
  }) {
    if (supabaseUrl.isEmpty || supabaseAnonKey.isEmpty) {
      throw const ConfigException(
        'SUPABASE_URL and SUPABASE_ANON_KEY are required '
        '(pass --dart-define-from-file=config/dev.json)',
      );
    }
    _requireHttps(supabaseUrl, 'SUPABASE_URL');
    if (updateManifestUrl.isNotEmpty) {
      _requireHttps(updateManifestUrl, 'UPDATE_MANIFEST_URL');
    }
    if (_looksLikeServiceRole(supabaseAnonKey)) {
      throw const ConfigException(
        'SUPABASE_ANON_KEY must be the public anon/publishable key, '
        'never a service-role or secret key',
      );
    }
    return AppConfig(
      supabaseUrl: supabaseUrl,
      supabaseAnonKey: supabaseAnonKey,
      updateManifestUrl: updateManifestUrl,
    );
  }

  final String supabaseUrl;
  final String supabaseAnonKey;
  final String updateManifestUrl;

  static void _requireHttps(String value, String field) {
    final uri = Uri.tryParse(value);
    if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
      throw ConfigException('$field must be an https URL');
    }
  }

  static bool _looksLikeServiceRole(String key) {
    final lower = key.toLowerCase();
    if (lower.startsWith('sb_secret_') || lower.contains('service_role')) {
      return true;
    }
    // A non-JWT key is not automatically a service key; presence checks
    // above still reject the names that matter.
    return jwtPayload(key)?['role'] == 'service_role';
  }
}
