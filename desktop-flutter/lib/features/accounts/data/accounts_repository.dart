import 'dart:convert';
import 'dart:io';

import '../../publishing/data/posts_repository.dart';
import '../domain/connected_account.dart';

/// One read of the accounts: the rows, and where they came from.
class AccountsRead {
  const AccountsRead({required this.accounts, required this.offline});

  final List<ConnectedAccount> accounts;

  /// True when the server was not reached and the list is the copy this PC
  /// keeps, or nothing at all when there is no copy yet.
  final bool offline;
}

/// Reads the accounts of the current session.
abstract class AccountsRepository {
  Future<AccountsRead> read();
}

/// The copy of the account list this PC keeps for offline use.
abstract class AccountsCache {
  Future<List<ConnectedAccount>> load();
  Future<void> save(List<ConnectedAccount> accounts);
}

/// A JSON file of the accounts the last successful read returned.
///
/// It holds only what the server said, so an account that was disconnected
/// there does not come back as connected here.
class FileAccountsCache implements AccountsCache {
  FileAccountsCache({required this.file});

  final File file;

  @override
  Future<List<ConnectedAccount>> load() async {
    if (!await file.exists()) return const [];
    try {
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is! List) return const [];
      final accounts = <ConnectedAccount>[];
      for (final item in decoded) {
        final account = ConnectedAccount.fromJson(item);
        if (account != null) accounts.add(account);
      }
      return accounts;
    } on FormatException {
      return const [];
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
}

/// The rows the `account-list` action answers with, as accounts.
///
/// A row of a platform the desktop has no card for is skipped rather than
/// shown under the wrong name.
List<ConnectedAccount> accountsFromRows(List<Map<String, Object?>> rows) {
  final accounts = <ConnectedAccount>[];
  for (final row in rows) {
    final serverPlatform = row['platform'];
    if (serverPlatform is! String) continue;
    final platform = socialPlatformOf(serverPlatform);
    if (platform == null) continue;
    final displayName = row['display_name'];
    final accountName = row['account_name'];
    final expiry = DateTime.tryParse(
      row['token_expiry'] is String ? row['token_expiry'] as String : '',
    );
    accounts.add(
      ConnectedAccount(
        platform: platform,
        accountName: displayName is String && displayName.isNotEmpty
            ? displayName
            : accountName is String
            ? accountName
            : '',
        status: row['is_connected'] != true
            ? AccountStatus.disconnected
            : (expiry != null && expiry.isBefore(DateTime.now()))
            ? AccountStatus.expired
            : AccountStatus.connected,
        accountId: row['account_id'] is String
            ? row['account_id'] as String
            : '',
        serverPlatform: serverPlatform,
      ),
    );
  }
  return accounts;
}

/// Asks the `posts-api` function and keeps a copy of what it said.
///
/// A read that cannot reach the server falls back to that copy, so the
/// account list still says something useful on a plane; a session the server
/// refuses is an error instead, because a stale list would let the admin
/// queue a publish that cannot run.
class ServerAccountsRepository implements AccountsRepository {
  ServerAccountsRepository({
    required this.sessionToken,
    required this.transport,
    required this.cache,
  });

  /// The license session. Without it the server has nothing to say.
  final String? sessionToken;

  final PostsTransport transport;
  final AccountsCache cache;

  @override
  Future<AccountsRead> read() async {
    final token = sessionToken;
    if (token == null || token.isEmpty) {
      return AccountsRead(accounts: await cache.load(), offline: true);
    }
    try {
      final rows = await transport.send(
        body: const {'action': 'account-list'},
        token: token,
      );
      final accounts = accountsFromRows(rows);
      await _keep(accounts);
      return AccountsRead(accounts: accounts, offline: false);
    } on PostsException catch (error) {
      if (error.kind != PostsErrorKind.connection &&
          error.kind != PostsErrorKind.timeout) {
        rethrow;
      }
      return AccountsRead(accounts: await cache.load(), offline: true);
    }
  }

  /// A cache that cannot be written — a full disk, a locked file — must not
  /// cost the answer the server just gave.
  Future<void> _keep(List<ConnectedAccount> accounts) async {
    try {
      await cache.save(accounts);
    } on Object {
      return;
    }
  }
}
