import '../../publishing/data/posts_repository.dart';
import '../../publishing/domain/publish_target.dart';

class RecentPostItem {
  const RecentPostItem({
    required this.id,
    required this.platform,
    required this.status,
    this.title,
    this.scheduledAt,
  });

  final String id;
  final PublishPlatform platform;
  final PostStatus status;
  final String? title;
  final DateTime? scheduledAt;

  static RecentPostItem? fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    if (id is! String) return null;
    final platformName = json['platform'];
    final platform = platformName is String
        ? PublishPlatform.values
                  .where((p) => p.name == platformName)
                  .firstOrNull ??
              PublishPlatform.youtube
        : PublishPlatform.youtube;
    final status = PostStatus.fromName(json['status']) ?? PostStatus.scheduled;

    String? title;
    final videos = json['videos'];
    if (videos is Map<String, dynamic>) {
      final t = videos['title'];
      if (t is String && t.isNotEmpty) title = t;
    }

    DateTime? scheduledAt;
    final sched = json['scheduled_at'];
    if (sched is String) {
      scheduledAt = DateTime.tryParse(sched);
    }

    return RecentPostItem(
      id: id,
      platform: platform,
      status: status,
      title: title,
      scheduledAt: scheduledAt,
    );
  }
}

class DashboardData {
  const DashboardData({
    this.videos = 0,
    this.scheduled = 0,
    this.published = 0,
    this.accounts = 0,
    this.recentPosts = const [],
  });

  final int videos;
  final int scheduled;
  final int published;
  final int accounts;
  final List<RecentPostItem> recentPosts;

  static DashboardData fromRow(Map<String, dynamic> row) {
    final videos = (row['videos'] as num?)?.toInt() ?? 0;
    final scheduled = (row['scheduled'] as num?)?.toInt() ?? 0;
    final published = (row['published'] as num?)?.toInt() ?? 0;
    final accounts = (row['accounts'] as num?)?.toInt() ?? 0;

    final recentRaw = row['recent_posts'];
    final recent = <RecentPostItem>[];
    if (recentRaw is List) {
      for (final item in recentRaw) {
        if (item is Map<String, dynamic>) {
          final post = RecentPostItem.fromJson(item);
          if (post != null) recent.add(post);
        }
      }
    }

    return DashboardData(
      videos: videos,
      scheduled: scheduled,
      published: published,
      accounts: accounts,
      recentPosts: recent,
    );
  }
}
