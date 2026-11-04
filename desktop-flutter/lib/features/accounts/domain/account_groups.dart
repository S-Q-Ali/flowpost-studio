import 'connect_target.dart';
import 'connected_account.dart';

/// Whether a network publishes there or only holds the media.
///
/// A list that mixes the two reads as noise: the admin is looking for the
/// network a post goes to, and a storage grant is never the reason a publish
/// is stuck.
enum AccountCategory { publishing, storage }

extension AccountCategoryLabel on AccountCategory {
  String get label => switch (this) {
    AccountCategory.publishing => 'Publishing',
    AccountCategory.storage => 'Media storage',
  };
}

/// The platforms that hold media rather than publish it.
const Set<String> storageServerPlatforms = {'google_drive', 'mega'};

/// The wording a group header uses when a row cannot publish. The screen
/// shows it, so the tests read it from here rather than typing it again.
String needsAttentionLine(int count) => switch (count) {
  1 => '1 needs attention',
  _ => '$count need attention',
};

/// The networks a section is built for, in the order the screen lists them.
final List<String> _serverPlatformOrder = [
  for (final target in connectTargets) target.serverPlatform,
  // MEGA signs in inside the browser tab and has no return link, so the
  // screen offers no connect for it; its rows still need a section.
  if (!connectTargets.any((target) => target.serverPlatform == 'mega')) 'mega',
];

AccountCategory accountCategoryOf(String serverPlatform) =>
    storageServerPlatforms.contains(serverPlatform)
    ? AccountCategory.storage
    : AccountCategory.publishing;

/// One network on the accounts screen: the section header the admin reads,
/// and the rows under it.
typedef AccountGroup = ({
  AccountCategory category,
  String serverPlatform,
  String label,
  List<ConnectedAccount> accounts,

  /// Rows a publish cannot use. Always zero for a storage network: it
  /// holds the media whatever its sign-in says.
  int needsAttention,
});

extension AccountGroupCount on AccountGroup {
  /// What the header says beside the network name. Plural because one channel
  /// and two are read differently.
  String get countLine {
    final line = switch (accounts.length) {
      1 => '1 account',
      _ => '${accounts.length} accounts',
    };
    if (needsAttention == 0) return line;
    return '$line · ${needsAttentionLine(needsAttention)}';
  }
}

/// The rows grouped by the network the server named, publish networks first
/// and the storage grants after them, each in the order the connect chips
/// offer them.
///
/// Instagram and Facebook are one card and two networks, so a list ordered by
/// the card reads as a jumble; the server's own name separates them. A network
/// with no row gets no section, and a name the desktop has never seen still
/// gets one rather than dropping off the screen.
List<AccountGroup> accountGroupsOf(List<ConnectedAccount> accounts) {
  final rowsByPlatform = <String, List<ConnectedAccount>>{};
  for (final account in accounts) {
    rowsByPlatform
        .putIfAbsent(account.serverPlatform, () => <ConnectedAccount>[])
        .add(account);
  }

  AccountGroup? groupFor(String serverPlatform) {
    final rows = rowsByPlatform.remove(serverPlatform);
    if (rows == null) return null;
    final isStorage =
        accountCategoryOf(serverPlatform) == AccountCategory.storage;
    return (
      category: isStorage
          ? AccountCategory.storage
          : AccountCategory.publishing,
      serverPlatform: serverPlatform,
      label: connectLabelOf(serverPlatform),
      accounts: rows,
      needsAttention: isStorage
          ? 0
          : rows
                .where((account) => account.status != AccountStatus.connected)
                .length,
    );
  }

  final ordered = <AccountGroup>[];
  for (final serverPlatform in _serverPlatformOrder) {
    final group = groupFor(serverPlatform);
    if (group != null) ordered.add(group);
  }
  // Whatever the loop above never named comes last, in the order the server
  // gave it.
  for (final serverPlatform in rowsByPlatform.keys.toList()) {
    final group = groupFor(serverPlatform);
    if (group != null) ordered.add(group);
  }
  return [
    for (final category in AccountCategory.values)
      ...ordered.where((group) => group.category == category),
  ];
}
