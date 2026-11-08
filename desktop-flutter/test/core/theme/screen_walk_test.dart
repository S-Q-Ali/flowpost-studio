// Every screen the app has, painted in each look and at the largest text it
// promises to hold.
//
// The per-screen tests each hold one look and one widget tree; the two things
// that cross those boundaries are a colour token that lands on only one screen
// and a row that cannot grow. Both show up here: a wrong look is caught by the
// theme read, and an overflow is caught as an exception on the route named in
// the failure.
//
// Run with: flutter test test/core/theme/screen_walk_test.dart
import 'dart:io';

import 'package:flowpost_desktop/app.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/config/config_controller.dart';
import 'package:flowpost_desktop/core/diagnostics/diagnostics_report.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/core/theme/app_theme.dart';
import 'package:flowpost_desktop/core/theme/theme_controller.dart';
import 'package:flowpost_desktop/core/update/app_version.dart';
import 'package:flowpost_desktop/core/update/update_checker.dart';
import 'package:flowpost_desktop/features/accounts/accounts_providers.dart';
import 'package:flowpost_desktop/features/accounts/connect_controller.dart';
import 'package:flowpost_desktop/features/accounts/domain/connected_account.dart';
import 'package:flowpost_desktop/features/accounts/presentation/accounts_page.dart';
import 'package:flowpost_desktop/features/home/home_page.dart';
import 'package:flowpost_desktop/features/license/license_providers.dart';
import 'package:flowpost_desktop/features/license/presentation/license_gate_page.dart';
import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flowpost_desktop/features/media/presentation/media_page.dart';
import 'package:flowpost_desktop/features/offline/offline_providers.dart';
import 'package:flowpost_desktop/features/publishing/data/publish_client.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/publishing/presentation/publish_page.dart';
import 'package:flowpost_desktop/features/publishing/publishing_providers.dart';
import 'package:flowpost_desktop/features/scheduling/data/scheduled_posts_repository.dart';
import 'package:flowpost_desktop/features/scheduling/presentation/calendar_page.dart';
import 'package:flowpost_desktop/features/scheduling/presentation/queue_page.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_controller.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_providers.dart';
import 'package:flowpost_desktop/features/settings/presentation/settings_page.dart';
import 'package:flowpost_desktop/features/settings/settings_providers.dart';
import 'package:flowpost_desktop/features/setup/presentation/setup_wizard_page.dart';
import 'package:flowpost_desktop/features/setup/setup_controller.dart';
import 'package:flowpost_desktop/features/storage/presentation/storage_page.dart';
import 'package:flowpost_desktop/features/storage/storage_providers.dart';
import 'package:flowpost_desktop/features/insights/presentation/insights_page.dart';
import 'package:flowpost_desktop/features/insights/insights_providers.dart';
import 'package:flowpost_desktop/features/workflows/data/workflows_repository.dart';
import 'package:flowpost_desktop/features/workflows/domain/workflow.dart';
import 'package:flowpost_desktop/features/workflows/presentation/workflows_page.dart';
import 'package:flowpost_desktop/features/workflows/workflows_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
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
import '../../support/fake_wizard_resume_store.dart';

const _config = AppConfig(
  supabaseUrl: 'https://walk.supabase.co',
  supabaseAnonKey: 'walk-anon-key',
  // No manifest: the walk never asks the network what the next build is.
  updateManifestUrl: '',
);

const _version = AppVersionInfo(version: '1.0.0', buildNumber: '1');

/// The smallest window the app opens in, so every screen is given the least
/// room it will ever have.
const _window = Size(1024, 640);

const _instagram = PublishTarget(
  platform: PublishPlatform.instagram,
  accountId: 'ig-1',
  accountName: 'FlowPost Reels',
);

const _youtube = PublishTarget(
  platform: PublishPlatform.youtube,
  accountId: 'yt-1',
  accountName: 'FlowPost Channel',
);

