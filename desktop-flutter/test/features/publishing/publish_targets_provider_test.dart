import 'package:flowpost_desktop/features/accounts/accounts_providers.dart';
import 'package:flowpost_desktop/features/accounts/domain/connected_account.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/publishing/publishing_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_accounts.dart';

const _youtube = ConnectedAccount(
  platform: SocialPlatform.youtube,
  accountName: 'FlowPost Channel',
  status: AccountStatus.connected,
  accountId: 'UC-1',
  serverPlatform: 'youtube',
);

const _instagram = ConnectedAccount(
  platform: SocialPlatform.meta,
  accountName: 'flowpost.studio',
  status: AccountStatus.connected,
  accountId: 'ig-1',
  serverPlatform: 'instagram',
);

const _drive = ConnectedAccount(
  platform: SocialPlatform.googleDrive,
  accountName: 'FlowPost Drive',
  status: AccountStatus.connected,
  accountId: 'drive-1',
  serverPlatform: 'google_drive',
);

ProviderContainer _containerOf(FakeAccountsRepository repository) {
  final container = ProviderContainer(
    overrides: [accountsRepositoryProvider.overrideWith((ref) => repository)],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  test('the targets are the connected accounts the server named', () async {
    final container = _containerOf(
      FakeAccountsRepository([_youtube, _instagram, _drive]),
    );

    expect(await container.read(publishTargetsProvider.future), [
      const PublishTarget(
        platform: PublishPlatform.youtube,
        accountId: 'UC-1',
        accountName: 'FlowPost Channel',
      ),
      const PublishTarget(
        platform: PublishPlatform.instagram,
        accountId: 'ig-1',
        accountName: 'flowpost.studio',
      ),
      const PublishTarget(
        platform: PublishPlatform.instagram,
        accountId: 'ig-1',
        accountName: 'flowpost.studio',
        postType: PostType.story,
      ),
    ]);
  });

  test('an account that is no longer connected drops out', () async {
    final repository = FakeAccountsRepository([_youtube]);
    final container = _containerOf(repository);

    expect(await container.read(publishTargetsProvider.future), hasLength(1));

    repository.accounts = [
      _youtube.copyWith(status: AccountStatus.disconnected),
    ];
    container.invalidate(accountsControllerProvider);

    expect(await container.read(publishTargetsProvider.future), isEmpty);
  });

  test('a server with no accounts gives nothing to pick', () async {
    final container = _containerOf(FakeAccountsRepository(const []));

    expect(await container.read(publishTargetsProvider.future), isEmpty);
  });

  test('an offline read still names the accounts this PC kept', () async {
    final repository = FakeAccountsRepository([_instagram])..offline = true;
    final container = _containerOf(repository);

    expect(await container.read(publishTargetsProvider.future), hasLength(2));
  });
}
