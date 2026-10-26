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

import 'tray_menu.dart';

/// True when [imagePath] points at our branded executable.
bool isFlowPostImage(String? imagePath) {
  if (imagePath == null) return false;
  final name = imagePath.split(RegExp(r'[\\/]')).last.toLowerCase();
  return name == 'flowpost.exe';
}

/// Delivers queued hand-off intents and consumes the file. The batch is
/// renamed away (not deleted after reading), so a secondary instance that
/// appends while a batch is in flight recreates the original file and is
/// picked up by the next loop pass instead of losing its intent.
Future<void> drainIntentFile(
  File intents,
  void Function(String link) onLink,
) async {
  while (await intents.exists()) {
    final batch = File('${intents.path}.$pid.draining');
    try {
      await intents.rename(batch.path);
    } on FileSystemException {
      return; // Lost the claim to a concurrent drainer.
    }
    List<String> lines = const [];
    try {
      lines = (await batch.readAsLines())
          .where((line) => line.isNotEmpty)
          .toList();
      await batch.delete();
    } on FileSystemException {
      // Partially-written batch is best-effort; watcher re-fires on change.
    }
    for (final line in lines) {
      onLink(line);
    }
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
  File? _lockFile;
  File? _intentsFile;
  Directory? _watchRoot;
  StreamSubscription<FileSystemEvent>? _intentSub;

  /// Resolves guard files (lock + intents). Must run before any window is
  /// shown so a secondary instance can exit without flashing UI.
  Future<void> prepareGuard() async {
    final support = await getApplicationSupportDirectory();
    _watchRoot = support;
    _lockFile = File('${support.path}${Platform.pathSeparator}flowpost.lock');
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
        title: 'FlowPost',
      ),
      () async {
        await windowManager.show();
      },
    );
    windowManager.addListener(this);

    await trayManager.setIcon(trayIconPath);
    await trayManager.setToolTip('FlowPost');
    await trayManager.setContextMenu(TrayMenu.build());
    trayManager.addListener(this);
  }

  /// Returns false when another live FlowPost process owns the lock; the
  /// caller must then exit. When this is the primary instance the lock
  /// holds our PID.
  Future<bool> acquireSingleInstance(String? incomingLink) async {
    final lock = _lockFile;
    if (lock == null) return true;
    if (await lock.exists()) {
      final ownerPid = int.tryParse((await lock.readAsString()).trim());
      if (ownerPid != null && ownerPid != pid && _ownerIsFlowPost(ownerPid)) {
        await _handOffTo(ownerPid, incomingLink);
        return false;
      }
    }
    await lock.writeAsString('$pid\n');
    return true;
  }

  Future<void> _handOffTo(int ownerPid, String? link) async {
    final intent = link ?? 'flowpost://focus';
    final intents = _intentsFile;
    if (intents != null) {
      await intents.writeAsString('$intent\n', mode: FileMode.append);
    }
    final hwnd = _windowOfPid(ownerPid);
    if (hwnd != null) {
      ShowWindow(hwnd, SW_RESTORE);
      SetForegroundWindow(hwnd);
    }
    _log.info('Handed "$intent" to primary instance (pid $ownerPid).');
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

  /// A lock owner counts as live only when its PID resolves to
  /// `flowpost.exe`; a recycled PID owned by an unrelated process must not
  /// wedge future launches. An owner we cannot inspect (e.g. elevated) is
  /// trusted as alive rather than risking two primaries.
  static bool _ownerIsFlowPost(int ownerPid) {
    final handle = OpenProcess(
      PROCESS_QUERY_LIMITED_INFORMATION,
      false,
      ownerPid,
    ).value;
    if (handle.address == 0) return false;
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
      return isFlowPostImage(
        String.fromCharCodes(name.asTypedList(size.value)),
      );
    } finally {
      pkgffi.calloc.free(size);
      pkgffi.calloc.free(name);
      CloseHandle(handle);
    }
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
    await windowManager.show();
    await windowManager.focus();
  }

  Future<void> quit() async {
    _hideOnClose = false;
    await _intentSub?.cancel();
    final lock = _lockFile;
    if (lock != null && await lock.exists()) {
      await lock.delete();
    }
    await trayManager.destroy();
    await windowManager.destroy();
  }

  @override
  void onWindowClose() async {
    // destroy() hides on Windows, keeping the process alive for the tray.
    if (_hideOnClose) {
      await windowManager.destroy();
    } else {
      await windowManager.close();
    }
  }

  @override
  void onTrayIconMouseDown() => showFromTray();

  @override
  void onTrayIconRightMouseDown() => trayManager.popUpContextMenu();

  @override
  void onTrayMenuItemClick(MenuItem menuItem) {
    switch (menuItem.key) {
      case TrayMenu.showTag:
        showFromTray();
      case TrayMenu.quitTag:
        quit();
    }
  }
}
