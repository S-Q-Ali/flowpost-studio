import 'dart:convert';
import 'dart:io';

import '../domain/connected_account.dart';

abstract class AccountsRepository {
  Future<List<ConnectedAccount>> load();
  Future<void> save(List<ConnectedAccount> accounts);
}

/// JSON file behind the `AccountsRepository` interface. The Supabase
/// implementation swaps in later without touching the UI.
class LocalAccountsRepository implements AccountsRepository {
  LocalAccountsRepository({required this.file});

  final File file;

  @override
  Future<List<ConnectedAccount>> load() async {
    if (!await file.exists()) return _reseed();
    try {
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is! List) return await _reseed();
      final stored = <SocialPlatform, ConnectedAccount>{};
      for (final item in decoded) {
        final account = ConnectedAccount.fromJson(item);
        if (account != null) stored[account.platform] = account;
      }
      if (stored.isEmpty) return await _reseed();
      // Always return six cards in seed order, even if the file is partial.
      return [for (final seed in seedAccounts) stored[seed.platform] ?? seed];
    } on FormatException {
      return await _reseed();
    }
  }

  @override
  Future<void> save(List<ConnectedAccount> accounts) async {
    await file.parent.create(recursive: true);
    final temp = File('${file.path}.tmp');
    await temp.writeAsString(
      jsonEncode([for (final account in accounts) account.toJson()]),
    );
    await temp.rename(file.path);
  }

  Future<List<ConnectedAccount>> _reseed() async {
    await save(seedAccounts);
    return seedAccounts;
  }
}
