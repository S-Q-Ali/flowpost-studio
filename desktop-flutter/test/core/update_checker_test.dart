import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/update/update_checker.dart';

void main() {
  group('isNewerVersion', () {
    test('compares numeric parts, not strings', () {
      expect(isNewerVersion('1.10.0', '1.9.9'), isTrue);
      expect(isNewerVersion('2.0.0', '1.99.99'), isTrue);
      expect(isNewerVersion('1.2.3', '1.2.3'), isFalse);
      expect(isNewerVersion('1.2.2', '1.2.3'), isFalse);
    });

    test('ignores build metadata and pre-release suffixes', () {
      expect(isNewerVersion('1.2.3+4', '1.2.3'), isFalse);
      expect(isNewerVersion('1.2.3-beta.1', '1.2.2'), isTrue);
    });

    test('returns false for malformed versions', () {
      expect(isNewerVersion('latest', '1.0.0'), isFalse);
      expect(isNewerVersion('1.x.0', '1.0.0'), isFalse);
    });
  });

  group('parseManifest', () {
    test('reads a version and an https download URL', () {
      final manifest = parseManifest(
        '{"version":"1.1.0","downloadUrl":"https://example.com/FlowPost.exe"}',
      );
      expect(manifest.version, '1.1.0');
      expect(
        manifest.downloadUrl.toString(),
        'https://example.com/FlowPost.exe',
      );
    });

    test('rejects a non-https download URL', () {
      expect(
        () => parseManifest(
          '{"version":"1.1.0","downloadUrl":"http://example.com/FlowPost.exe"}',
        ),
        throwsFormatException,
      );
    });

    test('rejects missing fields and invalid JSON', () {
      expect(() => parseManifest('{}'), throwsFormatException);
      expect(() => parseManifest('not json'), throwsFormatException);
    });
  });

  group('checkForUpdate', () {
    final manifestUrl = Uri.parse('https://example.com/update.json');

    test('returns the newer version and download URL', () async {
      final result = await checkForUpdate(
        manifestUrl: manifestUrl,
        currentVersion: '1.0.0',
        fetchManifest: (_) async => '{"version":"1.1.0","downloadUrl":"https://example.com/FlowPost.exe"}',
      );

      expect(result.hasUpdate, isTrue);
      expect(result.latestVersion, '1.1.0');
      expect(result.error, isNull);
    });

    test('reports no update when the version is current', () async {
      final result = await checkForUpdate(
        manifestUrl: manifestUrl,
        currentVersion: '1.1.0',
        fetchManifest: (_) async => '{"version":"1.1.0","downloadUrl":"https://example.com/FlowPost.exe"}',
      );

      expect(result.hasUpdate, isFalse);
      expect(result.error, isNull);
    });

    test('turns malformed responses into an error', () async {
      final result = await checkForUpdate(
        manifestUrl: manifestUrl,
        currentVersion: '1.0.0',
        fetchManifest: (_) async => 'not json',
      );

      expect(result.hasUpdate, isFalse);
      expect(result.error, isNotNull);
    });

    test('turns fetch failures into an error', () async {
      final result = await checkForUpdate(
        manifestUrl: manifestUrl,
        currentVersion: '1.0.0',
        fetchManifest: (_) async => throw const FormatException('offline'),
      );

      expect(result.hasUpdate, isFalse);
      expect(result.error, isNotNull);
    });
  });

  group('fetchUpdateManifest', () {
    test(
      'a server that never answers is cut off by the whole budget',
      () async {
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        // The server takes the request and never answers.
        server.listen((request) async {
          await request.drain<void>();
        });

        await expectLater(
          fetchUpdateManifest(
            Uri.parse('http://127.0.0.1:${server.port}/update.json'),
            timeout: const Duration(milliseconds: 300),
          ),
          throwsA(isA<TimeoutException>()),
        );
      },
    );
  });
}