const _connected = [
  ConnectedAccount(
    platform: SocialPlatform.youtube,
    accountName: 'FlowPost Channel',
    status: AccountStatus.connected,
    accountId: 'UC-1',
    serverPlatform: 'youtube',
  ),
  ConnectedAccount(
    platform: SocialPlatform.meta,
    accountName: 'flowpost.studio',
    status: AccountStatus.expired,
    accountId: 'ig-1',
    serverPlatform: 'instagram',
  ),
];

final _facts = DiagnosticsFacts(
  generatedAt: DateTime.utc(2026, 11, 2, 9, 12),
  version: _version,
  osVersion: 'Windows 11 (10.0.26300)',
  locale: 'en-US',
  zoneName: 'Europe/Berlin',
  utcOffset: const Duration(hours: 1),
  licensed: false,
  files: [
    LocalFileFact(
      name: 'cache.db',
      state: LocalFileState.ok,
      bytes: 4096,
      modifiedAt: DateTime.utc(2026, 11, 2, 8, 40),
    ),
  ],
  brokenFiles: const [],
  logLines: const ['a line'],
  logsRead: true,
);

/// A screen the walk opens: where it lives, the heading its body paints, and a
/// widget that only exists once that body holds its data.
class _Screen {
  const _Screen({
    required this.route,
    required this.heading,
    this.page,
    this.body,
    this.neverIdle = false,
    this.extra = _noExtra,
  });

  final String route;
  final String heading;

  /// Null for a screen the app builds before it has a page to name.
  final Type? page;

  /// Null for the screens that hold no data, because they are the app waiting
  /// for some.
  final Finder? body;

  /// A screen that keeps a spinner turning never goes idle, so the walk gives
  /// it frames instead of waiting for a settle that cannot come.
  final bool neverIdle;

  final List<Override> Function() extra;

  String get label => '$route in ${page ?? 'the starting screen'}';
}

List<Override> _noExtra() => const [];

/// The app on a machine that already has its backend values, in the look the
/// walk names.
List<Override> _base(ThemeMode mode) => [
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
  themeControllerProvider.overrideWith(() => ThemeController(initial: mode)),
];

List<Override> _accounts() => [
  accountsRepositoryProvider.overrideWith(
    (ref) => FakeAccountsRepository(_connected),
  ),
  connectGatewayProvider.overrideWithValue(FakeConnectGateway()),
  connectCallbackProvider.overrideWithValue(ValueNotifier<String?>(null)),
  urlLauncherProvider.overrideWithValue((uri) async => false),
];

List<Override> _publish() => [
  sessionTokenProvider.overrideWithValue('demo-session'),
  publishTargetsProvider.overrideWithValue(
    const AsyncData([_instagram, _youtube]),
  ),
  publishedMediaProvider.overrideWithValue(
    const PublishedMedia(
      videoId: 'video-1',
      fileName: 'launch-teaser.mp4',
      size: 44040192,
      kind: MediaKind.video,
    ),
  ),
  postsRepositoryProvider.overrideWithValue(_FakeRepository()),
  publishClientProvider.overrideWithValue(_FakeClient()),
  publishPollPolicyProvider.overrideWithValue(
    const PublishPollPolicy(interval: Duration.zero, attempts: 1),
  ),
];

List<Override> _queue() => [
  scheduledPostsRepositoryProvider.overrideWithValue(
    FakeScheduledPostsRepository()
      ..pages[0] = ScheduledPostsPage(
        posts: [
          post(
            id: 'q-1',
            scheduledAt: DateTime.utc(2026, 11, 3, 8, 30),
            videoTitle: 'Behind the scenes: the new drop',
            caption: 'A first look at what ships next week.',
          ),
          post(
            id: 'q-2',
            platform: PublishPlatform.youtube,
            status: PostStatus.published,
            scheduledAt: DateTime.utc(2026, 11, 1, 15),
            publishedAt: DateTime.utc(2026, 11, 1, 15, 2),
            videoTitle: 'How we ship a feature in one week',
            caption: 'The whole pipeline, start to finish.',
          ),
          post(
            id: 'q-3',
            platform: PublishPlatform.tiktok,
            status: PostStatus.failed,
            scheduledAt: DateTime.utc(2026, 10, 30, 17),
            videoTitle: 'The 10 second edit',
            caption: 'Cut, caption, schedule, done.',
          ),
        ],
        hasMore: false,
      ),
  ),
];

