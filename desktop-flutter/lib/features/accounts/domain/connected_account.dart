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

/// The card the platform belongs to.
///
/// Instagram and Facebook share one card, and the server names each of them
/// on its own, so the value it uses has to be kept for publishing.
SocialPlatform? socialPlatformOf(String serverPlatform) =>
    switch (serverPlatform) {
      'youtube' => SocialPlatform.youtube,
      'instagram' || 'facebook' => SocialPlatform.meta,
      'tiktok' => SocialPlatform.tiktok,
      'linkedin' => SocialPlatform.linkedin,
      'google_drive' => SocialPlatform.googleDrive,
      'mega' => SocialPlatform.mega,
      _ => null,
    };

class ConnectedAccount {
  const ConnectedAccount({
    required this.platform,
    required this.accountName,
    required this.status,
    this.accountId = '',
    this.serverPlatform = '',
  });

  final SocialPlatform platform;
  final String accountName;
  final AccountStatus status;

  /// The `account_id` the server holds: the channel or page this row is.
  final String accountId;

  /// The value the server's `platform` column holds, e.g. `instagram`.
  final String serverPlatform;

  ConnectedAccount copyWith({AccountStatus? status}) => ConnectedAccount(
    platform: platform,
    accountName: accountName,
    status: status ?? this.status,
    accountId: accountId,
    serverPlatform: serverPlatform,
  );

  Map<String, Object> toJson() => {
    'platform': platform.name,
    'accountName': accountName,
    'status': status.name,
    'accountId': accountId,
    'serverPlatform': serverPlatform,
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
    // A file from an older build names neither id, so both default to empty.
    final accountId = raw['accountId'];
    final serverPlatform = raw['serverPlatform'];
    return ConnectedAccount(
      platform: platform,
      accountName: name,
      status: status,
      accountId: accountId is String ? accountId : '',
      serverPlatform: serverPlatform is String ? serverPlatform : '',
    );
  }
}
