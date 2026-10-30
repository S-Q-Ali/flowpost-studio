import 'dart:io';
import 'dart:typed_data';

import 'package:flowpost_desktop/features/offline/data/drafts_repository.dart';
import 'package:flowpost_desktop/features/offline/drafts/compose_draft.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

ComposeDraft _draft(
  String caption, {
  String videoId = 'video-1',
  DateTime? savedAt,
}) => ComposeDraft(
  videoId: videoId,
  savedAt: savedAt ?? DateTime.utc(2026, 10, 29, 14, 32),
  targetIds: const {'instagram:ig-1:feed'},
  captions: {'instagram:ig-1:feed': caption},
);

void main() {
  late Directory dir;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('flowpost_drafts_repo_test');
  });

  tearDown(() async {
    if (await dir.exists()) {
      await dir.delete(recursive: true);
    }
  });

  test('a draft saved through the repository is read back', () async {
    final repository = LocalDraftsRepository(
      file: () async => File(p.join(dir.path, 'drafts.db')),
    );
    addTearDown(repository.close);

    await repository.save(_draft('Hello'));

    expect(
      (await repository.load('video-1'))!.captions['instagram:ig-1:feed'],
      'Hello',
    );
    await repository.delete('video-1');
    expect(await repository.load('video-1'), isNull);
  });

  test('the repository lists every draft, newest first', () async {
    final repository = LocalDraftsRepository(
      file: () async => File(p.join(dir.path, 'drafts.db')),
    );
    addTearDown(repository.close);

    await repository.save(
      _draft('Old', savedAt: DateTime.utc(2026, 10, 28, 9)),
    );
    await repository.save(
      _draft('New', videoId: 'video-2', savedAt: DateTime.utc(2026, 10, 30, 9)),
    );

    expect(
      [for (final draft in await repository.all()) draft.videoId],
      ['video-2', 'video-1'],
    );
  });

  test('a save that cannot be written says so', () async {
    final repository = LocalDraftsRepository(
      file: () async => throw const FileSystemException('no support folder'),
    );

    expect(await repository.save(_draft('Hello')), isFalse);
    expect(await repository.all(), isEmpty);
  });

  test(
    'a store that cannot be opened is a missing draft, not a crash',
    () async {
      final repository = LocalDraftsRepository(
        file: () async => throw const FileSystemException('no support folder'),
      );

      expect(await repository.load('video-1'), isNull);
      await repository.save(_draft('Hello'));
      await repository.delete('video-1');
    },
  );

  test(
    'a file that is not a database is a missing draft, not a crash',
    () async {
      final file = File(p.join(dir.path, 'drafts.db'));
      await file.writeAsBytes(Uint8List.fromList(List.filled(64, 7)));
      final repository = LocalDraftsRepository(file: () async => file);
      addTearDown(repository.close);

      expect(await repository.load('video-1'), isNull);
      await repository.save(_draft('Hello'));
      expect(file.existsSync(), isTrue);
    },
  );

  test('no drafts file yet is available, not broken', () async {
    final repository = LocalDraftsRepository(
      file: () async => File(p.join(dir.path, 'drafts.db')),
    );
    addTearDown(repository.close);

    expect(await repository.available(), isTrue);
    expect(
      File(p.join(dir.path, 'drafts.db')).existsSync(),
      isFalse,
      reason: 'reading availability must not create the file',
    );
  });

  test('a drafts file that will not open is not available', () async {
    final file = File(p.join(dir.path, 'drafts.db'));
    await file.writeAsBytes(Uint8List.fromList(List.filled(64, 7)));
    final repository = LocalDraftsRepository(file: () async => file);
    addTearDown(repository.close);

    expect(await repository.available(), isFalse);
  });

  test('starting fresh keeps the broken file under a stamped name', () async {
    final file = File(p.join(dir.path, 'drafts.db'));
    await file.writeAsBytes(Uint8List.fromList(List.filled(64, 7)));
    final repository = LocalDraftsRepository(file: () async => file);
    addTearDown(repository.close);

    expect(await repository.startFresh(), isTrue);
    expect(await repository.available(), isTrue);
    expect(await repository.load('video-1'), isNull);

    final kept = dir.listSync().whereType<File>().where(
      (entry) => p.basename(entry.path).startsWith('drafts.corrupt-'),
    );
    expect(kept.single.readAsBytesSync(), List.filled(64, 7));
  });
}
