import 'package:flowpost_desktop/features/license/data/license_client.dart';
import 'package:flowpost_desktop/features/license/data/license_models.dart';
import 'package:flowpost_desktop/features/license/data/license_service.dart';
import 'package:flowpost_desktop/features/license/data/license_store.dart';

/// A vault the tests can seed and read back.
class MemoryLicenseStore implements LicenseStore {
  MemoryLicenseStore([this.record]);

  LicenseRecord? record;

  /// Makes [clear] fail the way a locked credential store does.
  bool failClear = false;

  @override
  Future<LicenseRecord?> read() async => record;

  @override
  Future<void> write(LicenseRecord record) async => this.record = record;

  @override
  Future<void> clear() async {
    if (failClear) {
      throw const LicenseException(LicenseError.storageUnavailable);
    }
    record = null;
  }
}

/// An API that refuses every key, for tests that only restore a grant.
class RefusingLicenseApi implements LicenseApi {
  @override
  Future<LicenseGrant> activate(String key) async =>
      throw const LicenseException(LicenseError.invalidKey);
}

LicenseService licenseServiceOver(MemoryLicenseStore store) =>
    LicenseService(api: RefusingLicenseApi(), store: store);
