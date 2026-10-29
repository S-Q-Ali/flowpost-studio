import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/auth/access_token.dart';
import '../../../core/providers/app_providers.dart';
import '../../../core/session/session.dart';
import '../../../core/update/app_version.dart';
import '../settings_providers.dart';

/// Who is signed in, which build this is, where the log lives, and what the
/// app is (SPEC-settings).
class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Settings', style: theme.textTheme.headlineSmall),
                const SizedBox(height: 4),
                Text(
                  'Who is signed in, which build this is, and where the app '
                  'keeps its log.',
                  style: theme.textTheme.bodyMedium,
                ),
                const SizedBox(height: 24),
                const _AccountSection(),
                const SizedBox(height: 16),
                const _UpdatesSection(),
                const SizedBox(height: 16),
                const _LogsSection(),
                const SizedBox(height: 16),
                const _AboutSection(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      width: double.infinity,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: theme.textTheme.titleSmall),
              const SizedBox(height: 8),
              child,
            ],
          ),
        ),
      ),
    );
  }
}

class _AccountSection extends ConsumerWidget {
  const _AccountSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    if (session == null) {
      return const _Section(
        title: 'Account',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Not signed in'),
            SizedBox(height: 4),
            Text('Sign-in arrives with the production build.'),
          ],
        ),
      );
    }
    final email = emailFromAccessToken(session.accessToken);
    return _Section(
      title: 'Account',
      child: Row(
        children: [
          const Icon(Icons.account_circle_outlined),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              email ?? 'Signed in',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
          TextButton(
            key: const Key('settings-sign-out'),
            onPressed: () => _signOut(context, ref),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
  }

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: const Text(
          'Signing out removes the saved posts from this machine. '
          'Your drafts are kept.',
        ),
        actions: [
          TextButton(
            key: const Key('confirm-sign-out-keep'),
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Stay signed in'),
          ),
          FilledButton(
            key: const Key('confirm-sign-out'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(signOutProvider).run();
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Signed out.')));
  }
}

class _UpdatesSection extends ConsumerWidget {
  const _UpdatesSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final version = ref.watch(appVersionProvider);
    final configured = ref
        .watch(appConfigProvider)
        .updateManifestUrl
        .isNotEmpty;
    final state = ref.watch(updateCheckProvider);
    final result = state.result;
    final answer = _answer(configured, state);
    return _Section(
      title: 'Updates',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            version.when(
              data: (info) => info == null
                  ? 'The version is unknown.'
                  : 'Version ${info.version} (${info.buildNumber})',
              loading: () => 'Reading the version…',
              error: (error, stackTrace) => 'The version is unknown.',
            ),
          ),
          if (answer != null) ...[
            const SizedBox(height: 8),
            Text(answer, key: const Key('settings-update-answer')),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (state.checking)
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              FilledButton(
                key: const Key('settings-check-updates'),
                onPressed: !configured || state.checking
                    ? null
                    : () => ref.read(updateCheckProvider.notifier).check(),
                child: const Text('Check for updates'),
              ),
              if (result != null && result.hasUpdate)
                OutlinedButton(
                  key: const Key('settings-download'),
                  onPressed: () => _download(context, result.downloadUrl!),
                  child: const Text('Download'),
                ),
            ],
          ),
        ],
      ),
    );
  }

  String? _answer(bool configured, UpdateCheckState state) {
    if (!configured) return 'This build has no update source.';
    if (state.checking) return 'Checking for updates…';
    final result = state.result;
    if (result == null) return null;
    if (result.error != null) return result.error;
    if (result.hasUpdate) {
      return 'Version ${result.latestVersion} is available.';
    }
    return "You're up to date (v${result.currentVersion}).";
  }

  Future<void> _download(BuildContext context, Uri url) async {
    final opened = await launchUrl(url, mode: LaunchMode.externalApplication);
    if (opened || !context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Could not open the download link.')),
    );
  }
}

class _LogsSection extends ConsumerWidget {
  const _LogsSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final folder = ref.watch(logsFolderProvider);
    return _Section(
      title: 'Log file',
      child: folder.when(
        data: (dir) => dir == null
            ? const _LogsUnavailable()
            : _logFolder(ref, context, dir),
        loading: () => const Text('Looking for the log folder…'),
        error: (error, stackTrace) => const _LogsUnavailable(),
      ),
    );
  }

  Widget _logFolder(WidgetRef ref, BuildContext context, Directory dir) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(dir.path),
        const SizedBox(height: 8),
        OutlinedButton(
          key: const Key('settings-open-logs'),
          onPressed: () => _open(context, ref, dir),
          child: const Text('Open folder'),
        ),
      ],
    );
  }

  Future<void> _open(BuildContext context, WidgetRef ref, Directory dir) async {
    final opened = await ref.read(openFolderProvider)(dir);
    if (opened || !context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Could not open the log folder.')),
    );
  }
}

class _LogsUnavailable extends StatelessWidget {
  const _LogsUnavailable();

  @override
  Widget build(BuildContext context) {
    return const Text('The log folder is not available yet.');
  }
}

class _AboutSection extends StatelessWidget {
  const _AboutSection();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _Section(
      title: 'About',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('FlowPost Studio', style: theme.textTheme.titleMedium),
          const SizedBox(height: 4),
          const Text('The desktop companion to the FlowPost dashboard.'),
        ],
      ),
    );
  }
}
