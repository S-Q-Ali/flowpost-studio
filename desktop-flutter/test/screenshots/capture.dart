// Captures the app's screens as PNGs for the README and the landing page.
//
// This is not part of `flutter test` (the name has no _test suffix). Run it by
// hand from desktop-flutter, then turn the PNGs into the committed WebPs:
//
//   flutter test test/screenshots/capture.dart
//   for f in build/screenshots/*.png; do
//     ffmpeg -y -i "$f" -vf scale=1440:-1 "docs/screenshots/$(basename "${f%.png}").webp"
//   done
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flowpost_desktop/app.dart';
import 'package:flowpost_desktop/core/config/app_config.dart';
import 'package:flowpost_desktop/core/config/config_controller.dart';
import 'package:flowpost_desktop/core/diagnostics/diagnostics_report.dart';
import 'package:flowpost_desktop/core/providers/app_providers.dart';
import 'package:flowpost_desktop/core/update/app_version.dart';
import 'package:flowpost_desktop/core/update/update_checker.dart';
import 'package:flowpost_desktop/features/license/data/license_models.dart';
import 'package:flowpost_desktop/features/license/license_controller.dart';
import 'package:flowpost_desktop/features/license/license_providers.dart';
import 'package:flowpost_desktop/features/media/domain/media_job.dart';
import 'package:flowpost_desktop/features/media/domain/media_validation.dart';
import 'package:flowpost_desktop/features/media/media_providers.dart';
import 'package:flowpost_desktop/features/offline/offline_providers.dart';
import 'package:flowpost_desktop/features/publishing/data/posts_repository.dart';
import 'package:flowpost_desktop/features/publishing/data/publish_client.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_target.dart';
import 'package:flowpost_desktop/features/publishing/publishing_providers.dart';
import 'package:flowpost_desktop/features/scheduling/data/scheduled_posts_repository.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_controller.dart';
import 'package:flowpost_desktop/features/scheduling/scheduling_providers.dart';
import 'package:flowpost_desktop/features/settings/settings_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

import '../support/config_overrides.dart';
import '../support/fake_credentials_store.dart';
import '../support/fake_drafts.dart';
import '../support/fake_license.dart';
import '../support/fake_posts_cache.dart';
import '../support/fake_scheduled_posts.dart';
import '../support/fake_time_zone.dart';

const AppConfig _config = AppConfig(
  supabaseUrl: 'https://demo.supabase.co',
  supabaseAnonKey: 'demo-anon-key',
  updateManifestUrl: 'https://demo.supabase.co/update.json',
);

const AppVersionInfo _version = AppVersionInfo(
  version: '1.0.0',
  buildNumber: '1',
);

const _window = Size(1440, 900);
const _root = Key('screenshot-root');

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

LicenseRecord _grant() => LicenseRecord(
  token: 'demo-token',
  expiresAt: DateTime.utc(2027, 10, 31),
  key: 'flowpost-license-0001',
);

final _facts = DiagnosticsFacts(
  generatedAt: DateTime.utc(2026, 10, 31, 9, 12),
  version: _version,
  osVersion: 'Windows 11 (10.0.26300)',
  locale: 'en-US',
  zoneName: 'Europe/Berlin',
  utcOffset: const Duration(hours: 1),
  licensed: true,
  files: [
    LocalFileFact(
      name: 'cache.db',
      state: LocalFileState.ok,
      bytes: 421888,
      modifiedAt: DateTime.utc(2026, 10, 31, 8, 40),
    ),
    LocalFileFact(
      name: 'drafts.db',
      state: LocalFileState.ok,
      bytes: 16384,
      modifiedAt: DateTime.utc(2026, 10, 31, 8, 58),
    ),
  ],
  brokenFiles: const [],
  logLines: const ['a line'],
  logsRead: true,
);

/// The app as it runs on a licensed machine, with the backend values seeded.
List<Override> _app({LicenseRecord? license, String? token}) => [
  seededConfig(_config),
  appVersionProvider.overrideWith((ref) async => _version),
  credentialsStoreProvider.overrideWithValue(FakeCredentialsStore()),
  postsCacheProvider.overrideWithValue(FakePostsCache()),
  draftsRepositoryProvider.overrideWithValue(FakeDraftsRepository()),
  timeZoneProvider.overrideWithValue(fixedZone()),
  licenseServiceProvider.overrideWithValue(
    licenseServiceOver(MemoryLicenseStore(license)),
  ),
  if (token != null) sessionTokenProvider.overrideWithValue(token),
];

