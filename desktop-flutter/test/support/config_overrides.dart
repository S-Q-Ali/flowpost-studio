import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/config/config_controller.dart';

/// Seeds the config the way main does, for harnesses that boot the router.
///
/// The app reads `appConfigProvider` through the controller, so a test that
/// only overrode the provider would be sent to the setup screen.
Override seededConfig(
  AppConfig config, {
  ConfigSource source = ConfigSource.compiled,
}) => configControllerProvider.overrideWith(
  () => ConfigController(
    initial: ConfigState(config: config, source: source),
  ),
);
