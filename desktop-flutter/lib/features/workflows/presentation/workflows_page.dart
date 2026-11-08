import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../publishing/domain/publish_target.dart';
import '../domain/workflow.dart';
import '../workflows_providers.dart';

class WorkflowsPage extends ConsumerStatefulWidget {
  const WorkflowsPage({super.key});

  @override
  ConsumerState<WorkflowsPage> createState() => _WorkflowsPageState();
}

class _WorkflowsPageState extends ConsumerState<WorkflowsPage> {
  final Set<String> _triggeringIds = {};

  Future<void> _toggleActive(WorkflowItem workflow, bool newValue) async {
    final repo = ref.read(workflowsRepositoryProvider);
    final success = await repo.toggleWorkflow(workflow.id, newValue);
    if (!mounted) return;
    if (success) {
      ref.invalidate(workflowsListProvider);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to update workflow state.')),
      );
    }
  }

  Future<void> _runNow(WorkflowItem workflow) async {
    setState(() => _triggeringIds.add(workflow.id));
    final repo = ref.read(workflowsRepositoryProvider);
    final success = await repo.triggerWorkflow(workflow.id);
    if (!mounted) return;
    setState(() => _triggeringIds.remove(workflow.id));

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success
              ? 'Workflow triggered successfully.'
              : 'Failed to trigger workflow. Please try again.',
        ),
      ),
    );
    if (success) {
      ref.invalidate(workflowsListProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final workflowsAsync = ref.watch(workflowsListProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Workflows', style: theme.textTheme.headlineMedium),
                    const SizedBox(height: 4),
                    Text(
                      'Automate multi-platform publishing from Google Sheets or Drive.',
                      style: theme.textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.refresh),
                tooltip: 'Refresh',
                onPressed: () => ref.invalidate(workflowsListProvider),
              ),
            ],
          ),
          const SizedBox(height: 24),
          workflowsAsync.when(
            loading: () => const Center(
              child: Padding(
                padding: EdgeInsets.all(48),
                child: CircularProgressIndicator(),
              ),
            ),
            error: (err, _) => Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  children: [
                    Icon(Icons.error_outline, size: 48, color: scheme.error),
                    const SizedBox(height: 12),
                    const Text('Failed to load workflows'),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: () => ref.invalidate(workflowsListProvider),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            ),
            data: (workflows) {
              if (workflows.isEmpty) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(48),
                    child: Column(
                      children: [
                        Icon(
                          Icons.account_tree_outlined,
                          size: 56,
                          color: scheme.onSurfaceVariant,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'No workflows found',
                          style: theme.textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Automations configured in FlowPost Studio will appear here.',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }

              return ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: workflows.length,
                separatorBuilder: (context, index) =>
                    const SizedBox(height: 16),
                itemBuilder: (context, index) {
                  final wf = workflows[index];
                  final isTriggering = _triggeringIds.contains(wf.id);

                  return Card(
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
                              Expanded(
                                child: Text(
                                  wf.name,
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.bold,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              Switch(
                                value: wf.isActive,
                                onChanged: (val) => _toggleActive(wf, val),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final platform in wf.platforms)
                                Chip(
                                  avatar: Icon(
                                    _platformIcon(platform.name),
                                    size: 16,
                                  ),
                                  label: Text(platform.label),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 4,
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Icon(
                                wf.sheetId != null
                                    ? Icons.table_chart_outlined
                                    : Icons.folder_outlined,
                                size: 16,
                                color: scheme.onSurfaceVariant,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                wf.sheetId != null
                                    ? 'Source: Google Sheet'
                                    : 'Source: Google Drive',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: scheme.onSurfaceVariant,
                                ),
                              ),
                              const SizedBox(width: 16),
                              Icon(
                                Icons.schedule_rounded,
                                size: 16,
                                color: scheme.onSurfaceVariant,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                'Every ${wf.runIntervalHours}h · ${wf.videosPerRun} video(s)/run',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: scheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  _RunStatusChip(status: wf.latestRunStatus),
                                  const SizedBox(width: 12),
                                  Text(
                                    'Total posted: ${wf.totalPosted}',
                                    style: theme.textTheme.bodySmall?.copyWith(
                                      color: scheme.onSurfaceVariant,
                                    ),
                                  ),
                                ],
                              ),
                              FilledButton.tonalIcon(
                                onPressed: isTriggering
                                    ? null
                                    : () => _runNow(wf),
                                icon: isTriggering
                                    ? const SizedBox(
                                        width: 14,
                                        height: 14,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : const Icon(
                                        Icons.play_arrow_rounded,
                                        size: 18,
                                      ),
                                label: Text(
                                  isTriggering ? 'Running…' : 'Run Now',
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ],
      ),
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

class _RunStatusChip extends StatelessWidget {
  const _RunStatusChip({this.status});

  final String? status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (label, color) = switch (status?.toLowerCase()) {
      'success' => ('SUCCESS', theme.success),
      'failed' => ('FAILED', theme.colorScheme.error),
      'running' => ('RUNNING', theme.colorScheme.primary),
      _ => ('NEVER RUN', theme.colorScheme.onSurfaceVariant),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        label,
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
