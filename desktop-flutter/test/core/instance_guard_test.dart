import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flowpost_desktop/core/shell/instance_guard.dart';

void main() {
  late Directory dir;
  late File lockFile;
  late File ownerFile;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('flowpost_guard');
    lockFile = File('${dir.path}${Platform.pathSeparator}flowpost.lock');
    ownerFile = File('${dir.path}${Platform.pathSeparator}flowpost.owner');
  });
  tearDown(() => dir.deleteSync(recursive: true));

  InstanceGuard build(int pid) => InstanceGuard(
    lockFile: lockFile,
    ownerFile: ownerFile,
    currentPid: pid,
    ownerReadAttempts: 2,
    ownerReadDelay: Duration.zero,
  );

  test('first instance becomes primary and records its pid', () async {
    final guard = build(111);
    addTearDown(guard.release);

    expect(await guard.acquire(), InstanceRole.primary);
    expect(guard.ownerPid, 111);
    expect((await ownerFile.readAsString()).trim(), '111');
  });

  test('second instance is secondary and reads the live owner', () async {
    final first = build(111);
    addTearDown(first.release);
    expect(await first.acquire(), InstanceRole.primary);

    final second = build(222);
    addTearDown(second.release);
    expect(await second.acquire(), InstanceRole.secondary);
    expect(second.ownerPid, 111);
  });

  test('a released lock can be acquired by the next instance', () async {
    final first = build(111);
    expect(await first.acquire(), InstanceRole.primary);
    await first.release();

    final second = build(222);
    addTearDown(second.release);
    expect(await second.acquire(), InstanceRole.primary);
    expect(second.ownerPid, 222);
  });

  test('a stale lock file without an OS lock is not trusted', () async {
    await lockFile.writeAsString('999\n');

    final guard = build(111);
    addTearDown(guard.release);
    expect(await guard.acquire(), InstanceRole.primary);
    expect(guard.ownerPid, 111);
  });

  test(
    'a held lock with a missing owner is still treated as secondary',
    () async {
      final first = build(111);
      addTearDown(first.release);
      expect(await first.acquire(), InstanceRole.primary);
      await ownerFile.delete();

      final second = build(222);
      addTearDown(second.release);
      expect(await second.acquire(), InstanceRole.secondary);
      expect(second.ownerPid, isNull);
    },
  );

  test('release removes the owner record and is idempotent', () async {
    final guard = build(111);
    expect(await guard.acquire(), InstanceRole.primary);
    await guard.release();
    expect(await ownerFile.exists(), isFalse);
    await guard.release();
  });
}
