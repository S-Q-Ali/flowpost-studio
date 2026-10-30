// ignore_for_file: deprecated_member_use
import 'dart:async';
import 'dart:ffi' as ffi;
import 'dart:io';

import 'package:ffi/ffi.dart' as pkgffi;

import 'package:flutter/widgets.dart';
import 'package:logging/logging.dart';
import 'package:path_provider/path_provider.dart';
import 'package:tray_manager/legacy.dart';
import 'package:win32/win32.dart';
import 'package:window_manager/window_manager.dart';

import '../logging/app_logger.dart';
import '../router/deep_links.dart';
import 'instance_guard.dart';
import 'tray_menu.dart';

/// True when [imagePath] points at our branded executable.
bool isFlowPostImage(String? imagePath) {
  if (imagePath == null) return false;
  final name = imagePath.split(RegExp(r'[\\/]')).last.toLowerCase();
  return name == 'flowpost.exe';
}

/// Runs the tray steps in order and returns the first failure instead of
/// throwing. A tray that cannot be created must not leave a hidden window.
Future<Object?> configureTray({
  required Future<void> Function() setIcon,
  required Future<void> Function() setToolTip,
  required Future<void> Function() setContextMenu,
  required void Function() addListener,
}) async {
  try {
    await setIcon();
    await setToolTip();
    await setContextMenu();
    addListener();
    return null;
  } on Object catch (error) {
    return error;
  }
}

/// A lock owner counts as live only when its PID resolves to `flowpost.exe`.
/// An owner we cannot inspect (elevated/access denied/invalid PID) is trusted
/// as alive rather than risking two primaries.
bool isFlowPostProcess(int ownerPid) {
  final handle = OpenProcess(
    PROCESS_QUERY_LIMITED_INFORMATION,
    false,
    ownerPid,
  ).value;
  if (handle.address == 0) return true;
  final name = pkgffi.calloc<ffi.Uint16>(512);
  final size = pkgffi.calloc<ffi.Uint32>(1)..value = 512;
  try {
    final ok = QueryFullProcessImageName(
      handle,
      PROCESS_NAME_WIN32,
      PWSTR(name.cast<pkgffi.Utf16>()),
      size,
    ).value;
    if (!ok) return true;
    return isFlowPostImage(String.fromCharCodes(name.asTypedList(size.value)));
  } finally {
    pkgffi.calloc.free(size);
    pkgffi.calloc.free(name);
    CloseHandle(handle);
  }
}

/// Reads a claimed batch; injectable so failure recovery can be tested.
typedef IntentLineReader = Future<List<String>> Function(File file);

/// Delivers queued hand-off intents and consumes the file. The batch is
/// renamed away (not deleted after reading), so a secondary instance that
/// appends while a batch is in flight recreates the original file and is
/// picked up by the next loop pass instead of losing its intent.
///
/// If reading the claimed batch fails, the original file is recreated (or
/// the batch is appended to a newer file) before returning.
Future<void> drainIntentFile(
  File intents,
  void Function(String link) onLink, {
  IntentLineReader? readLines,
}) async {
  final reader = readLines ?? (file) => file.readAsLines();
  while (await intents.exists()) {
    // Unique suffix: a batch left behind by a crashed process must never
    // block the next drain after PID reuse.
    final batch = File(
      '${intents.path}.$pid.${DateTime.now().microsecondsSinceEpoch}.draining',
    );
    try {
      await intents.rename(batch.path);
    } on FileSystemException {
      return; // Lost the claim to a concurrent drainer.
    }
    List<String> lines;
    try {
      lines = (await reader(batch)).where((line) => line.isNotEmpty).toList();
    } on FileSystemException {
      await _restoreIntentBatch(batch, intents);
      return;
    }
    try {
      await batch.delete();
    } on FileSystemException {
      // Best-effort: the intents were read, so a stuck batch is not data loss.
    }
    for (final line in lines) {
      onLink(line);
    }
  }
}

