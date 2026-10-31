/// The Supabase Auth session, reduced to what the app uses.
///
/// Refresh tokens stay inside the SDK and the secure store; nothing here is
/// logged.
class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.userId,
    required this.email,
  });

  final String accessToken;
  final String userId;
  final String? email;
}

/// What a `public.users` row says about the signed-in user.
enum AdminLookup { admin, missing, notAdmin }

/// Every user-facing failure the identity module can produce.
enum IdentityError {
  offline("Can't reach FlowPost. Check your connection."),
  invalidCredentials('Email or password is incorrect.'),
  emailNotConfirmed('This account is not confirmed. Contact the admin.'),
  rateLimited('Too many attempts. Try again in a few minutes.'),
  unknownUser('Sign up is closed. Contact the admin.'),
  notAdmin('This desktop build is for the administrator account.'),
  oauthCancelled('Google sign-in was cancelled.'),
  oauthStateInvalid('Sign-in could not be verified. Try again.'),
  oauthExchangeFailed('Google sign-in failed. Try again.'),
  adminTokenExpired(
    'Your admin session expired. Answer your security questions again.',
  ),
  questionsIncorrect('Incorrect answers.'),
  questionsLocked('Too many failed attempts. Try again later.'),
  storageUnavailable(
    "FlowPost can't store your sign-in securely. Restart the app.",
  ),
  unexpected('Something went wrong. Try again.');

  const IdentityError(this.message);

  final String message;
}

/// A failure with a message that can be shown as-is.
///
/// [serverMessage] carries the backend's own text (lockout countdown, wrong
/// answers) so the screen never invents its own wording.
class IdentityException implements Exception {
  const IdentityException(this.error, {this.serverMessage});

  final IdentityError error;
  final String? serverMessage;

  String get message => serverMessage ?? error.message;

  @override
  String toString() => 'IdentityException(${error.name})';
}

/// The one Google sign-in in flight, so a cold-start callback still checks.
class PendingOAuth {
  const PendingOAuth({required this.state, required this.createdAt});

  final String state;
  final DateTime createdAt;
}

/// The screens a signed-in session can be in (SPEC-identity Code Style).
sealed class AuthState {
  const AuthState();
}

final class SignedOut extends AuthState {
  const SignedOut([this.message]);

  final String? message;
}

final class AwaitingQuestions extends AuthState {
  const AwaitingQuestions({required this.questionsConfigured, this.message});

  final bool questionsConfigured;
  final String? message;
}

final class SignedIn extends AuthState {
  const SignedIn({
    required this.userId,
    required this.isAdmin,
    this.offline = false,
  });

  final String userId;
  final bool isAdmin;
  final bool offline;
}

/// The admin session token minted by the security questions.
///
/// The token is a bearer, so it never appears in [toString] (SPEC-identity 2).
class AdminToken {
  const AdminToken({required this.token, required this.issuedAt});

  final String token;
  final DateTime issuedAt;

  @override
  String toString() => 'AdminToken(issuedAt: ${issuedAt.toIso8601String()})';
}

/// The little about the signed-in admin that startup needs offline.
class ProfileCache {
  const ProfileCache({
    required this.userId,
    required this.email,
    required this.isAdmin,
  });

  final String userId;
  final String? email;
  final bool isAdmin;
}
