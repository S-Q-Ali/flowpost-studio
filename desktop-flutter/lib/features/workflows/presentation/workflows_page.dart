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

  Future<void> _showCreateWorkflowDialog() async {
    final payload = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => const _CreateWorkflowDialog(),
    );
    if (payload == null || !mounted) return;

    final repo = ref.read(workflowsRepositoryProvider);
    final created = await repo.createWorkflow(payload);
    if (!mounted) return;
    if (created != null) {
      ref.invalidate(workflowsListProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Workflow "${created.name}" created!')),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to create workflow. Please check details.'),
        ),
      );
    }
  }

  Future<void> _deleteWorkflow(WorkflowItem workflow) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Workflow'),
        content: Text('Are you sure you want to delete "${workflow.name}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;

    final repo = ref.read(workflowsRepositoryProvider);
    final success = await repo.deleteWorkflow(workflow.id);
    if (!mounted) return;
    if (success) {
      ref.invalidate(workflowsListProvider);
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Workflow deleted.')));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to delete workflow.')),
      );
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
              Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.refresh),
                    tooltip: 'Refresh',
                    onPressed: () => ref.invalidate(workflowsListProvider),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.icon(
                    onPressed: _showCreateWorkflowDialog,
                    icon: const Icon(Icons.add),
                    label: const Text('New Workflow'),
                  ),
                ],
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
                        const SizedBox(height: 16),
                        FilledButton.icon(
                          onPressed: _showCreateWorkflowDialog,
                          icon: const Icon(Icons.add),
                          label: const Text('Create Workflow'),
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
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Switch(
                                    value: wf.isActive,
                                    onChanged: (val) => _toggleActive(wf, val),
                                  ),
                                  const SizedBox(width: 4),
                                  IconButton(
                                    icon: const Icon(
                                      Icons.delete_outline,
                                      size: 20,
                                    ),
                                    tooltip: 'Delete workflow',
                                    color: scheme.error,
                                    onPressed: () => _deleteWorkflow(wf),
                                  ),
                                ],
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

class _CreateWorkflowDialog extends StatefulWidget {
  const _CreateWorkflowDialog();

  @override
  State<_CreateWorkflowDialog> createState() => _CreateWorkflowDialogState();
}

class _CreateWorkflowDialogState extends State<_CreateWorkflowDialog> {
  final _nameController = TextEditingController();
  final _sheetUrlController = TextEditingController();
  final _folderIdController = TextEditingController();

