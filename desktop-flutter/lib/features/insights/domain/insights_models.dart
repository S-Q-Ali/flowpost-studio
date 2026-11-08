class InsightsMetricPoint {
  const InsightsMetricPoint({required this.date, required this.value});

  final String date;
  final int value;

  static InsightsMetricPoint? fromJson(Map<String, dynamic> json) {
    final d = json['date'] as String?;
    final v = (json['value'] as num?)?.toInt() ?? 0;
    if (d == null) return null;
    return InsightsMetricPoint(date: d, value: v);
  }
}

class InsightsData {
  const InsightsData({
    required this.platform,
    this.followersCount = 0,
    this.totalPosts = 0,
    this.growth30d = 0,
    this.totalPublished = 0,
    this.thisMonth = 0,
    this.thisWeek = 0,
    this.successRate = 100,
    this.timeline = const [],
  });

  final String platform;
  final int followersCount;
  final int totalPosts;
  final int growth30d;
  final int totalPublished;
  final int thisMonth;
  final int thisWeek;
  final int successRate;
  final List<InsightsMetricPoint> timeline;

  static InsightsData fromJson(String platform, Map<String, dynamic> json) {
    final account = json['account'] as Map<String, dynamic>? ?? {};
    final followers =
        (account['followers_count'] as num?)?.toInt() ??
        (account['fan_count'] as num?)?.toInt() ??
        0;
    final posts = (account['media_count'] as num?)?.toInt() ?? 0;
    final growth = (account['follower_net_growth_30d'] as num?)?.toInt() ?? 0;

    final flowpost = json['flowpost_stats'] as Map<String, dynamic>? ?? {};
    final totalPub = (flowpost['total_published'] as num?)?.toInt() ?? 0;
    final thisM = (flowpost['this_month'] as num?)?.toInt() ?? 0;
    final thisW = (flowpost['this_week'] as num?)?.toInt() ?? 0;
    final rate = (flowpost['success_rate'] as num?)?.toInt() ?? 100;

    final timeline = <InsightsMetricPoint>[];
    final postsByDay = flowpost['posts_by_day'];
    if (postsByDay is List) {
      for (final p in postsByDay) {
        if (p is Map<String, dynamic>) {
          final date = p['date'] as String? ?? '';
          final count = (p['published'] as num?)?.toInt() ?? 0;
          if (date.isNotEmpty) {
            timeline.add(InsightsMetricPoint(date: date, value: count));
          }
        }
      }
    }

    return InsightsData(
      platform: platform,
      followersCount: followers,
      totalPosts: posts,
      growth30d: growth,
      totalPublished: totalPub,
      thisMonth: thisM,
      thisWeek: thisW,
      successRate: rate,
      timeline: timeline,
    );
  }
}