Future<void> _restoreIntentBatch(File batch, File intents) async {
  try {
    if (!await intents.exists()) {
      await batch.rename(intents.path);
      return;
    }
    // A secondary wrote a new file while this batch was claimed; keep both.
    await batch.openRead().pipe(intents.openWrite(mode: FileMode.append));
    await batch.delete();
  } on FileSystemException {
    // Leave the batch on disk rather than deleting unread intents.
  }
}

/// Owns window, tray, single-instance guard and close-to-tray behaviour.
///
/// The guard is a lock file in the app-data root, naming a live
/// `flowpost.exe` PID: if such a process owns it, this launch hands its deep
/// link (or `flowpost://focus`) via a shared intents file, restores the
/// primary window by PID, and exits before any window is shown. The primary
/// watches that file.
class FlowPostShell with WindowListener, TrayListener {
  FlowPostShell({required this.trayIconPath});

  final Logger _log = Logger('shell');
  final String trayIconPath;

  static const String _windowClass = 'FLUTTER_RUNNER_WIN32_WINDOW';

  bool _hideOnClose = true;
  bool _quitting = false;
  InstanceGuard? _guard;
  File? _intentsFile;
  Directory? _watchRoot;
  StreamSubscription<FileSystemEvent>? _intentSub;

  /// Resolves guard files (lock + owner + intents). Must run before any window
  /// is shown so a secondary instance can exit without flashing UI.
  Future<void> prepareGuard() async {
    final support = await getApplicationSupportDirectory();
    _watchRoot = support;
    _guard = InstanceGuard(
      lockFile: File('${support.path}${Platform.pathSeparator}flowpost.lock'),
      ownerFile: File('${support.path}${Platform.pathSeparator}flowpost.owner'),
      currentPid: pid,
    );
    _intentsFile = File(
      '${support.path}${Platform.pathSeparator}flowpost-intents.txt',
    );
  }

  Future<void> startWindowAndTray() async {
    await windowManager.ensureInitialized();
    // The options embed runtime values; not constant-able.
    await windowManager.waitUntilReadyToShow(
      // ignore: prefer_const_constructors
      WindowOptions(
        size: const Size(1280, 800),
        center: true,
        title: 'FlowPost Studio',
      ),
      () async {
        await windowManager.show();
      },
    );
    await windowManager.setMinimumSize(const Size(1024, 640));
    windowManager.addListener(this);
    // Without this the native WM_CLOSE destroys the window and exits,
    // bypassing onWindowClose entirely.
    await windowManager.setPreventClose(true);

    final trayError = await configureTray(
      setIcon: () => trayManager.setIcon(trayIconPath),
      setToolTip: () => trayManager.setToolTip('FlowPost Studio'),
      setContextMenu: () => trayManager.setContextMenu(TrayMenu.build()),
      addListener: () => trayManager.addListener(this),
    );
    if (trayError != null) {
      _hideOnClose = false;
      _log.severe('Tray setup failed; close-to-tray disabled: $trayError');
      try {
        await trayManager.destroy();
      } on Object {
        // A partial tray icon is best-effort; the window stays usable.
      }
      try {
        await windowManager.setPreventClose(false);
      } on Object catch (error) {
        _log.severe('Could not disable close prevention: $error');
      }
      return;
    }
    _log.info('Shell window and tray ready (pid $pid).');
  }

  /// Returns false when another live FlowPost process owns the lock; the
  /// caller must then exit. When this is the primary instance the OS lock is
  /// held for the process lifetime.
  Future<bool> acquireSingleInstance(String? incomingLink) async {
    final guard = _guard;
    if (guard == null) return true;
    final role = await guard.acquire();
    if (role == InstanceRole.primary) return true;
    final ownerPid = guard.ownerPid;
    if (ownerPid != null && isFlowPostProcess(ownerPid)) {
      await _handOffTo(ownerPid, incomingLink);
    } else {
      _log.severe(
        'Another instance holds the lock but its owner is unknown; exiting.',
      );
    }
    return false;
  }

