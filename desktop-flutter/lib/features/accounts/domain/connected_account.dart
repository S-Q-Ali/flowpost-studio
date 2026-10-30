/// Platforms the native MVP can publish to.
enum SocialPlatform { youtube, meta, tiktok, linkedin, googleDrive, mega }

extension SocialPlatformLabel on SocialPlatform {
  String get label => switch (this) {
    SocialPlatform.youtube => 'YouTube',
    SocialPlatform.meta => 'Instagram & Facebook',
    SocialPlatform.tiktok => 'TikTok',
    SocialPlatform.linkedin => 'LinkedIn',
    SocialPlatform.googleDrive => 'Google Drive',
    SocialPlatform.mega => 'MEGA',
  };
}

enum AccountStatus { disconnected, connected, expired }

class ConnectedAccount {
  const ConnectedAccount({
    required this.platform,
    required this.accountName,
    required this.status,
  });

  final SocialPlatform platform;
  final String accountName;
  final AccountStatus status;

  ConnectedAccount copyWith({AccountStatus? status}) => ConnectedAccount(
    platform: platform,
    accountName: accountName,
    status: status ?? this.status,
  );

  Map<String, Object> toJson() => {
    'platform': platform.name,
    'accountName': accountName,
    'status': status.name,
  };

  /// Returns null for an unknown platform/status or a missing name so a stale
  /// file cannot crash the accounts screen.
  static ConnectedAccount? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final platformName = raw['platform'];
    final statusName = raw['status'];
    final name = raw['accountName'];
    if (platformName is! String ||
        statusName is! String ||
        name is! String ||
        name.isEmpty) {
      return null;
    }
    final platform = SocialPlatform.values.asNameMap()[platformName];
    final status = AccountStatus.values.asNameMap()[statusName];
    if (platform == null || status == null) return null;
    return ConnectedAccount(
      platform: platform,
      accountName: name,
      status: status,
    );
  }
}

/// Local placeholder until the real platform connections are wired with auth.
const List<ConnectedAccount> seedAccounts = [
  ConnectedAccount(
    platform: SocialPlatform.youtube,
    accountName: 'FlowPost Studio',
    status: AccountStatus.disconnected,
  ),
  ConnectedAccount(
    platform: SocialPlatform.meta,
    accountName: 'FlowPost Studio',
    status: AccountStatus.disconnected,
  ),
  ConnectedAccount(
    platform: SocialPlatform.tiktok,
    accountName: 'FlowPost Studio',
    status: AccountStatus.disconnected,
  ),
  ConnectedAccount(
    platform: SocialPlatform.linkedin,
    accountName: 'FlowPost Studio',
    status: AccountStatus.disconnected,
  ),
  ConnectedAccount(
    platform: SocialPlatform.googleDrive,
    accountName: 'FlowPost Studio',
    status: AccountStatus.disconnected,
  ),
  ConnectedAccount(
    platform: SocialPlatform.mega,
    accountName: 'FlowPost Studio',
    status: AccountStatus.disconnected,
  ),
];
