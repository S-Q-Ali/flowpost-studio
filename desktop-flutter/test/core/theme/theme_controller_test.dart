import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/theme/theme_controller.dart';

import '../../support/fake_theme_store.dart';

ProviderContainer _container(
  FakeThemeStore store, {
  ThemeMode initial = ThemeMode.system,
}) {
  final container = ProviderContainer(
    overrides: [
      themeStoreProvider.overrideWithValue(store),
      themeControllerProvider.overrideWith(
        () => ThemeController(initial: initial),
      ),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  test('the mode startup loaded is the mode the app starts on', () {
    final container = _container(FakeThemeStore(), initial: ThemeMode.dark);
    expect(container.read(themeControllerProvider), ThemeMode.dark);
  });

  test('no stored mode starts with the system', () {
    final container = _container(FakeThemeStore());
    expect(container.read(themeControllerProvider), ThemeMode.system);
  });

  test('picking a mode saves it and every watcher follows', () async {
    final store = FakeThemeStore();
    final container = _container(store);
    final picked = await container
        .read(themeControllerProvider.notifier)
        .setMode(ThemeMode.dark);
    expect(picked, isTrue);
    expect(store.saved, ThemeMode.dark);
    expect(container.read(themeControllerProvider), ThemeMode.dark);
  });

  test('a mode the file refused never reaches the screen', () async {
    final store = FakeThemeStore()..refusesWrite = true;
    final container = _container(store);
    final picked = await container
        .read(themeControllerProvider.notifier)
        .setMode(ThemeMode.dark);
    expect(picked, isFalse);
    expect(container.read(themeControllerProvider), ThemeMode.system);
  });

  test('the mode already in use is not written again', () async {
    final store = FakeThemeStore();
    final container = _container(store, initial: ThemeMode.light);
    final picked = await container
        .read(themeControllerProvider.notifier)
        .setMode(ThemeMode.light);
    expect(picked, isTrue);
    expect(store.writes, isEmpty);
  });
}
