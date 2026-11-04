import 'package:flowpost_desktop/features/accounts/domain/account_groups.dart';
import 'package:flowpost_desktop/features/accounts/domain/connected_account.dart';
import 'package:flutter_test/flutter_test.dart';

/// A row as the server read it: the card follows from the platform name.
ConnectedAccount _row(
  String serverPlatform,
  String accountId, {
  AccountStatus status = AccountStatus.connected,
}) => ConnectedAccount(
  platform: socialPlatformOf(serverPlatform) ?? SocialPlatform.linkedin,
  accountName: accountId,
  status: status,
  accountId: accountId,
  serverPlatform: serverPlatform,
);

void main() {
  test('a network with one account says one account', () {
    final groups = accountGroupsOf([_row('youtube', 'UC-1')]);
    expect(groups, hasLength(1));
    expect(groups.single.label, 'YouTube');
    expect(groups.single.countLine, '1 account');
  });

  test('the categories hold their networks in the connect order', () {
    final groups = accountGroupsOf([
      _row('mega', 'm-1'),
      _row('facebook', 'fb-1'),
      _row('instagram', 'ig-1'),
      _row('google_drive', 'd-1'),
    ]);

    expect(groups.map((group) => group.category).toSet(), {
      AccountCategory.publishing,
      AccountCategory.storage,
    });
    expect(
      groups.map((group) => group.label).join(', '),
      'Instagram, Facebook, Google Drive, MEGA',
    );
  });

  test('two networks of one card split into their own sections', () {
    final groups = accountGroupsOf([
      _row('instagram', 'ig-1'),
      _row('facebook', 'fb-1', status: AccountStatus.expired),
      _row('facebook', 'fb-2'),
    ]);

    final instagram = groups.firstWhere((group) => group.label == 'Instagram');
    expect(instagram.accounts, hasLength(1));
    expect(instagram.countLine, '1 account');

    final facebook = groups.firstWhere((group) => group.label == 'Facebook');
    expect(facebook.accounts, hasLength(2));
    // The count names what cannot publish, so the admin sees the problem
    // without reading every card.
    expect(facebook.needsAttention, 1);
    expect(facebook.countLine, '2 accounts · 1 needs attention');
  });

  test('a storage network asks for no attention', () {
    // A storage row holds the media whatever its status, so it is never the
    // sign-in a publish is waiting on.
    final groups = accountGroupsOf([
      _row('mega', 'm-1', status: AccountStatus.expired),
    ]);
    expect(groups.single.needsAttention, 0);
    expect(groups.single.countLine, '1 account');
  });

  test('a network with no account gets no section', () {
    final groups = accountGroupsOf([_row('linkedin', 'li-1')]);
    expect(groups.map((group) => group.label), ['LinkedIn']);
  });

  test('no account groups into nothing', () {
    expect(accountGroupsOf(const []), isEmpty);
  });

  test('rows of one network keep the order the server gave', () {
    final groups = accountGroupsOf([
      _row('youtube', 'UC-2'),
      _row('youtube', 'UC-1'),
    ]);
    expect(groups.single.accounts.map((account) => account.accountId), [
      'UC-2',
      'UC-1',
    ]);
  });
}
