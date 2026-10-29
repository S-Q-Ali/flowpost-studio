import 'dart:io';

import 'package:flowpost_desktop/features/offline/drafts/compose_draft.dart';
import 'package:flowpost_desktop/features/offline/drafts/draft_store.dart';
import 'package:flowpost_desktop/features/publishing/domain/publish_selection.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:sqlite3/sqlite3.dart';

ComposeDraft draft({
  String videoId = 'video-1',
  DateTime? savedAt,
  Set<String> targetIds = const {'instagram:ig-1:feed'},
  Map<String, String> captions = const {'instagram:ig-1:feed': 'Hello'},
  Map<String, String> aiCaptions = const {},
  String youtubeTitle = '',
  PublishMode mode = PublishMode.now,
  String scheduleDate = '',
  String scheduleTime = '',
  DateTime? resolvedAt,
  int? offsetMinutes,
  String? fileName,
  int? size,
  String? mediaKind,
}) {
  return ComposeDraft(
    videoId: videoId,
    savedAt: savedAt ?? DateTime.utc(2026, 10, 29, 14, 32),
    targetIds: targetIds,
    captions: captions,
    aiCaptions: aiCaptions,
    youtubeTitle: youtubeTitle,
    mode: mode,
    scheduleDate: scheduleDate,
    scheduleTime: scheduleTime,
    resolvedAt: resolvedAt,
    offsetMinutes: offsetMinutes,
    fileName: fileName,
    size: size,
    mediaKind: mediaKind,
  );
}

