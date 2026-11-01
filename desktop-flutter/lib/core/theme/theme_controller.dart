import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'theme_store.dart';

/// The file the look is kept in; tests answer it.
final Provider<ThemeStore> themeStoreProvider = Provider<ThemeStore>(
  (ref) => ThemeStore(),
);

/// The look the app shows: the mode the user picked, or the system's.
final themeControllerProvider = NotifierProvider<ThemeController, ThemeMode>(
  ThemeController.new,
);

class ThemeController extends Notifier<ThemeMode> {
  ThemeController({this.initial = ThemeMode.system});

  /// What startup read from the file, so the first frame is already in the
  /// saved look rather than flashing the system one.
  final ThemeMode initial;

  @override
  ThemeMode build() => initial;

  /// Writes [mode] and shows it.
  ///
  /// False, with nothing changed, when the file refused: a look that does not
  /// survive a restart is one the user would have to pick again every time.
  Future<bool> setMode(ThemeMode mode) async {
    if (mode == state) return true;
    final saved = await ref.read(themeStoreProvider).write(mode);
    if (!saved) return false;
    state = mode;
    return true;
  }
}
