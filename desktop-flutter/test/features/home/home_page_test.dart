import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/app.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';

void main() {
  const testConfig = AppConfig(
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'test-anon',
    updateManifestUrl: '',
  );

  testWidgets('app boots to the placeholder home screen', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [appConfigProvider.overrideWithValue(testConfig)],
        child: const FlowPostApp(),
      ),
    );
    expect(find.text('FlowPost Studio'), findsOneWidget);
    expect(find.textContaining('native desktop experience'), findsOneWidget);
  });

  testWidgets('bad config shows the readable error screen', (tester) async {
    await tester.pumpWidget(
      const ConfigErrorApp(
        message: 'SUPABASE_URL and SUPABASE_ANON_KEY are required',
      ),
    );
    expect(find.text('FlowPost could not start'), findsOneWidget);
    expect(find.textContaining('SUPABASE_URL'), findsOneWidget);
  });
}
