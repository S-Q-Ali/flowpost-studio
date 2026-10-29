import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';

/// Config is provided as an instance by `main.dart` after parsing; the app
/// never reads `String.fromEnvironment` deeper in the tree.
final Provider<AppConfig> appConfigProvider = Provider<AppConfig>(
  (ref) => throw UnimplementedError('appConfigProvider must be overridden'),
);

/// The session token the backend calls are made with.
///
/// Null until the identity module exists, so the actions that need one stay
/// disabled with the sign-in hint.
final Provider<String?> sessionTokenProvider = Provider<String?>((ref) => null);
