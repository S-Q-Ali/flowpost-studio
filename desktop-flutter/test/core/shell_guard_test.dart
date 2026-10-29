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

    test('restores the batch when reading it fails', () async {
      await intents.writeAsString('flowpost://first\n');
      await drainIntentFile(
        intents,
        (_) {},
        readLines: (_) async =>
            throw const FileSystemException('simulated read failure'),
      );

      expect(await intents.exists(), isTrue);
      expect(await intents.readAsString(), 'flowpost://first\n');
    });

    test('appends a failed batch to a concurrently recreated file', () async {
      await intents.writeAsString('flowpost://first\n');
      await drainIntentFile(
        intents,
        (_) {},
        readLines: (_) async {
          // A secondary instance wrote while this batch was being read.
          await intents.writeAsString(
            'flowpost://second\n',
            mode: FileMode.append,
          );
          throw const FileSystemException('simulated read failure');
        },
      );

      final restored = await intents.readAsString();
      expect(restored, contains('flowpost://first'));
      expect(restored, contains('flowpost://second'));
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

  group('isFlowPostProcess', () {
    test('treats an uninspectable pid as alive', () {
      // Fail closed: a PID we cannot inspect must never allow a second primary.
      expect(isFlowPostProcess(0x7FFFFFFF), isTrue);
    });

    test('rejects a live process that is not flowpost.exe', () {
      expect(isFlowPostProcess(pid), isFalse);
    });
  });

  group('configureTray', () {
    test('reports success only after every tray step runs', () async {
      final calls = <String>[];
      final error = await configureTray(
        setIcon: () async => calls.add('icon'),
        setToolTip: () async => calls.add('tip'),
        setContextMenu: () async => calls.add('menu'),
        addListener: () => calls.add('listener'),
      );

      expect(error, isNull);
      expect(calls, ['icon', 'tip', 'menu', 'listener']);
    });

    test('returns the failure and stops when the icon cannot load', () async {
      final calls = <String>[];
      final error = await configureTray(
        setIcon: () async {
          calls.add('icon');
          throw StateError('missing tray icon');
        },
        setToolTip: () async => calls.add('tip'),
        setContextMenu: () async => calls.add('menu'),
        addListener: () => calls.add('listener'),
      );

      expect(error, isA<StateError>());
      expect(calls, ['icon']);
    });
  });
}
