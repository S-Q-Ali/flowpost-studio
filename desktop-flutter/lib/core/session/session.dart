import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The tokens a signed-in admin's calls are made with.
///
/// Both are null-shaped until the identity module exists; the type is here so
/// the sign-out path and the screens that show the account state can be built
/// and tested now.
class Session {
  const Session({
    required this.sessionToken,
    required this.accessToken,
    this.offline = false,
  });

  /// The bearer the backend functions take.
  final String sessionToken;

  /// The Supabase Auth token the table reads and writes take.
  final String accessToken;

  /// True when the admin token was restored without reaching the backend.
  final bool offline;
}

final sessionProvider = NotifierProvider<SessionController, Session?>(
  SessionController.new,
);

class SessionController extends Notifier<Session?> {
  @override
  Session? build() => null;

  void signIn(Session session) => state = session;

  /// Leaves no token anywhere: every call that reads one sees null at once.
  void clear() => state = null;
}
