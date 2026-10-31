import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/providers/app_providers.dart';
import 'data/auth_repository.dart';
import 'data/identity_client.dart';
import 'data/identity_store.dart';
import 'data/oauth_flow.dart';
import 'data/supabase_gateways.dart';

/// The single Supabase client; tests override it with a recording starter.
final identityClientProvider = Provider<IdentityClient>(
  (ref) => IdentityClient(),
);

/// The vault the identity records live in; tests override it.
final identityStoreProvider = Provider<SecureIdentityStore>(
  (ref) => SecureIdentityStore(),
);

typedef BrowserLauncher = Future<bool> Function(Uri url);

/// Opens the system browser for the Google hand-off; tests record the URL.
final browserLauncherProvider = Provider<BrowserLauncher>(
  (ref) =>
      (url) => launchUrl(url, mode: LaunchMode.externalApplication),
);

/// Everything the identity controller needs, built on one started client.
class IdentityService {
  const IdentityService({
    required this.repository,
    required this.oauth,
    required this.store,
  });

  final AuthRepository repository;
  final OAuthFlow oauth;
  final IdentityStore store;
}

/// Starts the Supabase SDK with the running backend values and wires the
/// gateways. Nothing else in the app constructs a client.
final identityServiceProvider = FutureProvider<IdentityService>((ref) async {
  final config = ref.watch(appConfigProvider);
  final store = ref.watch(identityStoreProvider);
  final client = await ref
      .watch(identityClientProvider)
      .start(
        IdentityStartRequest(
          url: config.supabaseUrl,
          anonKey: config.supabaseAnonKey,
          localStorage: store,
          pkceStorage: store,
        ),
      );
  final auth = SupabaseAuthGateway(client);
  final repository = AuthRepository(
    auth: auth,
    users: SupabaseUsersGateway(client),
    functions: SupabaseFunctionsGateway(client),
    store: store,
  );
  return IdentityService(
    repository: repository,
    oauth: OAuthFlow(auth: auth, repository: repository, store: store),
    store: store,
  );
});
