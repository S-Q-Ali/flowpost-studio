import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/shell/tray_menu.dart';

void main() {
  test('tray menu offers Show, a separator, and Quit', () {
    final items = TrayMenu.items();
    expect(items.length, 3);
    expect(items[0].label, 'Show FlowPost');
    expect(items[0].key, TrayMenu.showTag);
    expect(items[2].label, 'Quit');
    expect(items[2].key, TrayMenu.quitTag);
  });
}
