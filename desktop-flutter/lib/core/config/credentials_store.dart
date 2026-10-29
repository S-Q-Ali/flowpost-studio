import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'app_config.dart';

/// The file a user's values live in, beside `accounts.json`.
const String credentialsFileName = 'credentials.json';

/// What reading the saved values produced.
sealed class CredentialsRead {
  const CredentialsRead();
}

/// No file yet: the build's defaults, if any, are the answer.
class CredentialsAbsent extends CredentialsRead {
  const CredentialsAbsent();
}

class CredentialsFound extends CredentialsRead {
  const CredentialsFound(this.config);

  final AppConfig config;
}

/// A file that exists but cannot be used. The app stops at setup rather than
/// falling back to another backend behind the user's back (SPEC-credentials
/// Decision 2).
class CredentialsInvalid extends CredentialsRead {
  const CredentialsInvalid(this.reason);

  final String reason;
}

/// Reads and writes the values a user typed in the app.
///
/// The file is written `.tmp` then renamed, the rule the rest of the app
/// follows, so a half write never replaces a good file.
class CredentialsStore {
  CredentialsStore({Future<Directory> Function()? folder})
    : _folder = folder ?? getApplicationSupportDirectory;

  final Future<Directory> Function() _folder;

  Future<File> _file() async {
    final folder = await _folder();
    return File(p.join(folder.path, credentialsFileName));
  }

  Future<CredentialsRead> read() async {
    try {
      final file = await _file();
      if (!await file.exists()) return const CredentialsAbsent();
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is! Map<String, dynamic>) {
        return const CredentialsInvalid('The file does not hold credentials.');
      }
      final url = _text(decoded['supabaseUrl']);
      final key = _text(decoded['supabaseAnonKey']);
      final manifest = _text(decoded['updateManifestUrl']);
      final problem =
          configFieldProblem(ConfigField.supabaseUrl, url) ??
          configFieldProblem(ConfigField.supabaseAnonKey, key) ??
          configFieldProblem(ConfigField.updateManifestUrl, manifest);
      if (problem != null) return CredentialsInvalid(problem);
      return CredentialsFound(
        AppConfig.fromValues(
          supabaseUrl: url,
          supabaseAnonKey: key,
          updateManifestUrl: manifest,
        ),
      );
    } on FormatException {
      return const CredentialsInvalid('The file is not valid JSON.');
    } on Object {
      return const CredentialsInvalid('The file could not be read.');
    }
  }

  /// Writes [config] whole; false when the file could not be written.
  Future<bool> write(AppConfig config) async {
    File? temporary;
    try {
      final file = await _file();
      await file.parent.create(recursive: true);
      temporary = File('${file.path}.tmp');
      await temporary.writeAsString(
        jsonEncode({
          'supabaseUrl': config.supabaseUrl,
          'supabaseAnonKey': config.supabaseAnonKey,
          'updateManifestUrl': config.updateManifestUrl,
        }),
        flush: true,
      );
      await temporary.rename(file.path);
      temporary = null;
      return true;
    } on Object {
      try {
        if (temporary != null && await temporary.exists()) {
          await temporary.delete();
        }
      } on Object {
        // Nothing complete was left behind.
      }
      return false;
    }
  }

  /// Removes the saved values; true when there is none left.
  Future<bool> clear() async {
    try {
      final file = await _file();
      if (await file.exists()) await file.delete();
      return true;
    } on Object {
      return false;
    }
  }

  static String _text(Object? value) => value is String ? value.trim() : '';
}
