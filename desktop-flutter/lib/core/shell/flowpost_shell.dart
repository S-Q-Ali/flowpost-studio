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

/// Owns window, tray, single-instance guard and close-to-tray behaviour.
///
/// The guard is a lock file in the app-data root: if a live *other* process
/// owns it, this launch hands its deep link (or `flowpost://focus`) to the
/// primary via a shared intents file, restores the primary window by PID,
/// and exits. The primary watches that file.
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

  Future<void> initialise() async {
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

    final support = await getApplicationSupportDirectory();
    _watchRoot = support;
    _lockFile = File('${support.path}${Platform.pathSeparator}flowpost.lock');
    _intentsFile = File(
      '${support.path}${Platform.pathSeparator}flowpost-intents.txt',
    );
  }

  /// Returns false when another live FlowPost process owns the lock; the
  /// caller must then exit. When this is the primary instance the lock
  /// holds our PID.
  Future<bool> acquireSingleInstance(String? incomingLink) async {
    final lock = _lockFile;
    if (lock == null) return true;
    if (await lock.exists()) {
      final ownerPid = int.tryParse((await lock.readAsString()).trim());
      if (ownerPid != null && ownerPid != pid && _isProcessAlive(ownerPid)) {
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
    await _drainIntents(intents, onLink);
    await _intentSub?.cancel();
    _intentSub = root.watch(events: FileSystemEvent.all).listen((event) async {
      if (event.path == intents.path) {
        await _drainIntents(intents, onLink);
      }
    });
  }

  Future<void> _drainIntents(
    File intents,
    void Function(String link) onLink,
  ) async {
    if (!await intents.exists()) return;
    final pending = (await intents.readAsLines())
        .where((line) => line.isNotEmpty)
        .toList();
    await intents.delete();
    for (final link in pending) {
      onLink(link);
    }
  }

  static bool _isProcessAlive(int otherPid) {
    final handle = OpenProcess(
      PROCESS_QUERY_LIMITED_INFORMATION,
      false,
      otherPid,
    ).value;
    final alive = handle.address != 0;
    if (alive) CloseHandle(handle);
    return alive;
  }

  static PCWSTR _utf16(String value) {
    final buffer = pkgffi.calloc<ffi.Uint16>(value.length + 1);
    buffer.asTypedList(value.length).setAll(0, value.codeUnits);
    buffer[value.length] = 0;
    return PCWSTR(buffer.cast<pkgffi.Utf16>());
  }

  HWND? _windowOfPid(int ownerPid) {
    try {
      final window = FindWindow(_utf16(_windowClass), null).value;
      if (window.address == 0) return null;
      final pidBuf = pkgffi.calloc<ffi.Uint32>();
      GetWindowThreadProcessId(window, pidBuf);
      final owner = pidBuf.value;
      pkgffi.calloc.free(pidBuf);
      return owner == ownerPid ? window : null;
    } on Object catch (e) {
      _log.warning('Window probe failed: $e');
      return null;
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
