import 'package:flowpost_desktop/features/accounts/domain/connect_target.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('the connects are the six the server can start in a browser', () {
    expect(connectTargets.map((target) => target.serverPlatform), [
      'youtube',
      'instagram',
      'facebook',
      'tiktok',
      'linkedin',
      'google_drive',
    ]);
  });

  test('MEGA is never offered a connect — its sign-in has no return link', () {
    expect(canConnect('mega'), isFalse);
  });

  test('a platform the server does not know is not connectable', () {
    expect(canConnect('myspace'), isFalse);
    expect(canConnect(''), isFalse);
  });

  test('a message names each connectable platform the way the card does', () {
    for (final target in connectTargets) {
      expect(connectLabelOf(target.serverPlatform), target.label);
    }
  });

  test('a platform the app cannot re-connect is still named for a message', () {
    // MEGA has a card and no connect, so a disconnect still reads well.
    expect(connectLabelOf('mega'), 'MEGA');
  });

  test('a name the app has never heard is said back unchanged', () {
    expect(connectLabelOf('myspace'), 'myspace');
  });
}
