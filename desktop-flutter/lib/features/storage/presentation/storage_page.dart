import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../domain/storage_models.dart';
import '../storage_providers.dart';

class StoragePage extends ConsumerStatefulWidget {
  const StoragePage({super.key});

  @override
  ConsumerState<StoragePage> createState() => _StoragePageState();
}

class _StoragePageState extends ConsumerState<StoragePage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  // Drive state
  String? _selectedDriveAccountId;
  StorageQuota? _driveQuota;
  List<StorageFileItem> _driveFiles = [];
  final List<_Breadcrumb> _driveBreadcrumbs = [
    const _Breadcrumb(id: 'root', name: 'My Drive'),
  ];
  bool _loadingDrive = false;

  // MEGA state
  String? _selectedMegaAccountId;
  StorageQuota? _megaQuota;
  List<StorageFileItem> _megaFiles = [];
  final List<String> _megaBreadcrumbs = ['/'];
  bool _loadingMega = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) {
        setState(() {});
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _initLoads());
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _initLoads() {
    final driveAccounts = ref.read(driveAccountsProvider);
    if (driveAccounts.isNotEmpty) {
      _selectedDriveAccountId = driveAccounts.first.accountId;
      _loadDrive();
    }
    final megaAccounts = ref.read(megaAccountsProvider);
    if (megaAccounts.isNotEmpty) {
      _selectedMegaAccountId = megaAccounts.first.accountId;
      _loadMega();
    }
  }

  Future<void> _loadDrive() async {
    if (_selectedDriveAccountId == null) {
      final driveAccounts = ref.read(driveAccountsProvider);
      if (driveAccounts.isNotEmpty) {
        _selectedDriveAccountId = driveAccounts.first.accountId;
      }
    }
    final accountId = _selectedDriveAccountId;
    if (accountId == null) return;
    setState(() => _loadingDrive = true);
    final client = ref.read(storageClientProvider);
    final folderId = _driveBreadcrumbs.last.id == 'root'
        ? null
        : _driveBreadcrumbs.last.id;
    final quota = await client.getDriveQuota(accountId);
    final files = await client.listDriveFiles(accountId, folderId: folderId);
    if (!mounted) return;
    setState(() {
      _driveQuota = quota;
      _driveFiles = files;
      _loadingDrive = false;
    });
  }

  Future<void> _loadMega() async {
    if (_selectedMegaAccountId == null) {
      final megaAccounts = ref.read(megaAccountsProvider);
      if (megaAccounts.isNotEmpty) {
        _selectedMegaAccountId = megaAccounts.first.accountId;
      }
    }
    final accountId = _selectedMegaAccountId;
    if (accountId == null) return;
    setState(() => _loadingMega = true);
    final client = ref.read(storageClientProvider);
    final path = _megaBreadcrumbs.join('/');
    final quota = await client.getMegaQuota(accountId);
    final files = await client.listMegaItems(
      accountId,
      path: path == '/' ? null : path,
    );
    if (!mounted) return;
    setState(() {
      _megaQuota = quota;
      _megaFiles = files;
      _loadingMega = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(driveAccountsProvider, (_, next) {
      if (next.isNotEmpty &&
          (_selectedDriveAccountId == null ||
              !next.any((a) => a.accountId == _selectedDriveAccountId))) {
        setState(() => _selectedDriveAccountId = next.first.accountId);
        _loadDrive();
      }
    });

    ref.listen(megaAccountsProvider, (_, next) {
      if (next.isNotEmpty &&
          (_selectedMegaAccountId == null ||
              !next.any((a) => a.accountId == _selectedMegaAccountId))) {
        setState(() => _selectedMegaAccountId = next.first.accountId);
        _loadMega();
      }
    });

    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final driveAccounts = ref.watch(driveAccountsProvider);
    final megaAccounts = ref.watch(megaAccountsProvider);

    return Scaffold(
      body: SingleChildScrollView(
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
                      Text(
                        'Storage Manager',
                        style: theme.textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Explore files and storage quotas across cloud accounts.',
                        style: theme.textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
                TabBar(
                  controller: _tabController,
                  isScrollable: true,
                  tabs: const [
                    Tab(icon: Icon(Icons.add_to_drive), text: 'Google Drive'),
                    Tab(icon: Icon(Icons.cloud_outlined), text: 'MEGA'),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 24),
            if (_tabController.index == 0)
              _buildDriveTab(driveAccounts, scheme, theme)
            else
              _buildMegaTab(megaAccounts, scheme, theme),
          ],
        ),
      ),
    );
  }

  Widget _buildDriveTab(
    List<dynamic> accounts,
    ColorScheme scheme,
    ThemeData theme,
  ) {
    if (accounts.isEmpty) {
      return _buildNoAccountState(
        'Google Drive',
        Icons.add_to_drive,
        scheme,
        theme,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_driveQuota != null) ...[
          _buildQuotaBar(_driveQuota!, scheme, theme),
          const SizedBox(height: 16),
        ],
        _buildDriveBreadcrumbs(scheme, theme),
        const SizedBox(height: 8),
        if (_loadingDrive)
          const Padding(
            padding: EdgeInsets.all(32),
            child: Center(child: CircularProgressIndicator()),
          )
        else
          _buildFileList(_driveFiles, scheme, theme, (item) {
            if (item.isFolder) {
              setState(() {
                _driveBreadcrumbs.add(
                  _Breadcrumb(id: item.id, name: item.name),
                );
              });
              _loadDrive();
            }
          }),
      ],
    );
  }

  Widget _buildMegaTab(
    List<dynamic> accounts,
    ColorScheme scheme,
    ThemeData theme,
  ) {
    if (accounts.isEmpty) {
      return _buildNoAccountState('MEGA', Icons.cloud_outlined, scheme, theme);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_megaQuota != null) ...[
          _buildQuotaBar(_megaQuota!, scheme, theme),
          const SizedBox(height: 16),
        ],
        _buildMegaBreadcrumbs(scheme, theme),
        const SizedBox(height: 8),
        if (_loadingMega)
          const Padding(
            padding: EdgeInsets.all(32),
            child: Center(child: CircularProgressIndicator()),
          )
        else
          _buildFileList(_megaFiles, scheme, theme, (item) {
            if (item.isFolder) {
              setState(() {
                _megaBreadcrumbs.add(item.name);
              });
              _loadMega();
            }
          }),
      ],
    );
  }

  Widget _buildQuotaBar(
    StorageQuota quota,
    ColorScheme scheme,
    ThemeData theme,
  ) {
    final usedStr = StorageQuota.formatBytes(quota.usedBytes);
    final totalStr = quota.totalBytes != null
        ? StorageQuota.formatBytes(quota.totalBytes!)
        : 'Unlimited';

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: scheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Storage Usage', style: theme.textTheme.titleSmall),
                Text(
                  '$usedStr / $totalStr',
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            LinearProgressIndicator(
              value: quota.fraction,
              backgroundColor: scheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(4),
              minHeight: 6,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDriveBreadcrumbs(ColorScheme scheme, ThemeData theme) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (int i = 0; i < _driveBreadcrumbs.length; i++) ...[
            if (i > 0)
              const Icon(Icons.chevron_right, size: 16, color: Colors.grey),
            ActionChip(
              label: Text(_driveBreadcrumbs[i].name),
              onPressed: () {
                if (i < _driveBreadcrumbs.length - 1) {
                  setState(() {
                    _driveBreadcrumbs.removeRange(
                      i + 1,
                      _driveBreadcrumbs.length,
                    );
                  });
                  _loadDrive();
                }
              },
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildMegaBreadcrumbs(ColorScheme scheme, ThemeData theme) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (int i = 0; i < _megaBreadcrumbs.length; i++) ...[
            if (i > 0)
              const Icon(Icons.chevron_right, size: 16, color: Colors.grey),
            ActionChip(
              label: Text(_megaBreadcrumbs[i]),
              onPressed: () {
                if (i < _megaBreadcrumbs.length - 1) {
                  setState(() {
                    _megaBreadcrumbs.removeRange(
                      i + 1,
                      _megaBreadcrumbs.length,
                    );
                  });
                  _loadMega();
                }
              },
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildFileList(
    List<StorageFileItem> items,
    ColorScheme scheme,
    ThemeData theme,
    ValueChanged<StorageFileItem> onTap,
  ) {
    if (items.isEmpty) {
      return Center(
        child: Text(
          'This folder is empty.',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: scheme.onSurfaceVariant,
          ),
        ),
      );
    }

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: items.length,
      separatorBuilder: (context, index) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final item = items[index];
        return ListTile(
          leading: Icon(
            item.isFolder ? Icons.folder : Icons.insert_drive_file_outlined,
            color: item.isFolder ? scheme.primary : scheme.onSurfaceVariant,
          ),
          title: Text(item.name, maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: item.isFolder
              ? null
              : Text(
                  item.sizeBytes > 0
                      ? StorageQuota.formatBytes(item.sizeBytes)
                      : 'File',
                ),
          trailing: item.isFolder
              ? const Icon(Icons.chevron_right, size: 18)
              : null,
          onTap: () => onTap(item),
        );
      },
    );
  }

  Widget _buildNoAccountState(
    String platformName,
    IconData icon,
    ColorScheme scheme,
    ThemeData theme,
  ) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: scheme.onSurfaceVariant),
            const SizedBox(height: 12),
            Text(
              'No $platformName account connected',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              'Connect your $platformName in Accounts to view and manage cloud media.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () => context.go(accountsRoute),
              icon: const Icon(Icons.link),
              label: const Text('Go to Accounts'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Breadcrumb {
  const _Breadcrumb({required this.id, required this.name});
  final String id;
  final String name;
}
