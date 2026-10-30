import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import 'data/accounts_repository.dart';
import 'domain/connected_account.dart';

final accountsRepositoryProvider = FutureProvider<AccountsRepository>((
  ref,
) async {
  final dir = await getApplicationSupportDirectory();
  return LocalAccountsRepository(
    file: File('${dir.path}${Platform.pathSeparator}accounts.json'),
  );
});

final accountsControllerProvider =
    AsyncNotifierProvider<AccountsController, List<ConnectedAccount>>(
      AccountsController.new,
    );

class AccountsController extends AsyncNotifier<List<ConnectedAccount>> {
  @override
  Future<List<ConnectedAccount>> build() async {
    final repository = await ref.watch(accountsRepositoryProvider.future);
    return repository.load();
  }

  Future<void> setStatus(SocialPlatform platform, AccountStatus status) async {
    final current = state.value;
    if (current == null) return;
    final updated = [
      for (final account in current)
        account.platform == platform
            ? account.copyWith(status: status)
            : account,
    ];
    final repository = await ref.read(accountsRepositoryProvider.future);
    // Persist before showing the new state: a failed write must not leave the
    // card disagreeing with the file.
    await repository.save(updated);
    state = AsyncData(updated);
  }
}
