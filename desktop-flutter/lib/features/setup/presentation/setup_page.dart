import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/app_config.dart';
import '../../../core/config/config_controller.dart';
import '../../../core/router/app_router.dart';
import '../../settings/presentation/credentials_form.dart';

/// The first run of a build with no usable values (SPEC-credentials).
///
/// It sits outside the app shell: there is nothing to navigate until the app
/// knows which backend it talks to.
class SetupPage extends ConsumerWidget {
  const SetupPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final problem = ref.watch(configControllerProvider).problem;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Set up FlowPost', style: theme.textTheme.headlineSmall),
                  const SizedBox(height: 8),
                  Text(
                    'Enter the Supabase project this app should talk to. You '
                    'can change these later in Settings.',
                    style: theme.textTheme.bodyMedium,
                  ),
                  if (problem != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      problem,
                      key: const Key('setup-problem'),
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.error,
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  CredentialsForm(
                    key: const Key('setup-form'),
                    initial: null,
                    submitLabel: 'Save and continue',
                    onSubmit: (config) => _save(context, ref, config),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<String?> _save(
    BuildContext context,
    WidgetRef ref,
    AppConfig config,
  ) async {
    final saved = await ref
        .read(configControllerProvider.notifier)
        .save(config);
    if (!saved) {
      return 'The values could not be saved on this machine. Check the app '
          'folder and try again.';
    }
    if (context.mounted) context.go(homeRoute);
    return null;
  }
}
