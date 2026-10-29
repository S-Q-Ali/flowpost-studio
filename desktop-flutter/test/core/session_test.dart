import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/core/session/session.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

const Session _session = Session(
  sessionToken: 'session-token',
  accessToken: 'access-token',
);

void main() {
  test('no one is signed in before a session exists', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    expect(container.read(sessionProvider), isNull);
    expect(container.read(sessionTokenProvider), isNull);
    expect(container.read(authAccessTokenProvider), isNull);
  });

  test('a session hands both tokens to the calls', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    container.read(sessionProvider.notifier).signIn(_session);

    expect(container.read(sessionTokenProvider), 'session-token');
    expect(container.read(authAccessTokenProvider), 'access-token');
  });

  test('clearing the session leaves no token behind', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    container.read(sessionProvider.notifier).signIn(_session);

    container.read(sessionProvider.notifier).clear();

    expect(container.read(sessionProvider), isNull);
    expect(container.read(sessionTokenProvider), isNull);
    expect(container.read(authAccessTokenProvider), isNull);
  });
}
