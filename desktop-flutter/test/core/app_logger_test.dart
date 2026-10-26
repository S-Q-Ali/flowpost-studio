import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/logging/app_logger.dart';
import 'package:logging/logging.dart';

void main() {
  test('redacts query-style and JSON token values', () {
    expect(
      redactSecrets('GET /auth?access_token=supersecret&x=1'),
      'GET /auth?access_token=[redacted]&x=1',
    );
    expect(
      redactSecrets('{"refresh_token":"abcdef","user":"ali"}'),
      '{"refresh_token":"[redacted]","user":"ali"}',
    );
  });

  test('keeps the original key casing when redacting', () {
    expect(
      redactSecrets('GET /auth?ACCESS_TOKEN=supersecret&x=1'),
      'GET /auth?ACCESS_TOKEN=[redacted]&x=1',
    );
    expect(
      redactSecrets('{"Refresh_Token":"abcdef"}'),
      '{"Refresh_Token":"[redacted]"}',
    );
  });

  test('leaves messages without secrets untouched', () {
    const safe = 'Handed handoff intent to the primary process.';
    expect(redactSecrets(safe), safe);
  });

  group('flushLogging', () {
    // In widget tests path_provider has no implementation, so every queued
    // write fails inside the chain — exactly the failure that must not
    // poison _lastWrite or make flushLogging() throw before exit(0).
    test('completes even when the underlying write fails', () async {
      await initLogging();
      Logger.root.info('unwritable in tests');
      await expectLater(flushLogging(), completes);
      Logger.root.info('still accepted after a failed write');
      await expectLater(flushLogging(), completes);
    });
  });

  group('rotateLogIfNeeded', () {
    late Directory dir;

    setUp(() async {
      dir = await Directory.systemTemp.createTemp('flowpost_logs');
    });
    tearDown(() => dir.deleteSync(recursive: true));

    test('archives the log once it exceeds the size cap', () async {
      final log = File('${dir.path}${Platform.pathSeparator}app.log');
      await log.writeAsString('x' * 200);
      await rotateLogIfNeeded(log, maxBytes: 100);
      expect(await log.exists(), isFalse);
      final archive = File('${log.path}.1');
      expect(await archive.exists(), isTrue);
      expect(await archive.length(), 200);
    });

    test('replaces the previous archive when rotating again', () async {
      final log = File('${dir.path}${Platform.pathSeparator}app.log');
      final archive = File('${log.path}.1');
      await archive.writeAsString('old');
      await log.writeAsString('y' * 200);
      await rotateLogIfNeeded(log, maxBytes: 100);
      expect(await archive.length(), 200);
    });

    test('leaves a log under the cap alone', () async {
      final log = File('${dir.path}${Platform.pathSeparator}app.log');
      await log.writeAsString('short');
      await rotateLogIfNeeded(log, maxBytes: 100);
      expect(await log.length(), 5);
      expect(await File('${log.path}.1').exists(), isFalse);
    });
  });
}
