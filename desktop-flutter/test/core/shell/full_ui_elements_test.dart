import 'dart:io';

import 'package:flowpost_desktop/app.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/config/config_controller.dart';
import 'package:flowpost_desktop/core/diagnostics/diagnostics_report.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/core/theme/theme_controller.dart';
import 'package:flowpost_desktop/core/update/app_version.dart';
import 'package:flowpost_desktop/features/accounts/accounts_providers.dart';
import 'package:flowpost_desktop/features/accounts/connect_controller.dart';
import 'package:flowpost_desktop/features/accounts/domain/connected_account.dart';
import 'package:flowpost_desktop/features/home/data/dashboard_models.dart';
import 'package:flowpost_desktop/features/home/home_providers.dart';
import 'package:flowpost_desktop/features/insights/insights_providers.dart';
import 'package:flowpost_desktop/features/license/license_providers.dart';
import 'package:flowpost_desktop/features/offline/offline_providers.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_providers.dart';
import 'package:flowpost_desktop/features/settings/settings_providers.dart';
import 'package:flowpost_desktop/features/storage/storage_providers.dart';
import 'package:flowpost_desktop/features/workflows/domain/workflow.dart';
import 'package:flowpost_desktop/features/workflows/workflows_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/config_overrides.dart';
import '../../support/fake_accounts.dart';
import '../../support/fake_connect.dart';
import '../../support/fake_credentials_store.dart';
import '../../support/fake_drafts.dart';
import '../../support/fake_license.dart';
import '../../support/fake_posts_cache.dart';
import '../../support/fake_scheduled_posts.dart';
import '../../support/fake_theme_store.dart';
import '../../support/fake_time_zone.dart';

const _config = AppConfig(
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-anon-key',
  updateManifestUrl: '',
);

const _version = AppVersionInfo(version: '1.0.0', buildNumber: '1');

final _testWorkflow = WorkflowItem(
  id: 'wf-1',
  name: 'Daily Shorts Automation',
  isActive: true,
  runIntervalHours: 6,
  platforms: const [PublishPlatform.youtube, PublishPlatform.instagram],
  latestRunFinishedAt: DateTime.utc(2026, 11, 8, 12),
  latestRunStatus: 'success',
);

final _testDashboard = DashboardData(
  videos: 5,
  scheduled: 5,
  published: 12,
  accounts: 4,
  recentPosts: [
    RecentPostItem(
      id: 'post-1',
      title: 'Launch Highlight',
      platform: PublishPlatform.youtube,
      scheduledAt: DateTime.now().subtract(const Duration(hours: 2)),
      status: PostStatus.published,
    ),
  ],
);

