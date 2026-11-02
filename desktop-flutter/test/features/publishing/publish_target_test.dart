import 'package:flowpost_desktop/features/accounts/domain/connected_account.dart';
import 'package:flowpost_desktop/features/media/captions/domain/caption_prompt.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flutter_test/flutter_test.dart';

/// An account as the server names it, on the card its platform belongs to.
ConnectedAccount _account(
  String serverPlatform, {
  String accountId = 'acc-1',
  AccountStatus status = AccountStatus.connected,
  String accountName = 'FlowPost',
}) => ConnectedAccount(
  platform: socialPlatformOf(serverPlatform)!,
  accountName: accountName,
  status: status,
  accountId: accountId,
  serverPlatform: serverPlatform,
);

void main() {
  test('the caption key of a platform is one the captions module produces', () {
    for (final platform in PublishPlatform.values) {
      expect(
        platformAllowedCaptionKeys[platform.name],
        contains(captionKeyFor(platform)),
        reason: platform.name,
      );
    }
  });

  test('the YouTube title key is one the captions module produces', () {
    expect(
      platformAllowedCaptionKeys[PublishPlatform.youtube.name],
      contains(youtubeTitleCaptionKey),
    );
  });

  test('a connected account becomes the target its platform publishes to', () {
    expect(publishTargetsFor(_account('youtube')), [
      const PublishTarget(
        platform: PublishPlatform.youtube,
        accountId: 'acc-1',
        accountName: 'FlowPost',
      ),
    ]);
    expect(publishTargetsFor(_account('facebook')), [
      const PublishTarget(
        platform: PublishPlatform.facebook,
        accountId: 'acc-1',
        accountName: 'FlowPost',
      ),
    ]);
    expect(publishTargetsFor(_account('tiktok')), [
      const PublishTarget(
        platform: PublishPlatform.tiktok,
        accountId: 'acc-1',
        accountName: 'FlowPost',
      ),
    ]);
    expect(publishTargetsFor(_account('linkedin')), [
      const PublishTarget(
        platform: PublishPlatform.linkedin,
        accountId: 'acc-1',
        accountName: 'FlowPost',
      ),
    ]);
  });

  test('Instagram offers the feed post and the story as two targets', () {
    expect(publishTargetsFor(_account('instagram', accountId: 'ig-1')), [
      const PublishTarget(
        platform: PublishPlatform.instagram,
        accountId: 'ig-1',
        accountName: 'FlowPost',
      ),
      const PublishTarget(
        platform: PublishPlatform.instagram,
        accountId: 'ig-1',
        accountName: 'FlowPost',
        postType: PostType.story,
      ),
    ]);
  });

  test('an account that is not connected offers nothing', () {
    for (final status in [AccountStatus.disconnected, AccountStatus.expired]) {
      expect(
        publishTargetsFor(_account('youtube', status: status)),
        isEmpty,
        reason: status.name,
      );
    }
  });

  test('a drive account stores media, it does not publish', () {
    expect(publishTargetsFor(_account('google_drive')), isEmpty);
    expect(publishTargetsFor(_account('mega')), isEmpty);
  });

  test('a row without the platform account id offers nothing', () {
    expect(
      publishTargetsFor(_account('youtube', accountId: '')),
      isEmpty,
      reason: 'the post needs the id the platform knows the account by',
    );
  });

  test('the card says what publishing takes from a connected account', () {
    expect(publishUseLineOf(_account('youtube')), 'Publishes: YouTube.');
    expect(
      publishUseLineOf(_account('instagram')),
      'Publishes: Instagram and Instagram story.',
    );
  });

  test('a sign-in that is not live blocks publishing until it is back', () {
    for (final status in [AccountStatus.disconnected, AccountStatus.expired]) {
      expect(
        publishUseLineOf(_account('tiktok', status: status)),
        'Nothing publishes until it is connected again.',
        reason: status.name,
      );
    }
  });

  test('a drive account is never called a publish target', () {
    // The line holds whatever the status is: this row never publishes, so it
    // must not be read as a sign-in that only needs reconnecting.
    for (final serverPlatform in ['google_drive', 'mega']) {
      expect(
        publishUseLineOf(
          _account(serverPlatform, status: AccountStatus.expired),
        ),
        'It holds the media; nothing publishes from it.',
        reason: serverPlatform,
      );
    }
  });

  test('a connected row the server never named publishes nothing yet', () {
    expect(
      publishUseLineOf(_account('youtube', accountId: '')),
      'Nothing publishes from it yet.',
    );
  });
}
