import 'package:flowpost_desktop/features/identity/data/identity_client.dart';
import 'package:flowpost_desktop/features/identity/identity_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _MemoryLocalStorage extends LocalStorage {
  String? _value;

  @override
  Future<void> initialize() async {}

  @override
  Future<bool> hasAccessToken() async => _value != null;

  @override
  Future<String?> accessToken() async => _value;

  @override
  Future<void> persistSession(String persistSessionString) async =>
      _value = persistSessionString;

  @override
  Future<void> removePersistedSession() async => _value = null;
}

class _MemoryPkceStorage extends GotrueAsyncStorage {
  final Map<String, String> _values = {};

  @override
  Future<String?> getItem({required String key}) async => _values[key];

  @override
  Future<void> setItem({required String key, required String value}) async =>
      _values[key] = value;

  @override
  Future<void> removeItem({required String key}) async => _values.remove(key);
}

IdentityStartRequest _request({
  LocalStorage? localStorage,
  GotrueAsyncStorage? pkce,
}) {
  return IdentityStartRequest(
    url: 'https://project.supabase.co',
    anonKey: 'anon-key',
    localStorage: localStorage ?? _MemoryLocalStorage(),
    pkceStorage: pkce ?? _MemoryPkceStorage(),
  );
}

void main() {
  final client = SupabaseClient('https://project.supabase.co', 'anon-key');

  test(
    'auth options leave deep links to the shell and store the PKCE verifier',
    () {
      final localStorage = _MemoryLocalStorage();
      final pkce = _MemoryPkceStorage();

      final options = identityAuthOptions(
        localStorage: localStorage,
        pkceStorage: pkce,
      );

      expect(options.detectSessionInUri, isFalse);
      expect(options.localStorage, same(localStorage));
      expect(options.pkceAsyncStorage, same(pkce));
    },
  );

  test('starting twice builds one client and forwards the request', () async {
    IdentityStartRequest? seen;
    var calls = 0;
    final identity = IdentityClient(
      starter: (request) async {
        calls++;
        seen = request;
        return client;
      },
    );
    final request = _request();

    final first = await identity.start(request);
    final second = await identity.start(request);

    expect(calls, 1);
    expect(identical(first, second), isTrue);
    expect(identity.current, same(client));
    expect(seen?.url, request.url);
    expect(seen?.anonKey, request.anonKey);
    expect(seen?.localStorage, same(request.localStorage));
    expect(seen?.pkceStorage, same(request.pkceStorage));
  });

  test('a failed start can be retried', () async {
    var calls = 0;
    final identity = IdentityClient(
      starter: (request) async {
        calls++;
        if (calls == 1) throw StateError('offline');
        return client;
      },
    );

    await expectLater(identity.start(_request()), throwsStateError);

    expect(await identity.start(_request()), same(client));
    expect(calls, 2);
  });

  test('the provider takes a client with no side effects until started', () {
    final identity = IdentityClient(starter: (request) async => client);
    final container = ProviderContainer(
      overrides: [identityClientProvider.overrideWithValue(identity)],
    );
    addTearDown(container.dispose);

    expect(container.read(identityClientProvider), same(identity));
    expect(identity.current, isNull);
  });
}