  Future<void> _handOffTo(int ownerPid, String? link) async {
    final intent = link ?? 'flowpost://focus';
    final intents = _intentsFile;
    if (intents != null) {
      try {
        await intents.writeAsString('$intent\n', mode: FileMode.append);
      } on FileSystemException catch (error) {
        _log.warning('Could not queue hand-off intent: $error');
      }
    }
    final hwnd = _windowOfPid(ownerPid);
    if (hwnd != null) {
      ShowWindow(hwnd, SW_RESTORE);
      SetForegroundWindow(hwnd);
    }
    _log.info(
      'Handed ${describeDeepLink(intent)} to primary instance (pid $ownerPid).',
    );
  }

  /// Primary instance: drains any queued intents now and watches for more.
  Future<void> startIntentWatcher(void Function(String link) onLink) async {
    final intents = _intentsFile;
    final root = _watchRoot;
    if (intents == null || root == null) return;
    await drainIntentFile(intents, onLink);
    await _intentSub?.cancel();
    _intentSub = root.watch(events: FileSystemEvent.all).listen((event) async {
      if (event.path == intents.path) {
        await drainIntentFile(intents, onLink);
      }
    });
  }

  static PCWSTR _utf16(String value) {
    final buffer = pkgffi.calloc<ffi.Uint16>(value.length + 1);
    buffer.asTypedList(value.length).setAll(0, value.codeUnits);
    buffer[value.length] = 0;
    return PCWSTR(buffer.cast<pkgffi.Utf16>());
  }

  /// Enumerate every window of our class: the topmost one is frequently
  /// *this* (secondary) process's own window, so a single FindWindow would
  /// miss the primary.
  HWND? _windowOfPid(int ownerPid) {
    final classPtr = _utf16(_windowClass);
    try {
      HWND? previous;
      while (true) {
        final window = FindWindowEx(null, previous, classPtr, null).value;
        if (window.address == 0) return null;
        final pidBuf = pkgffi.calloc<ffi.Uint32>();
        GetWindowThreadProcessId(window, pidBuf);
        final owner = pidBuf.value;
        pkgffi.calloc.free(pidBuf);
        if (owner == ownerPid) return window;
        previous = window;
      }
    } on Object catch (e) {
      _log.warning('Window probe failed: $e');
      return null;
    } finally {
      pkgffi.calloc.free(classPtr);
    }
  }

  Future<void> showFromTray() async {
    await windowManager.setSkipTaskbar(false);
    await windowManager.show();
    await windowManager.focus();
  }

  Future<void> quit() async {
    _log.info('Quit requested via tray; tearing down shell.');
    _quitting = true;
    _hideOnClose = false;
    await _intentSub?.cancel();
    await _guard?.release();
    await trayManager.destroy();
    await windowManager.destroy();
    // Do not rely on destroy() to bring the process down — exit explicitly
    // so Quit is deterministic.
    await flushLogging();
    exit(0);
  }

  @override
  void onWindowClose() async {
    if (_quitting) return;
    if (!_hideOnClose) {
      // Tray setup failed, so hiding would strand the window with no way back.
      await windowManager.destroy();
      return;
    }
    // window_manager's destroy() is fatal — verified by smoke test: the
    // process exits. Close-to-tray must hide a live window instead.
    await windowManager.hide();
    await windowManager.setSkipTaskbar(true);
  }

  @override
  void onTrayIconMouseDown() => showFromTray();

  @override
  void onTrayIconRightMouseDown() => trayManager.popUpContextMenu();

  @override
  void onTrayMenuItemClick(MenuItem menuItem) {
    _log.info('Tray menu clicked: ${menuItem.key}');
    switch (menuItem.key) {
      case TrayMenu.showTag:
        unawaited(
          showFromTray().catchError(
            (Object e) => _log.severe('Show from tray failed: $e'),
          ),
        );
      case TrayMenu.quitTag:
        unawaited(
          quit().catchError((Object e) async {
            _log.severe('Quit failed: $e');
            await flushLogging();
            exit(1);
          }),
        );
    }
  }
}
