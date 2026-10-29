import 'dart:io';

import 'package:flowpost_desktop/features/media/data/media_workspace.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:logging/logging.dart';

void main() {
  group('MediaWorkspace', () {
    late Directory tempDir;
    late Directory jobsRoot;

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp(
        'flowpost_workspace_test',
      );
      jobsRoot = Directory(
        '${tempDir.path}${Platform.pathSeparator}media${Platform.pathSeparator}jobs',
      );
    });

    tearDown(() async {
      if (await tempDir.exists()) await tempDir.delete(recursive: true);
    });

    MediaWorkspace buildWorkspace({Logger? log}) =>
        MediaWorkspace(root: jobsRoot, log: log);

    test('createJob makes a job folder inside the jobs root', () async {
      final job = await buildWorkspace().createJob();

      expect(job.parent.path, jobsRoot.path);
      expect(await job.exists(), isTrue);
    });

    test('createJob names the folder with a timestamp and six hex digits', () {
      expect(
        newJobId(DateTime(2026, 10, 29, 14, 5, 3)),
        matches(RegExp(r'^20261029T140503-[0-9a-f]{6}$')),
      );
    });

    test('createJob makes the jobs root when it is missing', () async {
      final job = await buildWorkspace().createJob();

      expect(await jobsRoot.exists(), isTrue);
      expect(await job.exists(), isTrue);
    });

    test('deleteJob removes the job folder', () async {
      final workspace = buildWorkspace();
      final job = await workspace.createJob();

      final deleted = await workspace.deleteJob(job);

      expect(deleted, isTrue);
      expect(await job.exists(), isFalse);
    });

    test('deleteJob refuses a folder outside the jobs root', () async {
      final outside = Directory(
        '${tempDir.path}${Platform.pathSeparator}outside',
      );
      await outside.create();

      final deleted = await buildWorkspace().deleteJob(outside);

      expect(deleted, isFalse);
      expect(await outside.exists(), isTrue);
    });

    test('deleteJob refuses a path that escapes the jobs root', () async {
      await jobsRoot.create(recursive: true);
      final escaping = Directory(
        '${jobsRoot.path}${Platform.pathSeparator}..${Platform.pathSeparator}escaped',
      );
      await escaping.create();

      final deleted = await buildWorkspace().deleteJob(escaping);

      expect(deleted, isFalse);
      expect(await escaping.exists(), isTrue);
    });

    test('deleteJob refuses a folder that is not a job folder', () async {
      await jobsRoot.create(recursive: true);
      final stranger = Directory(
        '${jobsRoot.path}${Platform.pathSeparator}notes',
      );
      await stranger.create();

      final deleted = await buildWorkspace().deleteJob(stranger);

      expect(deleted, isFalse);
      expect(await stranger.exists(), isTrue);
    });

    test('deleteAllJobs leaves a folder that is not a job folder', () async {
      await jobsRoot.create(recursive: true);
      final stranger = Directory(
        '${jobsRoot.path}${Platform.pathSeparator}notes',
      );
      await stranger.create();

      await buildWorkspace().deleteAllJobs();

      expect(await stranger.exists(), isTrue);
    });

    test('deleteAllJobs removes every leftover job folder', () async {
      final workspace = buildWorkspace();
      await workspace.createJob();
      await workspace.createJob();

      await workspace.deleteAllJobs();

      final remaining = await jobsRoot.list().toList();
      expect(remaining, isEmpty);
    });

    test(
      'deleteAllJobs leaves a locked folder and logs only its job id',
      () async {
        final log = Logger.detached('workspace-test')..level = Level.INFO;
        final records = <LogRecord>[];
        log.onRecord.listen(records.add);

        final workspace = buildWorkspace(log: log);
        final job = await workspace.createJob();
        final jobId = job.path.split(Platform.pathSeparator).last;
        final handle = await File(
          '${job.path}${Platform.pathSeparator}locked.bin',
        ).open(mode: FileMode.write);
        await handle.writeString('locked');

        await workspace.deleteAllJobs();

        expect(await job.exists(), isTrue);
        final messages = records.map((record) => record.message).join('\n');
        expect(messages, contains(jobId));
        expect(messages, isNot(contains(job.path)));
        await handle.close();
      },
    );

    test('deleteAllJobs does nothing when the jobs root is missing', () async {
      await buildWorkspace().deleteAllJobs();

      expect(await jobsRoot.exists(), isFalse);
    });
  });
}
