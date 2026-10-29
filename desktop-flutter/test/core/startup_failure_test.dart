import 'dart:async';
import 'dart:io';

import 'package:flowpost_desktop/core/logging/startup_failure.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:logging/logging.dart';

void main() {
  late List<LogRecord> records;
  late StreamSubscription<LogRecord> subscription;

  setUp(() {
    records = [];
    Logger.root.level = Level.ALL;
    subscription = Logger.root.onRecord.listen(records.add);
  });
  tearDown(() => subscription.cancel());

  test('the message names the log file and what to do with it', () {
    final message = startupFailureMessage(r'C:\Users\Jane\AppData\logs');

    expect(message, contains('could not start'));
    expect(message, contains(r'C:\Users\Jane\AppData\logs'));
    expect(message, contains('Send that file'));
  });

  test('a failed start is logged and shown with the log folder', () async {
    String? shown;
    await reportStartupFailure(
      error: StateError('no window'),
      stackTrace: StackTrace.current,
      log: Logger('startup-test'),
      logs: () async => Directory(r'C:\Users\Jane\AppData\logs'),
      showMessage: (message) async => shown = message,
    );

    expect(shown, contains(r'C:\Users\Jane\AppData\logs'));
    expect(
      records.any((record) => record.message.contains('no window')),
      isTrue,
    );
    expect(records.any((record) => record.error is StateError), isTrue);
  });

  test('a log folder that cannot be found still shows a message', () async {
    String? shown;
    await reportStartupFailure(
      error: StateError('no window'),
      stackTrace: StackTrace.current,
      log: Logger('startup-test'),
      logs: () async => throw const FileSystemException('no support folder'),
      showMessage: (message) async => shown = message,
    );

    expect(shown, contains('app data folder'));
  });

  test('a message that cannot be shown does not escape', () async {
    await expectLater(
      reportStartupFailure(
        error: StateError('no window'),
        stackTrace: StackTrace.current,
        log: Logger('startup-test'),
        logs: () async => Directory(r'C:\logs'),
        showMessage: (message) async => throw StateError('no desktop'),
      ),
      completes,
    );

    expect(
      records.any(
        (record) => record.level == Level.WARNING && record.error != null,
      ),
      isTrue,
    );
  });
}
