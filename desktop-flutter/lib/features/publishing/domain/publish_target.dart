import '../../accounts/domain/connected_account.dart';

/// The platforms the client can publish to (SPEC-publishing "Platform
/// contract").
enum PublishPlatform { youtube, facebook, instagram, tiktok, linkedin }

extension PublishPlatformLabel on PublishPlatform {
  String get label => switch (this) {
    PublishPlatform.youtube => 'YouTube',
    PublishPlatform.facebook => 'Facebook',
    PublishPlatform.instagram => 'Instagram',
    PublishPlatform.tiktok => 'TikTok',
    PublishPlatform.linkedin => 'LinkedIn',
  };

  /// How many characters the platform keeps. Null when it does not cut the
  /// caption — Facebook and LinkedIn pass it on whole.
  int? get captionLimit => switch (this) {
    PublishPlatform.youtube => 5000,
    PublishPlatform.instagram => 2200,
    PublishPlatform.tiktok => 2200,
    PublishPlatform.facebook => null,
    PublishPlatform.linkedin => null,
  };
}

/// What kind of post the target takes.
enum PostType { feed, story }

/// How many characters a YouTube title may have.
///
/// YouTube's own limit is 100. The function does not cut the title, so a
/// longer one is refused by the platform with an opaque error.
const int youtubeTitleLimit = 100;

/// One account the admin can publish to, on one platform.
class PublishTarget {
  const PublishTarget({
    required this.platform,
    required this.accountId,
    required this.accountName,
    this.postType = PostType.feed,
  });

  final PublishPlatform platform;

  /// The platform's own account id. This is what goes into
  /// `posts.account_id`, not the id of the connected-account row.
  final String accountId;

  final String accountName;

  final PostType postType;

  /// The id the selection and the captions are keyed by.
  String get id => '${platform.name}:$accountId:${postType.name}';

  /// A story carries no text.
  bool get takesCaption => postType == PostType.feed;

  /// The name the screen shows: a story is its own option next to the feed
  /// post of the same platform.
  String get label =>
      postType == PostType.story ? '${platform.label} story' : platform.label;

  /// How many characters the caption may have. Null means no limit.
  int? get captionLimit => takesCaption ? platform.captionLimit : null;

  /// YouTube and TikTok take video only; a Facebook story takes video only
  /// as well.
  bool get acceptsImage => switch (postType) {
    PostType.feed => switch (platform) {
      PublishPlatform.youtube => false,
      PublishPlatform.tiktok => false,
      _ => true,
    },
    PostType.story => platform == PublishPlatform.instagram,
  };

  /// The function that publishes this target.
  String get edgeFunction => switch (platform) {
    PublishPlatform.youtube => 'youtube-upload',
    PublishPlatform.facebook =>
      postType == PostType.story ? 'post-story' : 'facebook-upload',
    PublishPlatform.instagram =>
      postType == PostType.story ? 'post-story' : 'instagram-upload',
    PublishPlatform.tiktok => 'tiktok-upload',
    PublishPlatform.linkedin => 'linkedin-upload',
  };

  /// The name of the media the platform refuses.
  String get refusedMediaMessage => switch (platform) {
    PublishPlatform.youtube => 'YouTube does not support image posts.',
    PublishPlatform.tiktok => 'TikTok does not support image uploads.',
    _ => 'This platform does not support image posts.',
  };

  @override
  bool operator ==(Object other) =>
      other is PublishTarget &&
      other.platform == platform &&
      other.accountId == accountId &&
      other.postType == postType;

  @override
  int get hashCode => Object.hash(platform, accountId, postType);

  @override
  String toString() => 'PublishTarget($id)';
}

/// The targets one connected account offers the compose screen.
///
/// Only a connected account can take a post, and a row without the platform's
/// own id cannot: that id is what the publish function reads. The drive
/// accounts store the media, they are not published to, so they name nothing
/// here.
List<PublishTarget> publishTargetsFor(ConnectedAccount account) {
  if (account.status != AccountStatus.connected) return const [];
  final platform = switch (account.serverPlatform) {
    'youtube' => PublishPlatform.youtube,
    'facebook' => PublishPlatform.facebook,
    'instagram' => PublishPlatform.instagram,
    'tiktok' => PublishPlatform.tiktok,
    'linkedin' => PublishPlatform.linkedin,
    _ => null,
  };
  if (platform == null || account.accountId.isEmpty) return const [];
  return [
    PublishTarget(
      platform: platform,
      accountId: account.accountId,
      accountName: account.accountName,
    ),
    // The feed post and the story of one Instagram are two different
    // functions on the server, so they are two picks here.
    if (platform == PublishPlatform.instagram)
      PublishTarget(
        platform: platform,
        accountId: account.accountId,
        accountName: account.accountName,
        postType: PostType.story,
      ),
  ];
}

/// What the compose screen would take from this account, in the words the
/// picks use, so the card says what publishing actually does with it.
String publishUseLineOf(ConnectedAccount account) {
  // A drive row never publishes, whatever its status says: naming it as a
  // sign-in to reconnect would send the admin to the wrong button.
  if (account.platform == SocialPlatform.googleDrive ||
      account.platform == SocialPlatform.mega) {
    return 'It holds the media; nothing publishes from it.';
  }
  if (account.status != AccountStatus.connected) {
    return 'Nothing publishes until it is connected again.';
  }
  final targets = publishTargetsFor(account);
  if (targets.isEmpty) return 'Nothing publishes from it yet.';
  return 'Publishes: ${targets.map((target) => target.label).join(' and ')}.';
}

/// The caption key the AI wrote for this platform.
///
/// The key must be one the captions module produces for the platform, which
/// a test pins.
String captionKeyFor(PublishPlatform platform) => switch (platform) {
  PublishPlatform.youtube => 'yt_video_description',
  PublishPlatform.facebook => 'fb_ig_caption',
  PublishPlatform.instagram => 'fb_ig_caption',
  PublishPlatform.tiktok => 'tiktok_caption',
  PublishPlatform.linkedin => 'linkedin_caption',
};

/// The caption key that holds the YouTube title.
const String youtubeTitleCaptionKey = 'yt_video_title';