void main() {
  testWidgets(
    'full UI verification: all 9 navigation items and screens interact cleanly',
    (tester) async {
      tester.view.physicalSize = const Size(1280, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final container = ProviderContainer(
        overrides: [
          seededConfig(_config),
          appVersionProvider.overrideWith((ref) async => _version),
          credentialsStoreProvider.overrideWithValue(FakeCredentialsStore()),
          postsCacheProvider.overrideWithValue(FakePostsCache()),
          draftsRepositoryProvider.overrideWithValue(FakeDraftsRepository()),
          timeZoneProvider.overrideWithValue(fixedZone()),
          licenseServiceProvider.overrideWithValue(
            licenseServiceOver(MemoryLicenseStore()),
          ),
          themeStoreProvider.overrideWithValue(FakeThemeStore()),
          themeControllerProvider.overrideWith(
            () => ThemeController(initial: ThemeMode.dark),
          ),
          accountsRepositoryProvider.overrideWith(
            (ref) => FakeAccountsRepository([
              const ConnectedAccount(
                platform: SocialPlatform.youtube,
                accountName: 'FlowPost Channel',
                status: AccountStatus.connected,
              ),
            ]),
          ),
          connectGatewayProvider.overrideWithValue(FakeConnectGateway()),
          connectCallbackProvider.overrideWithValue(
            ValueNotifier<String?>(null),
          ),
          urlLauncherProvider.overrideWithValue((uri) async => false),
          dashboardDataProvider.overrideWith((ref) async => _testDashboard),
          workflowsListProvider.overrideWith((ref) async => [_testWorkflow]),
          driveAccountsProvider.overrideWithValue([]),
          megaAccountsProvider.overrideWithValue([]),
          instagramAccountsProvider.overrideWithValue([]),
          facebookAccountsProvider.overrideWithValue([]),
          scheduledPostsRepositoryProvider.overrideWithValue(
            FakeScheduledPostsRepository()..rangePosts = [],
          ),
          connectionCheckProvider.overrideWithValue(
            (config) async => 'The server answered.',
          ),
          logsFolderProvider.overrideWith((ref) async => Directory.systemTemp),
          openFolderProvider.overrideWithValue((folder) async => true),
          diagnosticsFactsProvider.overrideWith(
            (ref) async => DiagnosticsFacts(
              generatedAt: DateTime.utc(2026, 11, 8),
              version: _version,
              osVersion: 'Windows 10.0.26300',
              locale: 'en-US',
              zoneName: 'Asia/Karachi',
              utcOffset: const Duration(hours: 5),
              licensed: true,
              files: const [],
              brokenFiles: const [],
              logLines: const ['log line'],
              logsRead: true,
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const FlowPostApp(initialDeepLink: '/'),
        ),
      );
      await tester.pumpAndSettle();

      // 1. Verify all 9 Navigation Destinations exist in the NavigationRail
      expect(find.byType(NavigationRail), findsOneWidget);
      expect(find.text('Home'), findsOneWidget);
      expect(find.text('Accounts'), findsOneWidget);
      expect(find.text('Upload'), findsOneWidget);
      expect(find.text('Workflows'), findsOneWidget);
      expect(find.text('Queue'), findsOneWidget);
      expect(find.text('Calendar'), findsOneWidget);
      expect(find.text('Storage'), findsOneWidget);
      expect(find.text('Insights'), findsOneWidget);
      expect(find.text('Settings'), findsOneWidget);

      // 2. Verify all navigation rail icons are rendered
      expect(find.byIcon(Icons.home_rounded), findsOneWidget);
      expect(find.byIcon(Icons.account_circle_outlined), findsOneWidget);
      expect(find.byIcon(Icons.cloud_upload_outlined), findsOneWidget);
      expect(find.byIcon(Icons.account_tree_outlined), findsOneWidget);
      expect(find.byIcon(Icons.list_alt_outlined), findsOneWidget);
      expect(find.byIcon(Icons.calendar_month_outlined), findsOneWidget);
      expect(find.byIcon(Icons.folder_shared_outlined), findsOneWidget);
      expect(find.byIcon(Icons.insights_outlined), findsOneWidget);
      expect(find.byIcon(Icons.settings_outlined), findsOneWidget);

      // 3. Verify Home Screen Elements
      expect(find.text('FlowPost Studio'), findsWidgets);
      expect(find.text('Videos Uploaded'), findsOneWidget);
      expect(find.text('Scheduled'), findsOneWidget);
      expect(find.text('Published'), findsOneWidget);
      expect(find.text('Connected Accounts'), findsWidgets);
      expect(find.text('Upload & Distribute'), findsOneWidget);
      expect(find.text('Recent Activity'), findsOneWidget);

      // 4. Navigate to Workflows Screen
      await tester.tap(find.text('Workflows'));
      await tester.pumpAndSettle();
      expect(find.text('Workflows'), findsWidgets);
      expect(find.text('Daily Shorts Automation'), findsOneWidget);
      expect(find.text('Every 6h · 1 video(s)/run'), findsOneWidget);
      expect(find.text('Run Now'), findsOneWidget);
      expect(find.byType(Switch), findsOneWidget);
      expect(find.byIcon(Icons.account_tree_rounded), findsOneWidget);

      // 5. Navigate to Storage Screen
      await tester.tap(find.text('Storage'));
      await tester.pumpAndSettle();
      expect(find.text('Storage Manager'), findsOneWidget);
      expect(find.text('Google Drive'), findsOneWidget);
      expect(find.text('MEGA'), findsOneWidget);
      expect(find.byIcon(Icons.folder_shared_rounded), findsOneWidget);

      // 6. Navigate to Insights Screen
      await tester.tap(find.text('Insights'));
      await tester.pumpAndSettle();
      expect(find.text('Insights & Analytics'), findsOneWidget);
      expect(find.text('Instagram'), findsOneWidget);
      expect(find.text('Facebook'), findsOneWidget);
      expect(find.byIcon(Icons.insights_rounded), findsOneWidget);

      // 7. Navigate to Accounts Screen
      await tester.tap(find.text('Accounts'));
      await tester.pumpAndSettle();
      expect(find.text('Accounts'), findsWidgets);
      expect(find.text('FlowPost Channel'), findsOneWidget);
      expect(find.byIcon(Icons.account_circle), findsOneWidget);

      // 8. Navigate to Queue Screen
      await tester.tap(find.text('Queue'));
      await tester.pumpAndSettle();
      expect(find.text('Queue'), findsWidgets);
      expect(find.byIcon(Icons.list_alt_rounded), findsWidgets);

      // 9. Navigate to Calendar Screen
      await tester.tap(find.text('Calendar'));
      await tester.pumpAndSettle();
      expect(find.text('Calendar'), findsWidgets);
      expect(find.byIcon(Icons.calendar_month_rounded), findsWidgets);

      // 10. Navigate to Settings Screen
      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle();
      expect(find.text('Settings'), findsWidgets);
      expect(find.text('License'), findsOneWidget);
      expect(find.text('Credentials'), findsOneWidget);
      expect(find.text('Appearance'), findsOneWidget);
      expect(find.text('Test connection'), findsOneWidget);
      expect(find.byIcon(Icons.settings_rounded), findsOneWidget);

      // 11. Navigate back to Home Screen
      await tester.tap(find.text('Home'));
      await tester.pumpAndSettle();
      expect(find.text('Scheduled'), findsOneWidget);
      expect(find.byIcon(Icons.home_rounded), findsOneWidget);
    },
  );
}
