import 'package:flutter/material.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.campaign_rounded, size: 64, color: scheme.primary),
            const SizedBox(height: 16),
            Text(
              'FlowPost',
              style: Theme.of(context).textTheme.headlineMedium
                  ?.copyWith(color: scheme.onSurface),
            ),
            const SizedBox(height: 8),
            Text(
              'The native desktop experience starts here.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}
