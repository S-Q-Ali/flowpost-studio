import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/providers/app_providers.dart';
import '../offline/offline_providers.dart';
import 'data/accounts_repository.dart';

/// The account list this PC keeps, so the screen says something when the
/// server cannot be reached.
final accountsCacheProvider = FutureProvider<AccountsCache>((ref) async {
  final dir = await getApplicationSupportDirectory();
  return FileAccountsCache(
    file: File('${dir.path}${Platform.pathSeparator}accounts.json'),
  );
});

final accountsRepositoryProvider = FutureProvider<AccountsRepository>((
  ref,
) async {
  return ServerAccountsRepository(
    sessionToken: ref.watch(sessionTokenProvider),
    transport: ref.watch(postsTransportProvider),
    cache: await ref.watch(accountsCacheProvider.future),
  );
});

final accountsControllerProvider =
    AsyncNotifierProvider<AccountsController, AccountsRead>(
      AccountsController.new,
    );

class AccountsController extends AsyncNotifier<AccountsRead> {
  @override
  Future<AccountsRead> build() async {
    final repository = await ref.watch(accountsRepositoryProvider.future);
    return repository.read();
  }
}
