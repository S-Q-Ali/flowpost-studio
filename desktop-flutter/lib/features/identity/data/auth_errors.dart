import 'dart:async';
import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

import 'identity_models.dart';

/// Turns anything a gateway throws into the one failure type the screens know.
IdentityException mapGatewayFailure(Object error) {
  if (error is IdentityException) return error;
  if (error is AuthException) return mapAuthFailure(error);
  if (error is FunctionException) return mapFunctionFailure(error);
  if (error is PostgrestException) return mapPostgrestFailure(error);
  if (_isTransport(error)) return const IdentityException(IdentityError.offline);
  return const IdentityException(IdentityError.unexpected);
}

IdentityException mapAuthFailure(AuthException error) {
  switch (error.code) {
    case 'invalid_credentials':
      return const IdentityException(IdentityError.invalidCredentials);
    case 'email_not_confirmed':
      return const IdentityException(IdentityError.emailNotConfirmed);
    case 'user_not_found':
      return const IdentityException(IdentityError.unknownUser);
    case 'over_request_rate_limit':
      return const IdentityException(IdentityError.rateLimited);
    case 'session_not_found':
    case 'refresh_token_not_found':
    case 'session_expired':
      return const IdentityException(IdentityError.adminTokenExpired);
  }
  if (error.statusCode == '429') {
    return const IdentityException(IdentityError.rateLimited);
  }
  if (error.statusCode == null) {
    return const IdentityException(IdentityError.offline);
  }
  return const IdentityException(IdentityError.unexpected);
}

IdentityException mapFunctionFailure(FunctionException error) {
  if (error.status == 0) {
    return const IdentityException(IdentityError.offline);
  }
  final serverMessage = _serverMessage(error.details);
  switch (error.status) {
    case 401:
      return IdentityException(
        IdentityError.questionsIncorrect,
        serverMessage: serverMessage,
      );
    case 429:
      return IdentityException(
        IdentityError.questionsLocked,
        serverMessage: serverMessage,
      );
    case 400:
      return IdentityException(
        IdentityError.unexpected,
        serverMessage: serverMessage,
      );
    default:
      return const IdentityException(IdentityError.unexpected);
  }
}

IdentityException mapPostgrestFailure(PostgrestException error) {
  if (error.code == 'PGRST301' ||
      error.code == 'PGRST302' ||
      error.code == '401') {
    return const IdentityException(IdentityError.adminTokenExpired);
  }
  return const IdentityException(IdentityError.unexpected);
}

String? _serverMessage(Object? details) {
  if (details is Map) {
    final value = details['error'] ?? details['message'];
    if (value is String && value.isNotEmpty) return value;
  }
  return null;
}

bool _isTransport(Object error) =>
    error is SocketException ||
    error is TimeoutException ||
    error is HttpException ||
    error is TlsException;
