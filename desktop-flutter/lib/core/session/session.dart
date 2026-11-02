import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The token the backend calls are made with.
class Session {
  const Session({required this.sessionToken, this.offline = false});

  /// The bearer the backend functions take. `posts-api` reads the owner from
  /// it, so the app never needs a Supabase Auth token.
  final String sessionToken;

  /// True when the token was restored without reaching the backend.
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
