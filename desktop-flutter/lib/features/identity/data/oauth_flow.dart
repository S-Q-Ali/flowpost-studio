import 'dart:convert';
import 'dart:math';

import 'auth_errors.dart';
import 'auth_repository.dart';
import 'identity_models.dart';
import 'identity_store.dart';

/// The Google sign-in hand-off: one pending state, 32 random bytes, five
/// minutes, consumed before the code is exchanged (SPEC-identity Decision 3).
class OAuthFlow {
  OAuthFlow({
    required this.auth,
    required this.repository,
    required this.store,
    DateTime Function()? now,
    Random? random,
  }) : _now = now ?? DateTime.now,
       _random = random ?? Random.secure();

  static const String redirectUri = 'flowpost://auth-callback';
  static const Duration stateLifetime = Duration(minutes: 5);

  final AuthGateway auth;
  final AuthRepository repository;
  final IdentityStore store;
  final DateTime Function() _now;
  final Random _random;

  /// Persists a fresh state and returns the URL for the system browser.
  Future<String> begin() async {
    try {
      final state = _newState();
      await store.writePendingOAuth(
        PendingOAuth(state: state, createdAt: _now()),
      );
      return await auth.oauthSignInUrl(
        redirectTo: '$redirectUri?state=${Uri.encodeQueryComponent(state)}',
      );
    } on Object catch (error) {
      await store.deletePendingOAuth();
      throw mapGatewayFailure(error);
    }
  }

  /// Validates a `flowpost://auth-callback` link and exchanges its code.
  ///
  /// The matching state is deleted before the exchange, so a consumed code is
  /// never retried; the user starts a new sign-in instead.
  Future<AuthSession> accept(String rawLink) async {
    final uri = Uri.tryParse(rawLink);
    if (uri == null ||
        uri.scheme != 'flowpost' ||
        uri.host != 'auth-callback' ||
        (uri.path.isNotEmpty && uri.path != '/')) {
      throw const IdentityException(IdentityError.oauthStateInvalid);
    }
    if (uri.queryParameters.containsKey('error')) {
      await store.deletePendingOAuth();
      throw const IdentityException(IdentityError.oauthCancelled);
    }

    final state = uri.queryParameters['state'];
    final pending = await store.readPendingOAuth();
    if (state == null ||
        state.isEmpty ||
        pending == null ||
        pending.state != state) {
      throw const IdentityException(IdentityError.oauthStateInvalid);
    }
    if (_now().difference(pending.createdAt) > stateLifetime) {
      await store.deletePendingOAuth();
      throw const IdentityException(IdentityError.oauthStateInvalid);
    }

    await store.deletePendingOAuth();

    final code = uri.queryParameters['code'];
    if (code == null || code.isEmpty) {
      throw const IdentityException(IdentityError.oauthStateInvalid);
    }
    return repository.exchangeCode(code);
  }

  String _newState() {
    final bytes = List<int>.generate(32, (_) => _random.nextInt(256));
    return base64UrlEncode(bytes).replaceAll('=', '');
  }
}
