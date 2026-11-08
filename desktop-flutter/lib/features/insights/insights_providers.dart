import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/app_providers.dart';
import '../accounts/accounts_providers.dart';
import '../accounts/domain/connected_account.dart';
import 'data/insights_client.dart';

final insightsClientProvider = Provider<InsightsClient>((ref) {
  final config = ref.watch(appConfigProvider);
  return HttpInsightsClient(
    supabaseUrl: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    sessionToken: ref.watch(sessionTokenProvider),
  );
});

final instagramAccountsProvider = Provider<List<ConnectedAccount>>((ref) {
  final accounts = ref.watch(accountsControllerProvider).value?.accounts ?? [];
  return accounts.where((a) => a.serverPlatform == 'instagram').toList();
});

final facebookAccountsProvider = Provider<List<ConnectedAccount>>((ref) {
  final accounts = ref.watch(accountsControllerProvider).value?.accounts ?? [];
  return accounts.where((a) => a.serverPlatform == 'facebook').toList();
});
