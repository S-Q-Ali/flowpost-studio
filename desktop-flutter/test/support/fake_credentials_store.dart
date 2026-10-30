import 'dart:io';

import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/config/credentials_store.dart';

/// The saved values, held in memory: a widget test never touches the disk.
class FakeCredentialsStore extends CredentialsStore {
  FakeCredentialsStore() : super(folder: () async => Directory.systemTemp);

  AppConfig? written;
  bool failWrites = false;
  bool failClears = false;
  CredentialsRead stored = const CredentialsAbsent();

  @override
  Future<CredentialsRead> read() async => stored;

  @override
  Future<bool> write(AppConfig config) async {
    if (failWrites) return false;
    written = config;
    stored = CredentialsFound(config);
    return true;
  }

  @override
  Future<bool> clear() async {
    if (failClears) return false;
    stored = const CredentialsAbsent();
    return true;
  }
}
