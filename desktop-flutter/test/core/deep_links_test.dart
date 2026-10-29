import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/router/deep_links.dart';

void main() {
  const allowed = ['/', '/auth-callback'];

  group('describeDeepLink', () {
    test('drops query and fragment so codes never reach a log', () {
      expect(
        describeDeepLink(
          'flowpost://auth-callback?code=abc123&state=xyz#token=nope',
        ),
        'flowpost://auth-callback',
      );
    });

    test('returns a stable marker for malformed input', () {
      expect(describeDeepLink('not a uri'), '<malformed>');
    });
  });

  group('resolveDeepLink', () {
    test('maps an auth callback with a query to its route', () {
      final route = resolveDeepLink(
        Uri.parse('flowpost://auth-callback?code=abc123&state=xyz'),
        allowedPaths: allowed,
      );
      expect(route, '/auth-callback?code=abc123&state=xyz');
    });

    test('maps the bare protocol to home', () {
      expect(
        resolveDeepLink(Uri.parse('flowpost:///'), allowedPaths: allowed),
        '/',
      );
    });

    test('rejects paths outside the allowlist', () {
      expect(
        resolveDeepLink(
          Uri.parse('flowpost://evil/../../admin'),
          allowedPaths: allowed,
        ),
        isNull,
      );
      expect(
        resolveDeepLink(
          Uri.parse('flowpost://settings'),
          allowedPaths: allowed,
        ),
        isNull,
      );
    });

    test('rejects other schemes and hosts', () {
      expect(
        resolveDeepLink(
          Uri.parse('https://flowpost/auth-callback'),
          allowedPaths: allowed,
        ),
        isNull,
      );
      expect(
        resolveDeepLink(
          Uri.parse('flowpost://evil.com/auth-callback'),
          allowedPaths: allowed,
        ),
        isNull,
      );
    });
  });
}