void main() {
  late Directory dir;
  late File file;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('flowpost_drafts_test');
    file = File(p.join(dir.path, 'drafts.db'));
  });

  tearDown(() async {
    if (await dir.exists()) {
      await dir.delete(recursive: true);
    }
  });

  test('a draft is still there after a close and a reopen', () {
    final store = DraftStore(file: file);
    expect(store.open(), isTrue);
    store.save(
      draft(
        targetIds: const {'instagram:ig-1:feed', 'youtube:yt-1:feed'},
        captions: const {
          'instagram:ig-1:feed': 'Hello',
          'youtube:yt-1:feed': 'Hello there',
        },
        aiCaptions: const {'instagram:ig-1:feed': 'Hello'},
        youtubeTitle: 'A title',
        mode: PublishMode.schedule,
        scheduleDate: '2026-11-02',
        scheduleTime: '14:30',
        resolvedAt: DateTime.utc(2026, 11, 2, 12, 30),
        offsetMinutes: 120,
      ),
    );
    store.close();

    final reopened = DraftStore(file: file);
    addTearDown(reopened.close);
    expect(reopened.open(), isTrue);
    final loaded = reopened.load('video-1')!;

    expect(loaded.videoId, 'video-1');
    expect(loaded.savedAt, DateTime.utc(2026, 10, 29, 14, 32));
    expect(loaded.targetIds, {'instagram:ig-1:feed', 'youtube:yt-1:feed'});
    expect(loaded.captions, {
      'instagram:ig-1:feed': 'Hello',
      'youtube:yt-1:feed': 'Hello there',
    });
    expect(loaded.aiCaptions, {'instagram:ig-1:feed': 'Hello'});
    expect(loaded.youtubeTitle, 'A title');
    expect(loaded.mode, PublishMode.schedule);
    expect(loaded.scheduleDate, '2026-11-02');
    expect(loaded.scheduleTime, '14:30');
    expect(loaded.resolvedAt, DateTime.utc(2026, 11, 2, 12, 30));
    expect(loaded.offsetMinutes, 120);
    expect(loaded.toSelection().captions['instagram:ig-1:feed'], 'Hello');
  });

  test('one draft per media: a second save replaces the first', () {
    final store = DraftStore(file: file);
    addTearDown(store.close);
    store.open();
    store.save(draft(captions: const {'instagram:ig-1:feed': 'First'}));
    store.save(draft(captions: const {'instagram:ig-1:feed': 'Second'}));

    expect(store.load('video-1')!.captions['instagram:ig-1:feed'], 'Second');
  });

  test('two media keep their own drafts', () {
    final store = DraftStore(file: file);
    addTearDown(store.close);
    store.open();
    store.save(draft(videoId: 'video-1', youtubeTitle: 'One'));
    store.save(draft(videoId: 'video-2', youtubeTitle: 'Two'));

    expect(store.load('video-1')!.youtubeTitle, 'One');
    expect(store.load('video-2')!.youtubeTitle, 'Two');
  });

  test('deleting a draft leaves the other media alone', () {
    final store = DraftStore(file: file);
    addTearDown(store.close);
    store.open();
    store.save(draft(videoId: 'video-1'));
    store.save(draft(videoId: 'video-2'));
    store.delete('video-1');

    expect(store.load('video-1'), isNull);
    expect(store.load('video-2'), isNotNull);
  });

  test('a media with no draft has none', () {
    final store = DraftStore(file: file);
    addTearDown(store.close);
    store.open();

    expect(store.load('video-9'), isNull);
  });

  test('the media of a draft survives a close and a reopen', () {
    final store = DraftStore(file: file);
    addTearDown(store.close);
    expect(store.open(), isTrue);
    expect(
      store.save(draft(fileName: 'clip.mp4', size: 2048, mediaKind: 'video')),
      isTrue,
    );

    final reopened = DraftStore(file: file);
    addTearDown(reopened.close);
    expect(reopened.open(), isTrue);
    final loaded = reopened.load('video-1')!;

    expect(loaded.fileName, 'clip.mp4');
    expect(loaded.size, 2048);
    expect(loaded.mediaKind, 'video');
  });

  test('every draft is listed newest first', () {
    final store = DraftStore(file: file);
    addTearDown(store.close);
    store.open();
    store.save(
      draft(videoId: 'video-1', savedAt: DateTime.utc(2026, 10, 28, 9)),
    );
    store.save(
      draft(videoId: 'video-2', savedAt: DateTime.utc(2026, 10, 30, 9)),
    );
    store.save(
      draft(videoId: 'video-3', savedAt: DateTime.utc(2026, 10, 29, 9)),
    );

    expect(
      [for (final saved in store.all()) saved.videoId],
      ['video-2', 'video-3', 'video-1'],
    );
  });

  test('a store that is not open saves nothing and says so', () {
    final store = DraftStore(file: file);

    expect(store.save(draft()), isFalse);
    expect(store.all(), isEmpty);
  });

  test(
    'a file that is not a database is left on disk and the store carries on',
    () {
      file.writeAsStringSync('this is not a database');
      final store = DraftStore(file: file);

      expect(store.open(), isFalse);
      expect(file.existsSync(), isTrue);
      expect(file.readAsStringSync(), 'this is not a database');
      expect(store.load('video-1'), isNull);
      store.save(draft());
      expect(file.readAsStringSync(), 'this is not a database');
    },
  );

  test('a drafts database from a newer build is not touched', () {
    final raw = sqlite3.open(file.path);
    raw.execute(
      'CREATE TABLE meta (id INTEGER PRIMARY KEY CHECK (id = 1), '
      'schema_version INTEGER NOT NULL, last_read_at INTEGER)',
    );
    raw.execute('INSERT INTO meta (id, schema_version) VALUES (1, 99)');
    raw.close();

    final store = DraftStore(file: file);
    expect(store.open(), isFalse);
    final after = sqlite3.open(file.path);
    addTearDown(after.close);
    expect(
      after.select('SELECT schema_version FROM meta').first['schema_version'],
      99,
    );
    expect(
      after.select("SELECT name FROM sqlite_master WHERE name = 'drafts'"),
      isEmpty,
    );
  });

  test('a draft with nothing in it is recognised as empty', () {
    expect(draft(targetIds: const {}, captions: const {}).isEmpty, isTrue);
    expect(draft().isEmpty, isFalse);
    expect(
      draft(
        targetIds: const {},
        captions: const {},
        mode: PublishMode.schedule,
        scheduleDate: '2026-11-02',
      ).isEmpty,
      isFalse,
    );
  });
}
