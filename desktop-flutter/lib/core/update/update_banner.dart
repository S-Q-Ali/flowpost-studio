import 'package:flutter/material.dart';

class UpdateBanner extends StatelessWidget {
  const UpdateBanner({
    super.key,
    required this.latestVersion,
    required this.onDownload,
  });

  final String latestVersion;
  final VoidCallback onDownload;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(top: 24),
      child: ListTile(
        leading: const Icon(Icons.system_update_alt_rounded),
        title: Text('Update available: v$latestVersion'),
        trailing: TextButton(
          onPressed: onDownload,
          child: const Text('Download'),
        ),
      ),
    );
  }
}
