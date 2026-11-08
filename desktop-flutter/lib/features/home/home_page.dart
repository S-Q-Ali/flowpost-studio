import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/providers/app_providers.dart';
import '../../core/router/app_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/update/app_version.dart';
import '../../core/update/update_banner.dart';
import '../../core/update/update_checker.dart';
import '../publishing/data/posts_repository.dart';
import '../publishing/domain/publish_target.dart';
import '../scheduling/presentation/post_status_color.dart';
import 'data/dashboard_models.dart';
import 'home_providers.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  UpdateResult? _update;
  bool _checking = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final config = ref.read(appConfigProvider);
    if (config.updateManifestUrl.isEmpty) return;
    final version = await ref.read(appVersionProvider.future);
    if (!mounted || version == null) return;
    setState(() => _checking = true);

    final result = await checkForUpdate(
      manifestUrl: Uri.parse(config.updateManifestUrl),
      currentVersion: version.version,
    );
    if (!mounted) return;
    setState(() {
      _update = result;
      _checking = false;
    });
  }

  Future<void> _download() async {
    final url = _update?.downloadUrl;
    if (url == null) return;
    final opened = await launchUrl(url, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the download link.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final update = _update;
    final version = ref.watch(appVersionProvider).value;
    final dashboardAsync = ref.watch(dashboardDataProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row with title and quick action
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 16,
            runSpacing: 16,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'FlowPost Studio',
                    style: theme.textTheme.headlineMedium?.copyWith(
                      color: scheme.onSurface,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'The native desktop experience starts here.',
                    style: theme.textTheme.bodyMedium,
                  ),
                  if (version != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      'Version ${version.version}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ],
              ),
              FilledButton.icon(
                onPressed: () => context.go(uploadRoute),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Upload & Distribute'),
              ),
            ],
          ),

          if (_checking)
            const Padding(
              padding: EdgeInsets.only(top: 16),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else if (update != null && update.hasUpdate)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: UpdateBanner(
                latestVersion: update.latestVersion!,
                onDownload: _download,
              ),
            )
          else if (update?.error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                update!.error!,
                style: TextStyle(color: scheme.error),
              ),
            ),

          const SizedBox(height: 24),

          // Dashboard stats and recent activity
          dashboardAsync.when(
            loading: () => const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: CircularProgressIndicator(),
              ),
            ),
            error: (err, _) => _DashboardContent(
              data: const DashboardData(),
              onRefresh: () => ref.refresh(dashboardDataProvider),
            ),
            data: (data) => _DashboardContent(
              data: data,
              onRefresh: () => ref.refresh(dashboardDataProvider),
            ),
          ),
        ],
      ),
    );
  }
}

class _DashboardContent extends StatelessWidget {
  const _DashboardContent({required this.data, required this.onRefresh});

  final DashboardData data;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 4 Stat Cards
        LayoutBuilder(
          builder: (context, constraints) {
            final isLargeText = MediaQuery.textScalerOf(context).scale(1) > 1.3;
            final cardWidth = (constraints.maxWidth > 900 && !isLargeText)
                ? (constraints.maxWidth - 36) / 4
                : (constraints.maxWidth > 500
                      ? (constraints.maxWidth - 12) / 2
                      : constraints.maxWidth);

            return Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _StatCard(
                  width: cardWidth,
                  label: 'Videos Uploaded',
                  value: '${data.videos}',
                  icon: Icons.video_library_rounded,
                  iconColor: scheme.primary,
                ),
                _StatCard(
                  width: cardWidth,
                  label: 'Scheduled',
                  value: '${data.scheduled}',
                  icon: Icons.calendar_month_rounded,
                  iconColor: Colors.amber.shade700,
                ),
                _StatCard(
                  width: cardWidth,
                  label: 'Published',
                  value: '${data.published}',
                  icon: Icons.cloud_done_rounded,
                  iconColor: theme.success,
                ),
                _StatCard(
                  width: cardWidth,
                  label: 'Connected Accounts',
                  value: '${data.accounts}',
                  icon: Icons.link_rounded,
                  iconColor: scheme.secondary,
                ),
              ],
            );
          },
        ),

        const SizedBox(height: 28),

        // Recent Activity Card
        Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: scheme.outlineVariant),
          ),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Recent Activity',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.refresh, size: 20),
                      tooltip: 'Refresh',
                      onPressed: onRefresh,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                if (data.recentPosts.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Center(
                      child: Text(
                        'No posts yet. Upload your first video to get started!',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  )
                else
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: data.recentPosts.length,
                    separatorBuilder: (context, index) =>
                        const Divider(height: 16),
                    itemBuilder: (context, index) {
                      final post = data.recentPosts[index];
                      return Row(
                        children: [
                          Icon(
                            _platformIcon(post.platform.name),
                            size: 24,
                            color: scheme.primary,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  post.title ?? 'Untitled media',
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    fontWeight: FontWeight.w600,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  post.scheduledAt != null
                                      ? post.scheduledAt!
                                            .toLocal()
                                            .toString()
                                            .split('.')
                                            .first
                                      : post.platform.label,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: scheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          _StatusBadge(status: post.status),
                        ],
                      );
                    },
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  static IconData _platformIcon(String platform) {
    return switch (platform.toLowerCase()) {
      'youtube' => Icons.smart_display_rounded,
      'facebook' => Icons.facebook_rounded,
      'instagram' => Icons.camera_alt_rounded,
      'tiktok' => Icons.music_note_rounded,
      'linkedin' => Icons.business_center_rounded,
      _ => Icons.share_rounded,
    };
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.width,
    required this.label,
    required this.value,
    required this.icon,
    required this.iconColor,
  });

  final double width;
  final String label;
  final String value;
  final IconData icon;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return SizedBox(
      width: width,
      child: Card(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: scheme.outlineVariant),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      label,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Icon(icon, size: 24, color: iconColor),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                value,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final PostStatus status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = postStatusColor(status, theme);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        status.name.toUpperCase(),
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.bold,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}
