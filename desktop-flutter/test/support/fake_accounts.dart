import 'package:flowpost_desktop/features/accounts/data/accounts_repository.dart';
import 'package:flowpost_desktop/features/accounts/domain/connected_account.dart';

/// Answers what the test names, so each state of the list has its own.
class FakeAccountsRepository implements AccountsRepository {
  FakeAccountsRepository([List<ConnectedAccount>? accounts])
    : accounts = accounts ?? const [];

  List<ConnectedAccount> accounts;

  /// Whether the answer came from this PC rather than the server.
  bool offline = false;

  /// What the read throws instead of answering.
  Object? error;

  int reads = 0;

  @override
  Future<AccountsRead> read() async {
    reads++;
    final error = this.error;
    if (error != null) throw error;
    return AccountsRead(accounts: accounts, offline: offline);
  }
}
