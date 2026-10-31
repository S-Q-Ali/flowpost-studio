import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/app_config.dart';
import '../../../core/config/config_controller.dart';
import '../../../core/diagnostics/diagnostics_report.dart';
import '../../../core/router/app_router.dart';
import '../../../core/update/app_version.dart';
import '../../license/data/license_models.dart';
import '../../license/license_controller.dart';
import '../settings_providers.dart';
import 'credentials_form.dart';

/// The license, which build this is, where the log lives, and what the app is
/// (SPEC-settings).
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
                  'Your license, which build this is, and where the app keeps '
                  'its log.',
                  style: theme.textTheme.bodyMedium,
                ),
                const SizedBox(height: 24),
                const _LicenseSection(),
                const SizedBox(height: 16),
                const _CredentialsSection(),
                const SizedBox(height: 16),
                const _UpdatesSection(),
                const SizedBox(height: 16),
                const _DiagnosticsSection(),
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

class _LicenseSection extends ConsumerWidget {
  const _LicenseSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(licenseControllerProvider);
    return _Section(
      title: 'License',
      child: state.when(
        loading: () => const Text('Checking the license…'),
        error: (error, stackTrace) =>
            const Text('The license could not be read.'),
        data: (license) => license is Active
            ? _active(context, ref, license)
            : _locked(context, license),
      ),
    );
  }

  Widget _active(BuildContext context, WidgetRef ref, Active license) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.verified_user_outlined),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Active license',
                    key: const Key('settings-license-state'),
                    style: theme.textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Expires ${_date(license.expiresAt)}'
                    '${license.offline ? ' · offline' : ''}',
                    key: const Key('settings-license-expiry'),
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: [
            TextButton(
              key: const Key('settings-change-license'),
              onPressed: () => context.go(licenseRoute),
              child: const Text('Change license'),
            ),
            TextButton(
              key: const Key('settings-deactivate'),
              onPressed: () => _deactivate(context, ref),
              child: const Text('Deactivate this PC'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _locked(BuildContext context, LicenseState license) {
    final text = license is Locked && license.reason == LicenseError.missing
        ? 'No active license.'
        : license is Locked
        ? license.text
        : LicenseError.missing.message;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(text, key: const Key('settings-license-state')),
        const SizedBox(height: 8),
        OutlinedButton(
          key: const Key('settings-activate-license'),
          onPressed: () => context.go(licenseRoute),
          child: const Text('Activate license'),
        ),
      ],
    );
  }

  Future<void> _deactivate(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: const Text(
          'Deactivating removes the license from this machine. '
          'Your drafts are kept.',
        ),
        actions: [
          TextButton(
            key: const Key('confirm-deactivate-keep'),
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Stay activated'),
          ),
          FilledButton(
            key: const Key('confirm-deactivate'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Deactivate'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final cleared = await ref
        .read(licenseControllerProvider.notifier)
        .deactivate();
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          cleared
              ? 'License deactivated.'
              : 'The license could not be removed from this machine.',
        ),
      ),
    );
  }
}

String _date(DateTime value) {
  final local = value.toLocal();
  return '${local.year}-${_two(local.month)}-${_two(local.day)}';
}

String _two(int value) => value.toString().padLeft(2, '0');

/// Where the backend values are entered and changed (SPEC-credentials).
class _CredentialsSection extends ConsumerStatefulWidget {
  const _CredentialsSection();

  @override
  ConsumerState<_CredentialsSection> createState() =>
      _CredentialsSectionState();
}

class _CredentialsSectionState extends ConsumerState<_CredentialsSection> {
  /// Bumped on a clear, which re-creates the form so the fields show the
  /// values that are live again. A save keeps the typed values and the line
  /// that says so, so it does not build a new form.
  int _generation = 0;

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(configControllerProvider);
    final line = switch (state.source) {
      ConfigSource.saved => 'Using the values saved on this machine.',
      ConfigSource.compiled => "Using the build's defaults.",
      null => 'No values yet.',
    };
    return _Section(
      title: 'Credentials',
      child: CredentialsForm(
        key: ValueKey(_generation),
        initial: state.config,
        submitLabel: 'Save',
        sourceLine: line,
        onTest: (values) => ref.read(connectionCheckProvider)(values),
        onClear: state.source == ConfigSource.saved ? _clear : null,
        onSubmit: _save,
      ),
    );
  }

  Future<String?> _save(AppConfig values) async {
    final current = ref.read(configControllerProvider).config;
    final backendChanged =
        current != null &&
        (current.supabaseUrl != values.supabaseUrl ||
            current.supabaseAnonKey != values.supabaseAnonKey);
    final written = await ref
        .read(configControllerProvider.notifier)
        .save(values);
    if (!written) {
      return 'The values could not be saved on this machine. Check the app '
          'folder and try again.';
    }
    // A post from the old backend must not look like one from the new one,
    // and the grant was minted by the old backend
    // (SPEC-credentials "A backend change while signed in").
    if (backendChanged && ref.read(licenseControllerProvider).value is Active) {
      await ref.read(licenseControllerProvider.notifier).deactivate();
    }
    return null;
  }

  Future<bool> _clear() async {
    final current = ref.read(configControllerProvider).config;
    final after = ref.read(compiledConfigProvider);
    final backendChanged =
        current != null &&
        (after == null ||
            after.supabaseUrl != current.supabaseUrl ||
            after.supabaseAnonKey != current.supabaseAnonKey);
    final cleared = await ref.read(configControllerProvider.notifier).clear();
    if (!cleared) return false;
    // The grant belongs to the backend that is no longer in use, the same
    // rule a save follows.
    if (backendChanged && ref.read(licenseControllerProvider).value is Active) {
      await ref.read(licenseControllerProvider.notifier).deactivate();
    }
    if (ref.read(configControllerProvider).needsSetup) {
      if (mounted) context.go(setupRoute);
      return true;
    }
    setState(() => _generation++);
    return true;
  }
}

