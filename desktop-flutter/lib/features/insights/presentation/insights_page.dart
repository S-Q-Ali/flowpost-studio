import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../domain/insights_models.dart';
import '../insights_providers.dart';

class InsightsPage extends ConsumerStatefulWidget {
  const InsightsPage({super.key});

  @override
  ConsumerState<InsightsPage> createState() => _InsightsPageState();
}

class _InsightsPageState extends ConsumerState<InsightsPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  String _currentPlatform = 'instagram';
  int _rangeDays = 30;

  String? _selectedIgAccountId;
  String? _selectedFbAccountId;

  InsightsData? _insightsData;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (_tabController.indexIsChanging) return;
      setState(() {
        _currentPlatform = _tabController.index == 0 ? 'instagram' : 'facebook';
      });
      _loadInsights();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _initLoad());
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _initLoad() {
    final igAccounts = ref.read(instagramAccountsProvider);
    if (igAccounts.isNotEmpty) {
      _selectedIgAccountId = igAccounts.first.accountId;
    }
    final fbAccounts = ref.read(facebookAccountsProvider);
    if (fbAccounts.isNotEmpty) {
      _selectedFbAccountId = fbAccounts.first.accountId;
    }
    _loadInsights();
  }

  Future<void> _loadInsights() async {
    final accountId = _currentPlatform == 'instagram'
        ? _selectedIgAccountId
        : _selectedFbAccountId;
    if (accountId == null) {
      setState(() => _insightsData = null);
      return;
    }

    setState(() => _loading = true);
    final client = ref.read(insightsClientProvider);
    final data = await client.fetchInsights(
      platform: _currentPlatform,
      accountId: accountId,
      rangeDays: _rangeDays,
    );
    if (!mounted) return;
    setState(() {
      _insightsData = data;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final igAccounts = ref.watch(instagramAccountsProvider);
    final fbAccounts = ref.watch(facebookAccountsProvider);

    final currentAccounts = _currentPlatform == 'instagram'
        ? igAccounts
        : fbAccounts;

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
                        'Insights & Analytics',
                        style: theme.textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Track engagement, follower growth, and publishing success.',
                        style: theme.textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
                TabBar(
                  controller: _tabController,
                  isScrollable: true,
                  tabs: const [
                    Tab(
                      icon: Icon(Icons.camera_alt_rounded),
                      text: 'Instagram',
                    ),
                    Tab(icon: Icon(Icons.facebook_rounded), text: 'Facebook'),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Filters Row: Account + Date Range
            Wrap(
              spacing: 12,
              runSpacing: 12,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                if (currentAccounts.isNotEmpty) ...[
                  DropdownButton<String>(
                    value: _currentPlatform == 'instagram'
                        ? _selectedIgAccountId
                        : _selectedFbAccountId,
                    hint: const Text('Select Account'),
                    items: [
                      for (final a in currentAccounts)
                        DropdownMenuItem(
                          value: a.accountId,
                          child: Text(
                            a.accountName.isNotEmpty
                                ? a.accountName
                                : a.accountId,
                          ),
                        ),
                    ],
                    onChanged: (val) {
                      setState(() {
                        if (_currentPlatform == 'instagram') {
                          _selectedIgAccountId = val;
                        } else {
                          _selectedFbAccountId = val;
                        }
                      });
                      _loadInsights();
                    },
                  ),
                  const SizedBox(width: 8),
                ],
                for (final days in [7, 14, 30, 90])
                  ChoiceChip(
                    label: Text('$days days'),
                    selected: _rangeDays == days,
                    onSelected: (sel) {
                      if (sel) {
                        setState(() => _rangeDays = days);
                        _loadInsights();
                      }
                    },
                  ),
                IconButton(
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh',
                  onPressed: _loadInsights,
                ),
              ],
            ),

            const SizedBox(height: 24),

            if (currentAccounts.isEmpty)
              _buildNoAccountState(
                _currentPlatform == 'instagram' ? 'Instagram' : 'Facebook',
                scheme,
                theme,
              )
            else if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(48),
                  child: CircularProgressIndicator(),
                ),
              )
            else
              _buildInsightsView(_insightsData, scheme, theme),
          ],
        ),
      ),
    );
  }

  Widget _buildInsightsView(
    InsightsData? data,
    ColorScheme scheme,
    ThemeData theme,
  ) {
    final d = data ?? InsightsData(platform: _currentPlatform);

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
                _InsightCard(
                  width: cardWidth,
                  label: _currentPlatform == 'instagram'
                      ? 'Followers'
                      : 'Page Followers',
                  value: '${d.followersCount}',
                  icon: Icons.people_outline_rounded,
                  iconColor: scheme.primary,
                ),
                _InsightCard(
                  width: cardWidth,
                  label: 'Total Posts',
                  value: '${d.totalPosts}',
                  icon: Icons.post_add_rounded,
                  iconColor: Colors.blue.shade600,
                ),
                _InsightCard(
                  width: cardWidth,
                  label: 'Net Growth (30d)',
                  value: d.growth30d >= 0
                      ? '+${d.growth30d}'
                      : '${d.growth30d}',
                  icon: Icons.trending_up_rounded,
                  iconColor: theme.success,
                ),
                _InsightCard(
                  width: cardWidth,
                  label: 'Publish Success Rate',
                  value: '${d.successRate}%',
                  icon: Icons.check_circle_outline_rounded,
                  iconColor: theme.success,
                ),
              ],
            );
          },
        ),

        const SizedBox(height: 28),

        // Activity Trend Card
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
                Text(
                  'Publishing Activity (Last $_rangeDays Days)',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Total published: ${d.totalPublished} · This month: ${d.thisMonth} · This week: ${d.thisWeek}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 20),
                if (d.timeline.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Center(
                      child: Text(
                        'No publishing activity recorded for this period.',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  )
                else
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        for (final pt in d.timeline) ...[
                          Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                '${pt.value}',
                                style: theme.textTheme.labelSmall?.copyWith(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Container(
                                width: 24,
                                height: (pt.value * 20.0).clamp(10.0, 120.0),
                                decoration: BoxDecoration(
                                  color: scheme.primary,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                pt.date.length >= 5
                                    ? pt.date.substring(pt.date.length - 5)
                                    : pt.date,
                                style: theme.textTheme.labelSmall?.copyWith(
                                  fontSize: 9,
                                  color: scheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(width: 8),
                        ],
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildNoAccountState(
    String platformName,
    ColorScheme scheme,
    ThemeData theme,
  ) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(48),
        child: Column(
          children: [
            Icon(
              Icons.bar_chart_rounded,
              size: 56,
              color: scheme.onSurfaceVariant,
            ),
            const SizedBox(height: 16),
            Text(
              'No $platformName accounts connected',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              'Connect your $platformName in Accounts to view real-time audience analytics.',
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

class _InsightCard extends StatelessWidget {
  const _InsightCard({
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
