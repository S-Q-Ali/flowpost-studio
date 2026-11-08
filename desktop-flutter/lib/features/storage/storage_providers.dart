import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/app_providers.dart';
import '../accounts/accounts_providers.dart';
import '../accounts/domain/connected_account.dart';
import 'data/storage_client.dart';

final storageClientProvider = Provider<StorageClient>((ref) {
  final config = ref.watch(appConfigProvider);
  return HttpStorageClient(
    supabaseUrl: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    sessionToken: ref.watch(sessionTokenProvider),
  );
});

final driveAccountsProvider = Provider<List<ConnectedAccount>>((ref) {
  final accounts = ref.watch(accountsControllerProvider).value?.accounts ?? [];
  return accounts
      .where(
        (a) =>
            a.serverPlatform == 'google_drive' ||
            a.platform == SocialPlatform.googleDrive,
      )
      .toList();
});

final megaAccountsProvider = Provider<List<ConnectedAccount>>((ref) {
  final accounts = ref.watch(accountsControllerProvider).value?.accounts ?? [];
  return accounts
      .where(
        (a) => a.serverPlatform == 'mega' || a.platform == SocialPlatform.mega,
      )
      .toList();
});
