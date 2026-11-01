import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../accounts_providers.dart';
import '../domain/connected_account.dart';

class AccountsPage extends ConsumerWidget {
  const AccountsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final accounts = ref.watch(accountsControllerProvider);
    final read = accounts.value;
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Accounts', style: theme.textTheme.headlineMedium),
          const SizedBox(height: 4),
          Text(
            'The channels FlowPost publishes to. '
            'Connect a platform in the web dashboard.',
            style: theme.textTheme.bodyMedium,
          ),
          // The list is the server's whenever the server answered; only a
          // read that could not reach it is the copy this PC kept. Nothing
          // kept is not a copy, it is the empty state.
          if (read != null && read.offline && read.accounts.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              'Showing the accounts this PC kept. The live list returns with '
              'a connection.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
          const SizedBox(height: 20),
          Expanded(
            child: accounts.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, stackTrace) => _ErrorState(
                onRetry: () {
                  ref.invalidate(accountsRepositoryProvider);
                  ref.invalidate(accountsControllerProvider);
                },
              ),
              data: (read) => read.accounts.isEmpty
                  ? const Center(
                      child: Text(
                        'No accounts yet. '
                        'Connect a platform in the web dashboard.',
                      ),
                    )
                  : _AccountGrid(items: read.accounts),
            ),
          ),
        ],
      ),
    );
  }
}

class _AccountGrid extends StatelessWidget {
  const _AccountGrid({required this.items});

  final List<ConnectedAccount> items;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const spacing = 16.0;
        const maxCardWidth = 400.0;
        final columns = math.min(
          3,
          math.max(1, (constraints.maxWidth / maxCardWidth).round()),
        );
        final cardWidth = math.min(
          maxCardWidth,
          (constraints.maxWidth - spacing * (columns - 1)) / columns,
        );
        return SingleChildScrollView(
          child: Wrap(
            spacing: spacing,
            runSpacing: spacing,
            children: [
              for (final account in items)
                SizedBox(
                  width: cardWidth,
                  child: _AccountCard(account: account),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _AccountCard extends StatelessWidget {
  const _AccountCard({required this.account});

  final ConnectedAccount account;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Card(
      // Two accounts of one platform are two cards, so the account id is
      // part of the key.
      key: Key('account-${account.platform.name}-${account.accountId}'),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Wrap instead of Row: a large text scale moves the badge to its
            // own line rather than overflowing the card.
            SizedBox(
              width: double.infinity,
              child: Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 8,
                runSpacing: 8,
                children: [
                  CircleAvatar(
                    backgroundColor: scheme.primary.withValues(alpha: 0.12),
                    child: _PlatformIcon(
                      platform: account.platform,
                      color: scheme.primary,
                    ),
                  ),
                  _StatusBadge(status: account.status),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text(account.platform.label, style: theme.textTheme.titleMedium),
            if (account.accountName.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(
                account.accountName,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final AccountStatus status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final (label, color) = switch (status) {
      AccountStatus.connected => ('Connected', theme.success),
      AccountStatus.disconnected => ('Not connected', scheme.onSurfaceVariant),
      AccountStatus.expired => ('Expired', scheme.error),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: scheme.onSurface,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('Could not load your accounts.'),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
        ],
      ),
    );
  }
}

/// Literal `Icons` calls keep the release icon tree-shaker from dropping these.
class _PlatformIcon extends StatelessWidget {
  const _PlatformIcon({required this.platform, required this.color});

  final SocialPlatform platform;
  final Color color;

  @override
  Widget build(BuildContext context) => switch (platform) {
    SocialPlatform.youtube => Icon(Icons.smart_display_rounded, color: color),
    SocialPlatform.meta => Icon(Icons.groups_rounded, color: color),
    SocialPlatform.tiktok => Icon(Icons.music_note_rounded, color: color),
    SocialPlatform.linkedin => Icon(Icons.work_outline_rounded, color: color),
    SocialPlatform.googleDrive => Icon(Icons.cloud_outlined, color: color),
    SocialPlatform.mega => Icon(Icons.storage_rounded, color: color),
  };
}
