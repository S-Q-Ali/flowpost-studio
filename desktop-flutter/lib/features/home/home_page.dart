import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/providers/app_providers.dart';
import '../../core/update/app_version.dart';
import '../../core/update/update_banner.dart';
import '../../core/update/update_checker.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  UpdateResult? _update;
  bool _checking = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final config = ref.read(appConfigProvider);
    if (config.updateManifestUrl.isEmpty) return;
    final version = await ref.read(appVersionProvider.future);
    if (!mounted || version == null) return;
    setState(() => _checking = true);

    final result = await checkForUpdate(
      manifestUrl: Uri.parse(config.updateManifestUrl),
      currentVersion: version.version,
    );
    if (!mounted) return;
    setState(() {
      _update = result;
      _checking = false;
    });
  }

  Future<void> _download() async {
    final url = _update?.downloadUrl;
    if (url == null) return;
    final opened = await launchUrl(url, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the download link.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final update = _update;
    final version = ref.watch(appVersionProvider).value;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.campaign_rounded, size: 64, color: scheme.primary),
          const SizedBox(height: 16),
          Text(
            'FlowPost Studio',
            style: Theme.of(context).textTheme.headlineMedium
                ?.copyWith(color: scheme.onSurface),
          ),
          const SizedBox(height: 8),
          Text(
            'The native desktop experience starts here.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 12),
          if (version != null)
            Text(
              'Version ${version.version}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          if (_checking)
            const Padding(
              padding: EdgeInsets.only(top: 16),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else if (update != null && update.hasUpdate)
            UpdateBanner(
              latestVersion: update.latestVersion!,
              onDownload: _download,
            )
          else if (update?.error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                update!.error!,
                style: TextStyle(color: scheme.error),
              ),
            ),
        ],
      ),
    );
  }
}