List<Override> _calendar() => [
  scheduledPostsRepositoryProvider.overrideWithValue(
    FakeScheduledPostsRepository()
      ..rangePosts = [
        post(
          id: 'cal-1',
          scheduledAt: DateTime.utc(2026, 11, 2, 8),
          videoTitle: 'Launch week recap',
        ),
        post(
          id: 'cal-2',
          platform: PublishPlatform.youtube,
          scheduledAt: DateTime.utc(2026, 11, 6, 13),
          videoTitle: 'One week, one feature',
        ),
        post(
          id: 'cal-3',
          platform: PublishPlatform.facebook,
          scheduledAt: DateTime.utc(2026, 11, 27, 11),
          videoTitle: 'Captions that convert',
        ),
      ],
  ),
  todayProvider.overrideWithValue(DateTime(2026, 11, 2)),
];

/// Settings reads the machine: the log folder, the snapshot and the update
/// feed all answer from here instead.
List<Override> _settings() => [
  connectionCheckProvider.overrideWithValue(
    (config) async => 'The server answered.',
  ),
  diagnosticsFactsProvider.overrideWith((ref) async => _facts),
  exportFolderPickerProvider.overrideWithValue(() async => null),
  logsFolderProvider.overrideWith((ref) async => Directory.systemTemp),
  openFolderProvider.overrideWithValue((folder) async => true),
  updateFetcherProvider.overrideWithValue(
    ({required Uri manifestUrl, required String currentVersion}) async =>
        UpdateResult(
          currentVersion: currentVersion,
          latestVersion: currentVersion,
        ),
  ),
];

List<Override> _setup() => [
  wizardResumeStoreProvider.overrideWithValue(FakeWizardResumeStore()),
  setupApiProvider.overrideWithValue(null),
  connectionCheckProvider.overrideWithValue(
    (config) async => 'The server answered.',
  ),
  urlLauncherProvider.overrideWithValue((uri) async => false),
];

class _FakeScreenWalkWorkflowsRepository implements WorkflowsRepository {
  @override
  Future<List<WorkflowItem>> loadWorkflows() async => const [];
  @override
  Future<bool> toggleWorkflow(String id, bool isActive) async => true;
  @override
  Future<bool> triggerWorkflow(String id) async => true;
}

List<Override> _workflows() => [
  workflowsRepositoryProvider.overrideWithValue(
    _FakeScreenWalkWorkflowsRepository(),
  ),
];

List<Override> _storage() => [
  driveAccountsProvider.overrideWithValue([]),
  megaAccountsProvider.overrideWithValue([]),
];

List<Override> _insights() => [
  instagramAccountsProvider.overrideWithValue([]),
  facebookAccountsProvider.overrideWithValue([]),
];

