import 'package:flutter/material.dart' show ThemeMode;
import 'package:flowpost_desktop/core/theme/theme_store.dart';

/// Answers what the test names, and keeps what the app wrote.
class FakeThemeStore implements ThemeStore {
  FakeThemeStore([this.saved]);

  /// The mode the file holds.
  ThemeMode? saved;

  /// When true the write fails, as it does on a full disk.
  bool refusesWrite = false;

  /// What the app asked to keep, in order.
  final List<ThemeMode> writes = [];

  @override
  Future<ThemeMode?> read() async => saved;

  @override
  Future<bool> write(ThemeMode mode) async {
    if (refusesWrite) return false;
    writes.add(mode);
    saved = mode;
    return true;
  }
}
