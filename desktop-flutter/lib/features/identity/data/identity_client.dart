import 'package:supabase_flutter/supabase_flutter.dart';

/// Starts the Supabase SDK once; tests replace it with a recorder.
typedef SupabaseStarter = Future<SupabaseClient> Function(
  IdentityStartRequest request,
);

/// The values and stores Supabase is started with.
class IdentityStartRequest {
  const IdentityStartRequest({
    required this.url,
    required this.anonKey,
    required this.localStorage,
    required this.pkceStorage,
  });

  final String url;
  final String anonKey;

  /// Persists the Supabase session; supplied by the secure store adapter.
  final LocalStorage localStorage;

  /// Persists the PKCE verifier; supplied by the secure store adapter.
  final GotrueAsyncStorage pkceStorage;
}

/// The auth options the app depends on.
///
/// `detectSessionInUri` stays false because the shell's deep-link dispatcher
/// is the only thing that routes `flowpost://` links (SPEC-identity 3).
FlutterAuthClientOptions identityAuthOptions({
  required LocalStorage localStorage,
  required GotrueAsyncStorage pkceStorage,
}) {
  return FlutterAuthClientOptions(
    localStorage: localStorage,
    pkceAsyncStorage: pkceStorage,
    detectSessionInUri: false,
  );
}

/// The app's only Supabase client.
///
/// Created here and nowhere else, so a test never touches the network and the
/// SDK is not initialized from a screen.
class IdentityClient {
  IdentityClient({SupabaseStarter? starter})
    : _starter = starter ?? _startSupabase;

  final SupabaseStarter _starter;
  SupabaseClient? _current;
  Future<SupabaseClient>? _pending;

  /// The started client, or null before [start] has completed.
  SupabaseClient? get current => _current;

  /// Starts the SDK, or returns the client already started.
  ///
  /// A failed attempt is not cached, so a later retry can succeed.
  Future<SupabaseClient> start(IdentityStartRequest request) async {
    final current = _current;
    if (current != null) return current;
    final pending = _pending;
    if (pending != null) return pending;

    final attempt = _attempt(request);
    _pending = attempt;
    try {
      return await attempt;
    } finally {
      if (identical(_pending, attempt)) _pending = null;
    }
  }

  Future<SupabaseClient> _attempt(IdentityStartRequest request) async {
    final client = await _starter(request);
    _current = client;
    return client;
  }
}

Future<SupabaseClient> _startSupabase(IdentityStartRequest request) async {
  final supabase = await Supabase.initialize(
    url: request.url,
    publishableKey: request.anonKey,
    authOptions: identityAuthOptions(
      localStorage: request.localStorage,
      pkceStorage: request.pkceStorage,
    ),
  );
  return supabase.client;
}
