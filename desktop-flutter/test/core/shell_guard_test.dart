import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/shell/flowpost_shell.dart';

void main() {
  group('drainIntentFile', () {
    late Directory dir;
    late File intents;

    setUp(() async {
      dir = await Directory.systemTemp.createTemp('flowpost_intents');
      intents = File(
        '${dir.path}${Platform.pathSeparator}flowpost-intents.txt',
      );
    });
    tearDown(() => dir.deleteSync(recursive: true));

    test('delivers every queued intent and clears the file', () async {
      await intents.writeAsString(
        'flowpost://auth-callback?code=1\nflowpost://focus\n',
      );
      final received = <String>[];
      await drainIntentFile(intents, received.add);
      expect(received, ['flowpost://auth-callback?code=1', 'flowpost://focus']);
      expect(await intents.exists(), isFalse);
    });

    test('keeps intents appended while a batch is processing', () async {
      await intents.writeAsString('flowpost://first\n');
      final received = <String>[];
      await drainIntentFile(intents, (link) {
        received.add(link);
        if (received.length == 1) {
          // A secondary instance hands off while the first batch is in flight.
          intents.writeAsStringSync(
            'flowpost://second\n',
            mode: FileMode.append,
          );
        }
      });
      expect(received, ['flowpost://first', 'flowpost://second']);
    });
  });

  group('isFlowPostImage', () {
    test('matches the branded executable name case-insensitively', () {
      expect(
        isFlowPostImage(r'C:\Program Files\FlowPost\flowpost.EXE'),
        isTrue,
      );
      expect(isFlowPostImage(r'C:\Windows\explorer.exe'), isFalse);
      expect(isFlowPostImage(null), isFalse);
    });
  });
}
