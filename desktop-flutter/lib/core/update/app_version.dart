import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// The version and build the running app was made from.
class AppVersionInfo {
  const AppVersionInfo({required this.version, required this.buildNumber});

  final String version;
  final String buildNumber;
}

/// How the platform's package information is read.
///
/// A seam, so the version can be pinned in tests and the Settings screen and
/// the Home screen read the same answer.
final packageInfoLoaderProvider = Provider<Future<PackageInfo> Function()>(
  (ref) => PackageInfo.fromPlatform,
);

/// Null when the platform channel cannot answer, so the screen says the
/// version is unknown instead of showing one it made up.
final appVersionProvider = FutureProvider<AppVersionInfo?>((ref) async {
  try {
    final info = await ref.watch(packageInfoLoaderProvider)();
    return AppVersionInfo(version: info.version, buildNumber: info.buildNumber);
  } on Object {
    return null;
  }
});
