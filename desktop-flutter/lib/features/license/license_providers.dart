import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/app_providers.dart';
import 'data/license_client.dart';
import 'data/license_service.dart';
import 'data/license_store.dart';

/// The activation client, built from the running backend values.
final licenseApiProvider = Provider<LicenseApi>((ref) {
  final config = ref.watch(appConfigProvider);
  return LicenseClient(
    supabaseUrl: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
  );
});

/// The vault the license records live in; tests override it.
final licenseStoreProvider = Provider<LicenseStore>(
  (ref) => SecureLicenseStore(),
);

final licenseServiceProvider = Provider<LicenseService>(
  (ref) => LicenseService(
    api: ref.watch(licenseApiProvider),
    store: ref.watch(licenseStoreProvider),
  ),
);