/// Settings shows a fresh activation, without the offline note a restore
/// from the vault carries.
class _ActiveLicense extends LicenseController {
  @override
  Future<LicenseState> build() async =>
      Active(expiresAt: DateTime.utc(2027, 10, 31));
}

/// Upload stands on a video that is being normalized.
class _SeededMedia extends MediaController {
  _SeededMedia(this.seeded);

  final MediaState seeded;

  @override
  MediaState build() => seeded;
}

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
  }) async => const PublishResult(platformId: 'demo');
}

Future<void> _loadFonts() async {
  final windows = Directory(r'C:\Windows\Fonts');
  final flutterRoot = Platform.environment['FLUTTER_ROOT'];
  final cache = flutterRoot != null
      ? Directory(p.join(flutterRoot, 'bin', 'cache'))
      : File(Platform.resolvedExecutable).parent.parent.parent.parent.parent;
  final material = Directory(p.join(cache.path, 'artifacts', 'material_fonts'));

  // The tests render with the Android default family, so Segoe UI is loaded
  // under it: the screenshots then look like the app on Windows.
  final text = windows.existsSync()
      ? [
          p.join(windows.path, 'segoeui.ttf'),
          p.join(windows.path, 'segoeuib.ttf'),
          p.join(windows.path, 'seguisb.ttf'),
        ]
      : [
          p.join(material.path, 'roboto-regular.ttf'),
          p.join(material.path, 'roboto-bold.ttf'),
          p.join(material.path, 'roboto-medium.ttf'),
        ];
  await _load('Roboto', text);
  await _load('MaterialIcons', [
    p.join(material.path, 'materialicons-regular.otf'),
  ]);
}

Future<void> _load(String family, List<String> paths) async {
  final loader = FontLoader(family);
  for (final path in paths) {
    final file = File(path);
    if (!file.existsSync()) continue;
    final bytes = await file.readAsBytes();
    loader.addFont(Future.value(ByteData.sublistView(bytes)));
  }
  await loader.load();
}

Future<void> _save(WidgetTester tester, String name) async {
  final boundary = tester.renderObject<RenderRepaintBoundary>(
    find.byKey(_root),
  );
  final file = File(p.join('build', 'screenshots', '$name.png'));
  // The raster work and the write are real async: inside the fake clock the
  // test would hang after the body.
  await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: 2);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    expect(data, isNotNull);
    await file.parent.create(recursive: true);
    await file.writeAsBytes(data!.buffer.asUint8List());
  });
}

Future<void> _shoot(
  WidgetTester tester,
  String name, {
  required String route,
  required List<Override> overrides,
  Future<void> Function(WidgetTester tester)? after,
}) async {
  tester.view.physicalSize = _window;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    RepaintBoundary(
      key: _root,
      child: ProviderScope(
        overrides: overrides,
        child: FlowPostApp(initialDeepLink: route),
      ),
    ),
  );
  await tester.pumpAndSettle();
  if (after != null) {
    await after(tester);
    await tester.pumpAndSettle();
  }
  await _save(tester, name);
}

