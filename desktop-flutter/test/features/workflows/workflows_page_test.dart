import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/workflows/data/workflows_repository.dart';
import 'package:flowpost_desktop/features/workflows/domain/workflow.dart';
import 'package:flowpost_desktop/features/workflows/presentation/workflows_page.dart';
import 'package:flowpost_desktop/features/workflows/workflows_providers.dart';

import '../../support/config_overrides.dart';

class _FakeWorkflowsRepository implements WorkflowsRepository {
  _FakeWorkflowsRepository({required this.workflows});

  final List<WorkflowItem> workflows;
  bool toggled = false;
  bool triggered = false;

  @override
  Future<List<WorkflowItem>> loadWorkflows() async => workflows;

  @override
  Future<bool> toggleWorkflow(String id, bool isActive) async {
    toggled = true;
    return true;
  }

  @override
  Future<bool> triggerWorkflow(String id) async {
    triggered = true;
    return true;
  }
}

void main() {
  const testConfig = AppConfig(
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'test-anon',
    updateManifestUrl: '',
  );

  testWidgets('renders empty workflows state', (tester) async {
    final fakeRepo = _FakeWorkflowsRepository(workflows: []);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          seededConfig(testConfig),
          workflowsRepositoryProvider.overrideWithValue(fakeRepo),
        ],
        child: const MaterialApp(home: Scaffold(body: WorkflowsPage())),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Workflows'), findsOneWidget);
    expect(find.text('No workflows found'), findsOneWidget);
  });

  testWidgets('renders workflow cards and triggers run now', (tester) async {
    final fakeRepo = _FakeWorkflowsRepository(
      workflows: const [
        WorkflowItem(
          id: 'wf-1',
          name: 'Daily Shorts Automation',
          isActive: true,
          sheetId: 'sheet-123',
          platforms: [PublishPlatform.youtube, PublishPlatform.instagram],
          runIntervalHours: 2,
          videosPerRun: 1,
          totalPosted: 42,
          latestRunStatus: 'success',
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          seededConfig(testConfig),
          workflowsRepositoryProvider.overrideWithValue(fakeRepo),
        ],
        child: const MaterialApp(home: Scaffold(body: WorkflowsPage())),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Daily Shorts Automation'), findsOneWidget);
    expect(find.text('YouTube'), findsOneWidget);
    expect(find.text('Instagram'), findsOneWidget);
    expect(find.text('Source: Google Sheet'), findsOneWidget);
    expect(find.text('Total posted: 42'), findsOneWidget);
    expect(find.text('SUCCESS'), findsOneWidget);

    final runNowBtn = find.text('Run Now');
    expect(runNowBtn, findsOneWidget);
    await tester.tap(runNowBtn);
    await tester.pumpAndSettle();

    expect(fakeRepo.triggered, isTrue);
  });
}
