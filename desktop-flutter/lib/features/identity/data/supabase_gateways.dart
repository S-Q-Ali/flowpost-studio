import 'package:supabase_flutter/supabase_flutter.dart';

import 'auth_repository.dart';
import 'identity_models.dart';

/// Supabase Auth over the app's single client.
class SupabaseAuthGateway implements AuthGateway {
  SupabaseAuthGateway(this._client);

  final SupabaseClient _client;

  @override
  Future<AuthSession> signInWithPassword({
    required String email,
    required String password,
  }) async {
    final response = await _client.auth.signInWithPassword(
      email: email,
      password: password,
    );
    return _requireSession(response.session);
  }

  @override
  Future<AuthSession> exchangeCode(String code) async {
    final response = await _client.auth.exchangeCodeForSession(code);
    return _requireSession(response.session);
  }

  @override
  Future<AuthSession?> restoreSession() async =>
      _session(_client.auth.currentSession);

  @override
  Future<void> signOut() => _client.auth.signOut(scope: SignOutScope.global);
}

class SupabaseUsersGateway implements UsersGateway {
  SupabaseUsersGateway(this._client);

  final SupabaseClient _client;

  @override
  Future<AdminLookup> lookupAdmin(String userId) async {
    final rows = await _client
        .from('users')
        .select('id,is_admin')
        .eq('id', userId)
        .limit(1);
    if (rows.isEmpty) return AdminLookup.missing;
    return rows.first['is_admin'] == true
        ? AdminLookup.admin
        : AdminLookup.notAdmin;
  }
}

/// The backend functions, with the session JWT sent explicitly.
///
/// The Dart functions client does not attach the auth header by itself, and
/// the hardened questions function checks the caller.
class SupabaseFunctionsGateway implements FunctionsGateway {
  SupabaseFunctionsGateway(this._client);

  final SupabaseClient _client;

  static const String _questions = 'verify-security-questions';
  static const String _sessionFunction = 'verify-session';

  Map<String, String> get _authHeader {
    final token = _client.auth.currentSession?.accessToken;
    if (token == null) return const {};
    return {'Authorization': 'Bearer $token'};
  }

  @override
  Future<bool> questionsConfigured() async {
    final response = await _client.functions.invoke(
      _questions,
      method: HttpMethod.get,
      headers: _authHeader,
    );
    return _asMap(response.data)?['questionsConfigured'] == true;
  }

  @override
  Future<AdminToken> verifyQuestions({
    required String favTeacher,
    required String bestNightDate,
  }) async {
    final response = await _client.functions.invoke(
      _questions,
      headers: _authHeader,
      body: {
        'action': 'verify',
        'favTeacher': favTeacher,
        'bestNightDate': bestNightDate,
      },
    );
    final token = _asMap(response.data)?['token'];
    if (token is! String || token.isEmpty) {
      throw const IdentityException(IdentityError.unexpected);
    }
    return AdminToken(token: token, issuedAt: DateTime.now().toUtc());
  }

  @override
  Future<void> setQuestions({
    required String favTeacher,
    required String bestNightDate,
  }) async {
    final response = await _client.functions.invoke(
      _questions,
      headers: _authHeader,
      body: {
        'setQuestions': true,
        'favTeacher': favTeacher,
        'bestNightDate': bestNightDate,
      },
    );
    if (_asMap(response.data)?['success'] != true) {
      throw const IdentityException(IdentityError.unexpected);
    }
  }

  @override
  Future<bool> verifySession(String token) async {
    try {
      final response = await _client.functions.invoke(
        _sessionFunction,
        body: {'token': token},
      );
      return _asMap(response.data)?['valid'] == true;
    } on FunctionException catch (error) {
      if (error.status == 400 || error.status == 401) return false;
      rethrow;
    }
  }
}

AuthSession _requireSession(Session? session) {
  final mapped = _session(session);
  if (mapped == null) {
    throw const IdentityException(IdentityError.unexpected);
  }
  return mapped;
}

AuthSession? _session(Session? session) {
  if (session == null) return null;
  return AuthSession(
    accessToken: session.accessToken,
    userId: session.user.id,
    email: session.user.email,
  );
}

Map<String, Object?>? _asMap(Object? data) =>
    data is Map<String, Object?> ? data : null;