void main() {
  setUpAll(_loadFonts);

  testWidgets('license', (tester) async {
    await _shoot(tester, 'license', route: '/license', overrides: _app());
  });

  testWidgets('upload', (tester) async {
    const job = MediaJob(
      id: 'job-1',
      sourcePath: r'C:\Videos\launch-teaser.mp4',
      displayName: 'launch-teaser.mp4',
      kind: MediaKind.video,
      sourceBytes: 44040192,
      workspacePath: r'C:\Temp\flowpost\job-1',
    );
    await _shoot(
      tester,
      'upload',
      route: '/upload',
      overrides: [
        ..._app(),
        mediaControllerProvider.overrideWith(
          () => _SeededMedia(
            const MediaProcessing(
              job: job,
              fraction: 0.42,
              message: 'Normalizing...',
            ),
          ),
        ),
      ],
    );
  });

  testWidgets('publish', (tester) async {
    await _shoot(
      tester,
      'publish',
      route: '/publish',
      overrides: [
        ..._app(token: 'demo-session'),
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
      ],
      after: (tester) async {
        await tester.tap(find.byKey(Key('target-${_instagram.id}')));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.byKey(Key('caption-${_instagram.id}')),
          'One week, one feature, no shortcuts. Watch how the new queue was '
          'built — link in bio.',
        );
        // The draft form is written 800 ms after the last keystroke.
        await tester.pump(const Duration(seconds: 1));
      },
    );
  });

  testWidgets('queue', (tester) async {
    final repository = FakeScheduledPostsRepository()
      ..pages[0] = ScheduledPostsPage(
        posts: [
          post(
            id: 'post-4',
            scheduledAt: DateTime.utc(2026, 10, 29, 8, 30),
            videoTitle: 'Behind the scenes: the new drop',
            caption: 'A first look at what ships next week.',
          ),
          post(
            id: 'post-3',
            platform: PublishPlatform.youtube,
            accountName: 'FlowPost Channel',
            scheduledAt: DateTime.utc(2026, 10, 30, 15),
            videoTitle: 'How we ship a feature in one week',
            caption: 'The whole pipeline, start to finish.',
          ),
          post(
            id: 'post-2',
            status: PostStatus.published,
            scheduledAt: DateTime.utc(2026, 10, 28, 10),
            publishedAt: DateTime.utc(2026, 10, 28, 10, 2),
            videoTitle: 'Three captions that actually convert',
            caption: 'Hooks, proof, and one clear ask.',
          ),
          post(
            id: 'post-1',
            status: PostStatus.failed,
            platform: PublishPlatform.tiktok,
            accountName: 'FlowPost Clips',
            scheduledAt: DateTime.utc(2026, 10, 27, 17),
            videoTitle: 'The 10 second edit',
            caption: 'Cut, caption, schedule, done.',
          ),
        ],
        hasMore: false,
      );
    await _shoot(
      tester,
      'queue',
      route: '/queue',
      overrides: [
        ..._app(),
        scheduledPostsRepositoryProvider.overrideWithValue(repository),
      ],
    );
  });

  testWidgets('calendar', (tester) async {
    final repository = FakeScheduledPostsRepository()
      ..rangePosts = [
        post(
          id: 'cal-1',
          scheduledAt: DateTime.utc(2026, 10, 2, 8),
          videoTitle: 'Launch week recap',
        ),
        post(
          id: 'cal-2',
          platform: PublishPlatform.youtube,
          scheduledAt: DateTime.utc(2026, 10, 6, 13),
          videoTitle: 'One week, one feature',
        ),
        post(
          id: 'cal-3',
          scheduledAt: DateTime.utc(2026, 10, 13, 16),
          videoTitle: 'Behind the scenes',
        ),
        post(
          id: 'cal-4',
          platform: PublishPlatform.tiktok,
          scheduledAt: DateTime.utc(2026, 10, 19, 9),
          videoTitle: 'The 10 second edit',
        ),
        post(
          id: 'cal-5',
          platform: PublishPlatform.facebook,
          scheduledAt: DateTime.utc(2026, 10, 22, 11),
          videoTitle: 'Captions that convert',
        ),
        post(
          id: 'cal-6',
          scheduledAt: DateTime.utc(2026, 10, 27, 14),
          videoTitle: 'Queue preview',
        ),
        post(
          id: 'cal-7',
          platform: PublishPlatform.youtube,
          scheduledAt: DateTime.utc(2026, 10, 29, 7, 30),
          videoTitle: 'Shipping in public',
        ),
        post(
          id: 'cal-8',
          scheduledAt: DateTime.utc(2026, 10, 29, 15),
          videoTitle: 'Behind the scenes: the new drop',
        ),
        post(
          id: 'cal-9',
          platform: PublishPlatform.linkedin,
          scheduledAt: DateTime.utc(2026, 10, 31, 10),
          videoTitle: 'What we learned this month',
        ),
      ];
    await _shoot(
      tester,
      'calendar',
      route: '/calendar',
      overrides: [
        ..._app(),
        scheduledPostsRepositoryProvider.overrideWithValue(repository),
        todayProvider.overrideWithValue(DateTime(2026, 10, 29)),
      ],
    );
  });

  testWidgets('settings', (tester) async {
    await _shoot(
      tester,
      'settings',
      route: '/settings',
      overrides: [
        ..._app(license: _grant()),
        licenseControllerProvider.overrideWith(_ActiveLicense.new),
        connectionCheckProvider.overrideWithValue(
          (config) async => 'The server answered.',
        ),
        diagnosticsFactsProvider.overrideWith((ref) async => _facts),
        exportFolderPickerProvider.overrideWithValue(() async => null),
        logsFolderProvider.overrideWith(
          (ref) async =>
              Directory(r'C:\Users\Alex\AppData\Roaming\FlowPost Studio\logs'),
        ),
        openFolderProvider.overrideWithValue((folder) async => true),
        updateFetcherProvider.overrideWithValue(
          ({required Uri manifestUrl, required String currentVersion}) async =>
              UpdateResult(
                currentVersion: currentVersion,
                latestVersion: currentVersion,
              ),
        ),
      ],
    );
  });
}
