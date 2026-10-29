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

/// The three values a build or a saved file carries, one at a time.
enum ConfigField { supabaseUrl, supabaseAnonKey, updateManifestUrl }

/// Why [value] cannot be used for [field], or null when it can.
///
/// One place for the rules, so the compiled defaults and the values a user
/// types into the form cannot drift apart (SPEC-credentials Decision 4).
String? configFieldProblem(ConfigField field, String value) {
  final trimmed = value.trim();
  switch (field) {
    case ConfigField.supabaseUrl:
      if (trimmed.isEmpty) return 'The Supabase address is required.';
      return _httpsProblem(trimmed);
    case ConfigField.updateManifestUrl:
      if (trimmed.isEmpty) return null;
      return _httpsProblem(trimmed);
    case ConfigField.supabaseAnonKey:
      if (trimmed.isEmpty) return 'The anon key is required.';
      if (_looksLikeServiceRole(trimmed)) {
        return 'This looks like a service-role key. The app only accepts '
            'the public anon/publishable key.';
      }
      return null;
  }
}

String? _httpsProblem(String value) {
  final uri = Uri.tryParse(value);
  if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
    return 'Use an https address, for example https://project.supabase.co';
  }
  return null;
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

  /// Validates values from any source; tests and a saved file reuse this.
  factory AppConfig.fromValues({
    required String supabaseUrl,
    required String supabaseAnonKey,
    String updateManifestUrl = '',
  }) {
    // A pasted address often ends in a slash; every endpoint is built by
    // appending its own path, so the slash is dropped once, here.
    final url = _withoutTrailingSlash(supabaseUrl.trim());
    final key = supabaseAnonKey.trim();
    final manifest = _withoutTrailingSlash(updateManifestUrl.trim());
    final problem =
        configFieldProblem(ConfigField.supabaseUrl, url) ??
        configFieldProblem(ConfigField.supabaseAnonKey, key) ??
        configFieldProblem(ConfigField.updateManifestUrl, manifest);
    if (problem != null) throw ConfigException(problem);
    return AppConfig(
      supabaseUrl: url,
      supabaseAnonKey: key,
      updateManifestUrl: manifest,
    );
  }

  final String supabaseUrl;
  final String supabaseAnonKey;
  final String updateManifestUrl;

  static String _withoutTrailingSlash(String value) =>
      value.endsWith('/') ? value.substring(0, value.length - 1) : value;
}

bool _looksLikeServiceRole(String key) {
  final lower = key.toLowerCase();
  if (lower.startsWith('sb_secret_') || lower.contains('service_role')) {
    return true;
  }
  // A non-JWT key is not automatically a service key; presence checks
  // above still reject the names that matter.
  return jwtPayload(key)?['role'] == 'service_role';
}
