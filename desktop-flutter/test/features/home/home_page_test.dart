import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/app.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/features/home/data/dashboard_models.dart';
import 'package:flowpost_desktop/features/home/data/dashboard_repository.dart';
import 'package:flowpost_desktop/features/home/home_providers.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';

import '../../support/config_overrides.dart';

class _FakeDashboardRepository implements DashboardRepository {
  _FakeDashboardRepository(this.data);

  final DashboardData data;

  @override
  Future<DashboardData> load() async => data;
}

void main() {
  const testConfig = AppConfig(
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'test-anon',
    updateManifestUrl: '',
  );

  testWidgets('app boots to the home screen with title and cards', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          seededConfig(testConfig),
          dashboardRepositoryProvider.overrideWithValue(
            _FakeDashboardRepository(
              const DashboardData(
                videos: 12,
                scheduled: 3,
                published: 9,
                accounts: 4,
                recentPosts: [
                  RecentPostItem(
                    id: 'post-1',
                    platform: PublishPlatform.youtube,
                    status: PostStatus.published,
                    title: 'Sample Video 1',
                  ),
                ],
              ),
            ),
          ),
        ],
        child: const FlowPostApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('FlowPost Studio'), findsOneWidget);
    expect(find.textContaining('native desktop experience'), findsOneWidget);
    expect(find.text('Upload & Distribute'), findsOneWidget);
    expect(find.text('Videos Uploaded'), findsOneWidget);
    expect(find.text('12'), findsOneWidget);
    expect(find.text('Scheduled'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('Published'), findsOneWidget);
    expect(find.text('9'), findsOneWidget);
    expect(find.text('Connected Accounts'), findsOneWidget);
    expect(find.text('4'), findsOneWidget);
    expect(find.text('Recent Activity'), findsOneWidget);
    expect(find.text('Sample Video 1'), findsOneWidget);
    expect(find.text('PUBLISHED'), findsOneWidget);
  });

  testWidgets(
    'the shell and Home grow with large text at the smallest window',
    (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      tester.view.physicalSize = const Size(1024, 640);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [seededConfig(testConfig)],
          child: const FlowPostApp(),
        ),
      );
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.text('Home'), findsOneWidget);
      expect(find.text('Settings'), findsOneWidget);
      expect(find.text('FlowPost Studio'), findsOneWidget);
    },
  );
}
