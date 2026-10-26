// ignore_for_file: deprecated_member_use
import 'package:tray_manager/legacy.dart';

/// Tray context menu for the shell. Kept as a pure builder so tests can
/// assert the items without a running platform plugin.
abstract final class TrayMenu {
  static const String showTag = 'show';
  static const String quitTag = 'quit';

  static List<MenuItem> items() {
    return [
      MenuItem(key: showTag, label: 'Show FlowPost'),
      MenuItem.separator(),
      MenuItem(key: quitTag, label: 'Quit'),
    ];
  }

  static Menu build() => Menu(items: items());
}
