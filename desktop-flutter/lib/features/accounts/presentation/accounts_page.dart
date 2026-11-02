import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../accounts_providers.dart';
import '../connect_controller.dart';
import '../domain/connect_target.dart';
import '../domain/connected_account.dart';

class AccountsPage extends ConsumerWidget {
  const AccountsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final accounts = ref.watch(accountsControllerProvider);
    final connect = ref.watch(connectControllerProvider);
    final controller = ref.read(connectControllerProvider.notifier);
    final read = accounts.value;
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Accounts', style: theme.textTheme.headlineMedium),
          const SizedBox(height: 4),
          Text(
            'The channels FlowPost publishes to. A connect opens the browser '
            'and comes back here.',
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
              data: (read) => SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _ConnectChips(
                      busy: connect.waitingOn != null,
                      onStart: controller.start,
                    ),
                    const SizedBox(height: 20),
                    if (read.accounts.isEmpty)
                      Text(
                        'No accounts yet. Connect a platform above.',
                        style: theme.textTheme.bodyMedium,
                      )
                    else
                      _AccountGrid(
                        items: read.accounts,
                        onDisconnect: (account) =>
                            _confirmDisconnect(context, controller, account),
                        onReconnect: controller.start,
                      ),
                  ],
                ),
              ),
            ),
          ),
          // Both stay out of the scroll: a wait the admin cannot see is a
          // connect they will start twice.
          if (connect.waitingOn != null) ...[
            const SizedBox(height: 12),
            _WaitingBar(
              label: connect.waitingLabel ?? connect.waitingOn!,
              onCancel: controller.stop,
            ),
          ],
          if (connect.message != null) ...[
            const SizedBox(height: 12),
            _MessageBar(
              message: connect.message!,
              onDismiss: () {
                controller.clearMessage();
              },
            ),
          ],
        ],
      ),
    );
  }

  /// Disconnect answers a question first: cutting a grant is the one account
  /// action the admin cannot undo by pressing back.
  Future<void> _confirmDisconnect(
    BuildContext context,
    ConnectController controller,
    ConnectedAccount account,
  ) async {
    final platform = connectLabelOf(account.serverPlatform);
    final cut = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Disconnect $platform?'),
        content: Text(
          'FlowPost stops publishing there and lets go of the sign-in it '
          'holds${account.accountName.isEmpty ? '' : ' for ${account.accountName}'}.',
        ),
        actions: [
          TextButton(
            key: const Key('disconnect-cancel'),
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            key: const Key('disconnect-confirm'),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Disconnect'),
          ),
        ],
      ),
    );
    if (cut == true) await controller.disconnect(account);
  }
}

class _ConnectChips extends StatelessWidget {
  const _ConnectChips({required this.busy, required this.onStart});

  final bool busy;
  final void Function(String serverPlatform) onStart;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Connect a platform', style: theme.textTheme.titleSmall),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final target in connectTargets)
              ActionChip(
                // The key names the server platform: Instagram and Facebook
                // are two connects and one card.
                key: Key('connect-${target.serverPlatform}'),
                avatar: const Icon(Icons.add_rounded, size: 16),
                label: Text(target.label),
                onPressed: busy ? null : () => onStart(target.serverPlatform),
              ),
          ],
        ),
      ],
    );
  }
}

class _AccountGrid extends StatelessWidget {
  const _AccountGrid({
    required this.items,
    required this.onDisconnect,
    required this.onReconnect,
  });

  final List<ConnectedAccount> items;
  final void Function(ConnectedAccount account) onDisconnect;
  final void Function(String serverPlatform) onReconnect;

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
        return Wrap(
          spacing: spacing,
          runSpacing: spacing,
          children: [
            for (final account in items)
              SizedBox(
                width: cardWidth,
                child: _AccountCard(
                  account: account,
                  // A row the server never gave an id to cannot be named in a
                  // disconnect, so no button offers one.
                  onDisconnect: account.accountId.isEmpty
                      ? null
                      : () => onDisconnect(account),
                  onReconnect:
                      account.status == AccountStatus.expired &&
                          canConnect(account.serverPlatform)
                      ? () => onReconnect(account.serverPlatform)
                      : null,
                ),
              ),
          ],
        );
      },
    );
  }
}

class _AccountCard extends StatelessWidget {
  const _AccountCard({
    required this.account,
    this.onDisconnect,
    this.onReconnect,
  });

  final ConnectedAccount account;
  final VoidCallback? onDisconnect;
  final VoidCallback? onReconnect;

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
            if (onReconnect != null || onDisconnect != null) ...[
              const SizedBox(height: 16),
              // Wrap again: at 200% text two buttons do not fit one line.
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (onReconnect != null)
                    FilledButton.tonal(
                      key: Key(
                        'reconnect-${account.platform.name}-'
                        '${account.accountId}',
                      ),
                      onPressed: onReconnect,
                      child: const Text('Reconnect'),
                    ),
                  if (onDisconnect != null)
                    OutlinedButton(
                      key: Key(
                        'disconnect-${account.platform.name}-'
                        '${account.accountId}',
                      ),
                      onPressed: onDisconnect,
                      child: const Text('Disconnect'),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _WaitingBar extends StatelessWidget {
  const _WaitingBar({required this.label, required this.onCancel});

  final String label;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return Card(
      key: const Key('connect-waiting'),
      margin: EdgeInsets.zero,
      child: ListTile(
        leading: const SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        title: Text('Waiting for $label to finish in the browser.'),
        trailing: TextButton(
          key: const Key('connect-cancel'),
          onPressed: onCancel,
          child: const Text('Cancel'),
        ),
      ),
    );
  }
}

class _MessageBar extends StatelessWidget {
  const _MessageBar({required this.message, required this.onDismiss});

  final String message;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Card(
      key: const Key('connect-message'),
      margin: EdgeInsets.zero,
      child: ListTile(
        title: Text(message),
        trailing: IconButton(
          key: const Key('connect-message-dismiss'),
          icon: const Icon(Icons.close_rounded),
          tooltip: 'Dismiss',
          onPressed: onDismiss,
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
