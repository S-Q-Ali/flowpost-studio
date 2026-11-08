import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/features/accounts/domain/connected_account.dart';
import 'package:flowpost_desktop/features/insights/data/insights_client.dart';
import 'package:flowpost_desktop/features/insights/domain/insights_models.dart';
import 'package:flowpost_desktop/features/insights/insights_providers.dart';
import 'package:flowpost_desktop/features/insights/presentation/insights_page.dart';

import '../../support/config_overrides.dart';

class _FakeInsightsClient implements InsightsClient {
  _FakeInsightsClient({this.data});

  final InsightsData? data;

  @override
  Future<InsightsData?> fetchInsights({
    required String platform,
    required String accountId,
    int rangeDays = 30,
  }) async => data;
}

void main() {
  const testConfig = AppConfig(
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'test-anon',
    updateManifestUrl: '',
  );

  testWidgets(
    'renders InsightsPage with no account state when accounts empty',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            seededConfig(testConfig),
            instagramAccountsProvider.overrideWithValue([]),
            facebookAccountsProvider.overrideWithValue([]),
          ],
          child: const MaterialApp(home: InsightsPage()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Insights & Analytics'), findsOneWidget);
      expect(find.text('No Instagram accounts connected'), findsOneWidget);
    },
  );

  testWidgets(
    'renders InsightsPage with metrics and activity when account present',
    (tester) async {
      final fakeClient = _FakeInsightsClient(
        data: const InsightsData(
          platform: 'instagram',
          followersCount: 1540,
          totalPosts: 85,
          growth30d: 120,
          totalPublished: 28,
          thisMonth: 14,
          thisWeek: 5,
          successRate: 98,
          timeline: [
            InsightsMetricPoint(date: '2026-11-01', value: 2),
            InsightsMetricPoint(date: '2026-11-02', value: 4),
          ],
        ),
      );

      const mockAccount = ConnectedAccount(
        platform: SocialPlatform.meta,
        serverPlatform: 'instagram',
        accountName: '@flowpost_official',
        accountId: 'ig-12345',
        status: AccountStatus.connected,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            seededConfig(testConfig),
            instagramAccountsProvider.overrideWithValue([mockAccount]),
            facebookAccountsProvider.overrideWithValue([]),
            insightsClientProvider.overrideWithValue(fakeClient),
          ],
          child: const MaterialApp(home: InsightsPage()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Insights & Analytics'), findsOneWidget);
      expect(find.text('Followers'), findsOneWidget);
      expect(find.text('1540'), findsOneWidget);
      expect(find.text('Total Posts'), findsOneWidget);
      expect(find.text('85'), findsOneWidget);
      expect(find.text('+120'), findsOneWidget);
      expect(find.text('98%'), findsOneWidget);
      expect(find.textContaining('Total published: 28'), findsOneWidget);
    },
  );
}
