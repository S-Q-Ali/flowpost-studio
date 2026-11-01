import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart' show ThemeMode;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// The look settings, beside `credentials.json` and `accounts.json`.
const String preferencesFileName = 'preferences.json';

/// Reads and writes the theme mode the app was told to use.
///
/// Written `.tmp` then renamed, the rule the rest of the app follows, so a
/// half write never replaces a good file.
class ThemeStore {
  ThemeStore({Future<Directory> Function()? folder})
    : _folder = folder ?? getApplicationSupportDirectory;

  final Future<Directory> Function() _folder;

  Future<File> _file() async {
    final folder = await _folder();
    return File(p.join(folder.path, preferencesFileName));
  }

  /// The saved mode, or null when there is nothing usable: no file, a file
  /// that cannot be read, or a name this app has no screen for.
  Future<ThemeMode?> read() async {
    try {
      final file = await _file();
      if (!await file.exists()) return null;
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is! Map) return null;
      final name = decoded['themeMode'];
      if (name is! String) return null;
      return ThemeMode.values.asNameMap()[name];
    } on Object {
      return null;
    }
  }

  /// Writes [mode]; false when the file could not be written.
  Future<bool> write(ThemeMode mode) async {
    File? temporary;
    try {
      final file = await _file();
      await file.parent.create(recursive: true);
      temporary = File('${file.path}.tmp');
      await temporary.writeAsString(
        jsonEncode({'themeMode': mode.name}),
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
}
