import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/theme/theme_store.dart';

void main() {
  late Directory folder;
  late ThemeStore store;

  setUp(() async {
    folder = await Directory.systemTemp.createTemp('flowpost-theme-');
    store = ThemeStore(folder: () async => folder);
  });

  tearDown(() async {
    if (await folder.exists()) await folder.delete(recursive: true);
  });

  File file() =>
      File('${folder.path}${Platform.pathSeparator}preferences.json');

  test('no file is no saved mode', () async {
    expect(await store.read(), isNull);
  });

  test('a saved mode comes back on the next read', () async {
    expect(await store.write(ThemeMode.dark), isTrue);
    expect(await store.read(), ThemeMode.dark);
  });

  test('a write replaces the mode, not the file', () async {
    await store.write(ThemeMode.dark);
    await store.write(ThemeMode.light);
    expect(await store.read(), ThemeMode.light);
    expect(jsonDecode(await file().readAsString()), {'themeMode': 'light'});
  });

  test('a corrupt file is no saved mode', () async {
    await file().create(recursive: true);
    await file().writeAsString('{not json');
    expect(await store.read(), isNull);
  });

  test('a file naming no known mode is no saved mode', () async {
    await file().create(recursive: true);
    await file().writeAsString(jsonEncode({'themeMode': 'sepia'}));
    expect(await store.read(), isNull);
  });

  test('a file the app cannot read is no saved mode', () async {
    // A folder where the file should be: opening it as text always fails.
    Directory(file().path).createSync(recursive: true);
    expect(await store.read(), isNull);
  });

  test('a mode that cannot be written says so', () async {
    // The data root is a file, so no preferences file can be made inside it.
    final blocked = File('${folder.path}${Platform.pathSeparator}blocked');
    await blocked.create();
    final stuck = ThemeStore(folder: () async => Directory(blocked.path));
    expect(await stuck.write(ThemeMode.dark), isFalse);
  });
}
