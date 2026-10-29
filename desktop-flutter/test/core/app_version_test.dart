import 'package:flowpost_desktop/core/update/app_version.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';

PackageInfo info({String version = '1.2.3', String buildNumber = '7'}) {
  return PackageInfo(
    appName: 'FlowPost Studio',
    packageName: 'com.flowpost.flowpost',
    version: version,
    buildNumber: buildNumber,
  );
}

void main() {
  test('the version and the build come from the platform', () async {
    final container = ProviderContainer(
      overrides: [
        packageInfoLoaderProvider.overrideWithValue(() async => info()),
      ],
    );
    addTearDown(container.dispose);

    final version = await container.read(appVersionProvider.future);

    expect(version!.version, '1.2.3');
    expect(version.buildNumber, '7');
  });

  test('a platform that cannot answer leaves the version unknown', () async {
    final container = ProviderContainer(
      overrides: [
        packageInfoLoaderProvider.overrideWithValue(
          () async => throw StateError('no channel'),
        ),
      ],
    );
    addTearDown(container.dispose);

    expect(await container.read(appVersionProvider.future), isNull);
  });
}