class _UpdatesSection extends ConsumerWidget {
  const _UpdatesSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final version = ref.watch(appVersionProvider);
    // The controller, not appConfigProvider: clearing the last values leaves
    // this section on screen for the frame before /setup takes over.
    final config = ref.watch(configControllerProvider).config;
    final configured = config != null && config.updateManifestUrl.isNotEmpty;
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

class _DiagnosticsSection extends ConsumerWidget {
  const _DiagnosticsSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final folder = ref.watch(logsFolderProvider);
    final facts = ref.watch(diagnosticsFactsProvider);
    return _Section(
      title: 'Diagnostics',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          folder.when(
            data: (dir) => dir == null
                ? const _LogsUnavailable()
                : _logFolder(ref, context, dir),
            loading: () => const Text('Looking for the log folder…'),
            error: (error, stackTrace) => const _LogsUnavailable(),
          ),
          const SizedBox(height: 16),
          const _ExportRow(),
          const SizedBox(height: 16),
          facts.when(
            data: (data) => _localData(context, ref, data),
            loading: () => const Text('Looking at the local files…'),
            error: (error, stackTrace) =>
                const Text('The local files could not be read.'),
          ),
        ],
      ),
    );
  }

  Widget _logFolder(WidgetRef ref, BuildContext context, Directory dir) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Log file'),
        const SizedBox(height: 4),
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

  Widget _localData(
    BuildContext context,
    WidgetRef ref,
    DiagnosticsFacts facts,
  ) {
    final drafts = facts.files.where((file) => file.name == 'drafts.db');
    final broken =
        drafts.isNotEmpty && drafts.first.state == LocalFileState.unreadable;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Local data'),
        const SizedBox(height: 4),
        for (final file in facts.files)
          Text(
            file.state == LocalFileState.missing
                ? '${file.name}: not saved yet'
                : '${file.name}: ${formatBytes(file.bytes)}, ${file.state.label}',
          ),
        if (facts.brokenFiles.isNotEmpty) ...[
          const SizedBox(height: 8),
          const Text('Files kept aside'),
          for (final file in facts.brokenFiles)
            Text('${file.name} (${formatBytes(file.bytes)})'),
        ],
        if (broken) ...[
          const SizedBox(height: 8),
          const Text(
            'The saved drafts could not be opened. The old file stays on '
            'this machine.',
          ),
          const SizedBox(height: 8),
          FilledButton(
            key: const Key('settings-salvage-drafts'),
            onPressed: () => _salvage(context, ref),
            child: const Text('Keep the old draft file and start fresh'),
          ),
        ],
      ],
    );
  }

  Future<void> _salvage(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: const Text(
          'The old drafts file is kept beside the new one, so nothing is '
          'deleted. The drafts inside it are not restored.',
        ),
        actions: [
          TextButton(
            key: const Key('confirm-salvage-drafts-cancel'),
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            key: const Key('confirm-salvage-drafts'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Keep the file and start fresh'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final done = await ref.read(draftsSalvageProvider)();
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          done
              ? 'The old drafts file was kept and a new one is ready.'
              : 'The old drafts file could not be set aside.',
        ),
      ),
    );
  }
}

class _ExportRow extends ConsumerWidget {
  const _ExportRow();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(diagnosticsExportProvider);
    final savedAt = state.savedAt;
    final time = savedAt == null
        ? null
        : '${savedAt.hour.toString().padLeft(2, '0')}:'
              '${savedAt.minute.toString().padLeft(2, '0')}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Saved diagnostics'),
        const SizedBox(height: 4),
        Text(switch (state.savedName) {
          null => 'No diagnostics file saved yet.',
          final name => 'Saved $name at $time.',
        }),
        if (state.failed) ...[
          const SizedBox(height: 4),
          Text(
            'The diagnostics file could not be saved.',
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        ],
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (state.saving)
              const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            FilledButton(
              key: const Key('settings-save-diagnostics'),
              onPressed: state.saving
                  ? null
                  : () => ref.read(diagnosticsExportProvider.notifier).save(),
              child: const Text('Save diagnostics…'),
            ),
          ],
        ),
      ],
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