  String _dataSource = 'g_sheet';
  final Set<String> _selectedPlatforms = {'youtube', 'instagram'};
  int _runIntervalHours = 2;
  int _videosPerRun = 1;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _sheetUrlController.dispose();
    _folderIdController.dispose();
    super.dispose();
  }

  String? _extractSheetId(String url) {
    final match = RegExp(r'/spreadsheets/d/([a-zA-Z0-9-_]+)').firstMatch(url);
    return match?.group(1);
  }

  void _submit() {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Please enter a workflow name.');
      return;
    }
    if (_selectedPlatforms.isEmpty) {
      setState(() => _error = 'Select at least one target platform.');
      return;
    }

    String? sheetUrl;
    String? sheetId;
    String? folderId;

    if (_dataSource == 'g_sheet') {
      sheetUrl = _sheetUrlController.text.trim();
      if (sheetUrl.isEmpty) {
        setState(() => _error = 'Please enter a Google Sheet URL.');
        return;
      }
      sheetId = _extractSheetId(sheetUrl) ?? sheetUrl;
    } else {
      folderId = _folderIdController.text.trim();
      if (folderId.isEmpty) {
        setState(() => _error = 'Please enter a Google Drive Folder ID.');
        return;
      }
    }

    Navigator.of(context).pop({
      'name': name,
      'data_source': _dataSource,
      'sheet_url': sheetUrl,
      'sheet_id': sheetId,
      'drive_folder_id': folderId,
      'platforms': _selectedPlatforms.toList(),
      'run_interval_hours': _runIntervalHours,
      'videos_per_run': _videosPerRun,
      'is_active': true,
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return AlertDialog(
      title: const Text('New Automated Workflow'),
      content: SizedBox(
        width: 500,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_error != null) ...[
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: scheme.errorContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.error_outline, size: 18, color: scheme.error),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _error!,
                          style: TextStyle(
                            color: scheme.onErrorContainer,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
              ],
              TextField(
                controller: _nameController,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Workflow Name',
                  hintText: 'e.g., Daily Shorts Automation',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              Text('Content Source', style: theme.textTheme.titleSmall),
              const SizedBox(height: 8),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(
                    value: 'g_sheet',
                    label: Text('Google Sheets'),
                    icon: Icon(Icons.table_chart_outlined),
                  ),
                  ButtonSegment(
                    value: 'drive',
                    label: Text('Google Drive'),
                    icon: Icon(Icons.folder_outlined),
                  ),
                ],
                selected: {_dataSource},
                onSelectionChanged: (val) {
                  setState(() {
                    _dataSource = val.first;
                    _error = null;
                  });
                },
              ),
              const SizedBox(height: 14),
              if (_dataSource == 'g_sheet')
                TextField(
                  controller: _sheetUrlController,
                  decoration: const InputDecoration(
                    labelText: 'Google Sheet URL',
                    hintText: 'https://docs.google.com/spreadsheets/d/...',
                    border: OutlineInputBorder(),
                  ),
                )
              else
                TextField(
                  controller: _folderIdController,
                  decoration: const InputDecoration(
                    labelText: 'Google Drive Folder ID',
                    hintText: 'e.g., 1A2b3C4d5E...',
                    border: OutlineInputBorder(),
                  ),
                ),
              const SizedBox(height: 16),
              Text('Target Platforms', style: theme.textTheme.titleSmall),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  for (final p in [
                    ('youtube', 'YouTube', Icons.smart_display_rounded),
                    ('instagram', 'Instagram', Icons.camera_alt_rounded),
                    ('facebook', 'Facebook', Icons.facebook_rounded),
                    ('tiktok', 'TikTok', Icons.music_note_rounded),
                    ('linkedin', 'LinkedIn', Icons.business_center_rounded),
                  ])
                    FilterChip(
                      avatar: Icon(p.$3, size: 16),
                      label: Text(p.$2),
                      selected: _selectedPlatforms.contains(p.$1),
                      onSelected: (selected) {
                        setState(() {
                          if (selected) {
                            _selectedPlatforms.add(p.$1);
                          } else {
                            _selectedPlatforms.remove(p.$1);
                          }
                          _error = null;
                        });
                      },
                    ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Run Interval', style: theme.textTheme.titleSmall),
                        const SizedBox(height: 6),
                        DropdownButtonFormField<int>(
                          initialValue: _runIntervalHours,
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 8,
                            ),
                          ),
                          items: const [
                            DropdownMenuItem(
                              value: 1,
                              child: Text('Every 1 hour'),
                            ),
                            DropdownMenuItem(
                              value: 2,
                              child: Text('Every 2 hours'),
                            ),
                            DropdownMenuItem(
                              value: 4,
                              child: Text('Every 4 hours'),
                            ),
                            DropdownMenuItem(
                              value: 6,
                              child: Text('Every 6 hours'),
                            ),
                            DropdownMenuItem(
                              value: 12,
                              child: Text('Every 12 hours'),
                            ),
                            DropdownMenuItem(
                              value: 24,
                              child: Text('Every 24 hours'),
                            ),
                          ],
                          onChanged: (val) {
                            if (val != null) {
                              setState(() => _runIntervalHours = val);
                            }
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Videos Per Run',
                          style: theme.textTheme.titleSmall,
                        ),
                        const SizedBox(height: 6),
                        DropdownButtonFormField<int>(
                          initialValue: _videosPerRun,
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 8,
                            ),
                          ),
                          items: const [
                            DropdownMenuItem(value: 1, child: Text('1 video')),
                            DropdownMenuItem(value: 2, child: Text('2 videos')),
                            DropdownMenuItem(value: 3, child: Text('3 videos')),
                            DropdownMenuItem(value: 5, child: Text('5 videos')),
                          ],
                          onChanged: (val) {
                            if (val != null) {
                              setState(() => _videosPerRun = val);
                            }
                          },
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton.icon(
          onPressed: _submit,
          icon: const Icon(Icons.check),
          label: const Text('Create Workflow'),
        ),
      ],
    );
  }
}
