import 'package:flutter_test/flutter_test.dart';

import 'package:flowpost_desktop/main.dart';

void main() {
  test('a launch that did not take the lock cleans up nothing', () async {
    final calls = <String>[];

    final isPrimary = await startAsPrimary(
      acquireGuard: () async {
        calls.add('lock');
        return false;
      },
      onlyForPrimary: () async => calls.add('cleanup'),
    );

    expect(isPrimary, isFalse);
    expect(calls, ['lock']);
  });

  test('the primary launch cleans up only after the lock', () async {
    final calls = <String>[];

    final isPrimary = await startAsPrimary(
      acquireGuard: () async {
        calls.add('lock');
        return true;
      },
      onlyForPrimary: () async => calls.add('cleanup'),
    );

    expect(isPrimary, isTrue);
    expect(calls, ['lock', 'cleanup']);
  });
}
