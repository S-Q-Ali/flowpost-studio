import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../accounts_providers.dart';
import '../domain/connected_account.dart';

class AccountsPage extends ConsumerWidget {
  const AccountsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final accounts = ref.watch(accountsControllerProvider);
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Accounts', style: theme.textTheme.headlineMedium),
          const SizedBox(height: 4),
          Text(
            'Connect the channels FlowPost publishes to.',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 4),
          Text(
            'Local preview: connections are saved on this PC until sign-in is wired.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
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
              data: (items) => items.isEmpty
                  ? const Center(child: Text('No accounts yet.'))
                  : _AccountGrid(
                      items: items,
                      onAction: (account) => _setStatus(context, ref, account),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _setStatus(
    BuildContext context,
    WidgetRef ref,
    ConnectedAccount account,
  ) async {
    final next = account.status == AccountStatus.connected
        ? AccountStatus.disconnected
        : AccountStatus.connected;
    try {
      await ref
          .read(accountsControllerProvider.notifier)
          .setStatus(account.platform, next);
    } on Object {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not save the account. Try again.')),
      );
    }
  }
}

class _AccountGrid extends StatelessWidget {
  const _AccountGrid({required this.items, required this.onAction});

  final List<ConnectedAccount> items;
  final ValueChanged<ConnectedAccount> onAction;

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
                  child: _AccountCard(
                    account: account,
                    onAction: () => onAction(account),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _AccountCard extends StatelessWidget {
  const _AccountCard({required this.account, required this.onAction});

  final ConnectedAccount account;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final connected = account.status == AccountStatus.connected;
    return Card(
      key: Key('account-${account.platform.name}'),
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
            const SizedBox(height: 2),
            Text(
              account.accountName,
              style: theme.textTheme.bodySmall?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: connected
                  ? OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: scheme.onSurface,
                      ),
                      onPressed: onAction,
                      child: const Text('Disconnect'),
                    )
                  : FilledButton(
                      style: FilledButton.styleFrom(
                        foregroundColor: scheme.onSurface,
                      ),
                      onPressed: onAction,
                      child: Text(
                        account.status == AccountStatus.expired
                            ? 'Reconnect'
                            : 'Connect',
                      ),
                    ),
            ),
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
    final scheme = Theme.of(context).colorScheme;
    final (label, color) = switch (status) {
      AccountStatus.connected => ('Connected', Colors.green.shade700),
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
