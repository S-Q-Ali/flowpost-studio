import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';

/// Config is provided as an instance by `main.dart` after parsing; the app
/// never reads `String.fromEnvironment` deeper in the tree.
final Provider<AppConfig> appConfigProvider = Provider<AppConfig>(
  (ref) => throw UnimplementedError('appConfigProvider must be overridden'),
);
