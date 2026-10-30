import 'dart:io';

enum InstanceRole { primary, secondary }

/// Held for the process lifetime. The OS lock is the source of truth; the
/// owner file is only a hand-off hint because a locked file cannot be read
/// by the second process on Windows.
class InstanceGuard {
  InstanceGuard({
    required this.lockFile,
    required this.ownerFile,
    required this.currentPid,
    this.ownerReadAttempts = 10,
    this.ownerReadDelay = const Duration(milliseconds: 50),
  });

  final File lockFile;
  final File ownerFile;
  final int currentPid;
  final int ownerReadAttempts;
  final Duration ownerReadDelay;

  RandomAccessFile? _lock;
  int? _ownerPid;

  int? get ownerPid => _ownerPid;

  Future<InstanceRole> acquire() async {
    if (_lock != null) return InstanceRole.primary;
    final handle = await lockFile.open(mode: FileMode.append);
    try {
      await handle.lock(FileLock.exclusive);
    } on FileSystemException {
      await handle.close();
      _ownerPid = await _readOwnerPidWithRetry();
      return InstanceRole.secondary;
    }
    _lock = handle;
    _ownerPid = currentPid;
    await ownerFile.writeAsString('$currentPid\n', flush: true);
    return InstanceRole.primary;
  }

  Future<void> release() async {
    final handle = _lock;
    if (handle == null) return;
    _lock = null;
    _ownerPid = null;
    try {
      await handle.unlock();
    } on FileSystemException {
      // Closing below still releases the OS lock.
    }
    await handle.close();
    try {
      if (await ownerFile.exists()) await ownerFile.delete();
    } on FileSystemException {
      // A stale owner file is harmless; the OS lock decides the next launch.
    }
  }

  Future<int?> _readOwnerPidWithRetry() async {
    for (var attempt = 0; attempt < ownerReadAttempts; attempt++) {
      final pid = await _readOwnerPid();
      if (pid != null) return pid;
      if (attempt + 1 < ownerReadAttempts) {
        await Future<void>.delayed(ownerReadDelay);
      }
    }
    return null;
  }

  Future<int?> _readOwnerPid() async {
    try {
      if (!await ownerFile.exists()) return null;
      return int.tryParse((await ownerFile.readAsString()).trim());
    } on FileSystemException {
      return null;
    }
  }
}
