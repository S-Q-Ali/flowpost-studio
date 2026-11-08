import '../../publishing/domain/publish_target.dart';

class WorkflowItem {
  const WorkflowItem({
    required this.id,
    required this.name,
    required this.isActive,
    this.sheetUrl,
    this.sheetId,
    this.driveFolderId,
    this.platforms = const [],
    this.mediaType = 'video',
    this.runIntervalHours = 1,
    this.videosPerRun = 1,
    this.lastTriggeredAt,
    this.lastManualTriggeredAt,
    this.totalPosted = 0,
    this.latestRunStatus,
    this.latestRunFinishedAt,
  });

  final String id;
  final String name;
  final bool isActive;
  final String? sheetUrl;
  final String? sheetId;
  final String? driveFolderId;
  final List<PublishPlatform> platforms;
  final String mediaType;
  final int runIntervalHours;
  final int videosPerRun;
  final DateTime? lastTriggeredAt;
  final DateTime? lastManualTriggeredAt;
  final int totalPosted;
  final String? latestRunStatus;
  final DateTime? latestRunFinishedAt;

  static WorkflowItem? fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    if (id is! String) return null;
    final name = json['name'] as String? ?? 'Untitled Workflow';
    final isActive = json['is_active'] as bool? ?? true;

    final platformList = <PublishPlatform>[];
    final rawPlatforms = json['platforms'];
    if (rawPlatforms is List) {
      for (final p in rawPlatforms) {
        if (p is String) {
          final platform = PublishPlatform.values
              .where((item) => item.name == p.toLowerCase())
              .firstOrNull;
          if (platform != null) platformList.add(platform);
        }
      }
    }

    String? latestRunStatus;
    DateTime? latestRunFinishedAt;
    final latestRun = json['latest_run'];
    if (latestRun is Map<String, dynamic>) {
      latestRunStatus = latestRun['status'] as String?;
      final finished = latestRun['finished_at'] as String?;
      if (finished != null) {
        latestRunFinishedAt = DateTime.tryParse(finished);
      }
    }

    DateTime? lastTriggered;
    final trig = json['last_triggered_at'] as String?;
    if (trig != null) lastTriggered = DateTime.tryParse(trig);

    DateTime? lastManual;
    final man = json['last_manual_triggered_at'] as String?;
    if (man != null) lastManual = DateTime.tryParse(man);

    return WorkflowItem(
      id: id,
      name: name,
      isActive: isActive,
      sheetUrl: json['sheet_url'] as String?,
      sheetId: json['sheet_id'] as String?,
      driveFolderId: json['drive_folder_id'] as String?,
      platforms: platformList,
      mediaType: json['media_type'] as String? ?? 'video',
      runIntervalHours: (json['run_interval_hours'] as num?)?.toInt() ?? 1,
      videosPerRun: (json['videos_per_run'] as num?)?.toInt() ?? 1,
      lastTriggeredAt: lastTriggered,
      lastManualTriggeredAt: lastManual,
      totalPosted: (json['total_posted'] as num?)?.toInt() ?? 0,
      latestRunStatus: latestRunStatus,
      latestRunFinishedAt: latestRunFinishedAt,
    );
  }
}
