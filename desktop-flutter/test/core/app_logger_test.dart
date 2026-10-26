import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/logging/app_logger.dart';

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

  test('leaves messages without secrets untouched', () {
    const safe = 'Handed handoff intent to the primary process.';
    expect(redactSecrets(safe), safe);
  });
}