final _screens = <_Screen>[
  _Screen(
    route: '/',
    page: HomePage,
    heading: 'FlowPost Studio',
    body: find.text('Version 1.0.0'),
  ),
  _Screen(
    route: '/accounts',
    page: AccountsPage,
    heading: 'Accounts',
    body: find.byKey(const Key('account-youtube-UC-1')),
    extra: _accounts,
  ),
  _Screen(
    route: '/upload',
    page: MediaPage,
    heading: 'Choose a video or image',
    body: find.text('Choose file'),
  ),
  _Screen(
    route: '/publish',
    page: PublishPage,
    heading: 'Publish',
    body: find.byKey(Key('target-${_instagram.id}')),
    extra: _publish,
  ),
  _Screen(
    route: '/workflows',
    page: WorkflowsPage,
    heading: 'Workflows',
    body: find.text('No workflows found'),
    extra: _workflows,
  ),
  _Screen(
    route: '/queue',
    page: QueuePage,
    heading: 'Queue',
    body: find.byKey(const Key('queue-post-q-1')),
    extra: _queue,
  ),
  _Screen(
    route: '/calendar',
    page: CalendarPage,
    heading: 'Calendar',
    body: find.byKey(const Key('calendar-day-2026-11-02')),
    extra: _calendar,
  ),
  _Screen(
    route: '/storage',
    page: StoragePage,
    heading: 'Storage Manager',
    body: find.text('No Google Drive account connected'),
    extra: _storage,
  ),
  _Screen(
    route: '/insights',
    page: InsightsPage,
    heading: 'Insights & Analytics',
    body: find.text('No Instagram accounts connected'),
    extra: _insights,
  ),
  _Screen(
    route: '/settings',
    page: SettingsPage,
    heading: 'Settings',
    body: find.byKey(const Key('settings-activate-license')),
    extra: _settings,
  ),
  _Screen(
    route: '/setup',
    page: SetupWizardPage,
    heading: 'Set up FlowPost',
    body: find.byKey(const Key('setup-track-end-user')),
    extra: _setup,
  ),
  _Screen(
    route: '/license',
    page: LicenseGatePage,
    heading: 'Unlock FlowPost',
    body: find.byKey(const Key('license-key')),
  ),
  const _Screen(
    route: '/starting',
    heading: 'Starting FlowPost…',
    neverIdle: true,
  ),
];

Future<void> _paint(WidgetTester tester, _Screen screen, ThemeMode mode) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [..._base(mode), ...screen.extra()],
      child: FlowPostApp(initialDeepLink: screen.route),
    ),
  );
  if (screen.neverIdle) {
    for (var frame = 0; frame < 4; frame++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  } else {
    await tester.pumpAndSettle();
  }
  expect(tester.takeException(), isNull, reason: '${screen.label} threw');

  final heading = screen.page == null
      ? find.text(screen.heading)
      : find.descendant(
          of: find.byType(screen.page!),
          matching: find.text(screen.heading),
        );
  expect(
    heading,
    findsOneWidget,
    reason: '${screen.label} never painted its heading',
  );
  final expected = mode == ThemeMode.dark ? Brightness.dark : Brightness.light;
  final theme = Theme.of(tester.element(heading));
  expect(
    theme.brightness,
    expected,
    reason: '${screen.label} is not in the ${mode.name} look',
  );
  expect(
    theme.scaffoldBackgroundColor,
    mode == ThemeMode.dark
        ? FlowPostDarkColors.background
        : FlowPostColors.background,
    reason: '${screen.label} paints the other palette',
  );
  if (screen.body != null) {
    expect(
      screen.body,
      findsOneWidget,
      reason: '${screen.label} shows no content',
    );
  }
}

void main() {
  // One test per screen, look and text size, so a run names every screen that
  // cannot hold rather than stopping at the first.
  for (final mode in [ThemeMode.light, ThemeMode.dark]) {
    for (final scale in [1.0, 2.0]) {
      for (final screen in _screens) {
        testWidgets('${screen.route} paints in ${mode.name} at '
            '${(scale * 100).round()}% text', (tester) async {
          tester.platformDispatcher.textScaleFactorTestValue = scale;
          addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
          tester.view.physicalSize = _window;
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.reset);

          await _paint(tester, screen, mode);
        });
      }
    }
  }
}

/// A repository that answers the two reads the Publish screen makes.
class _FakeRepository implements PostsRepository {
  @override
  Future<String> insert(PostDraft draft) async => 'post-1';

  @override
  Future<PostRow?> read(String postId) async => null;

  @override
  Future<bool> rescheduleFailed(String postId, DateTime scheduledAt) async =>
      false;
}

class _FakeClient implements PublishApi {
  @override
  Future<PublishResult> publish({
    required PublishTarget target,
    required String postId,
  }) async => const PublishResult(platformId: 'walk');
}
