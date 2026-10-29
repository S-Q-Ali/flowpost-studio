import 'dart:io';
import 'dart:math';

import 'package:logging/logging.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Per-job temporary folders under the app cache (SPEC-media "Workspace and
/// cleanup"). Nothing user-supplied becomes a path: job folders are named by
/// an internally generated id.
class MediaWorkspace {
  MediaWorkspace({required this.root, this.log});

  /// The jobs root under the app cache:
  /// `%LOCALAPPDATA%\com.flowpost\FlowPost\media\jobs`.
  static Future<MediaWorkspace> forApplication({Logger? log}) async {
    final cache = await getApplicationCacheDirectory();
    return MediaWorkspace(
      root: Directory(p.join(cache.path, 'media', 'jobs')),
      log: log,
    );
  }

  final Directory root;
  final Logger? log;

  /// Creates `<root>/<jobId>` and returns it.
  Future<Directory> createJob() async {
    final job = Directory(p.join(root.path, newJobId()));
    await job.create(recursive: true);
    return job;
  }

  /// Deletes [job] when it is a job folder the app created and resolves
  /// inside the jobs root. Returns false when the target is refused.
  Future<bool> deleteJob(Directory job) async {
    if (!isJobId(p.basename(job.path))) return false;
    if (!await job.exists()) return true;
    if (!await _isInsideRoot(job.path)) return false;
    try {
      await job.delete(recursive: true);
    } on FileSystemException {
      return false;
    }
    return true;
  }

  /// Removes every leftover job folder. v1 never resumes a job, so a folder
  /// that survived a crash is dead weight.
  Future<void> deleteAllJobs() async {
    if (!await root.exists()) return;
    List<FileSystemEntity> children;
    try {
      children = await root.list().toList();
    } on FileSystemException {
      return;
    }
    for (final child in children) {
      if (child is! Directory) continue;
      // Only folders the app created are ours to delete.
      if (!isJobId(p.basename(child.path))) continue;
      if (await _deleteWithRetry(child)) continue;
      // Only the job id is logged: a full path would leak the user's folders.
      log?.warning(
        'Media job folder left for the next start: ${p.basename(child.path)}',
      );
    }
  }

  Future<bool> _deleteWithRetry(Directory dir) async {
    if (!await _isInsideRoot(dir.path)) return false;
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        await dir.delete(recursive: true);
        return true;
      } on FileSystemException {
        if (attempt == 0) {
          await Future<void>.delayed(const Duration(milliseconds: 250));
        }
      }
    }
    return false;
  }

  /// True when [path] resolves to a location inside the jobs root. Symlinks
  /// and junctions are resolved first, so a link planted in the root cannot
  /// redirect the delete outside it. The root itself is never a target.
  Future<bool> _isInsideRoot(String path) async {
    final rootPath = await _resolve(root.path);
    final target = await _resolve(path);
    if (rootPath == null || target == null) return false;
    if (target == rootPath) return false;
    return p.isWithin(rootPath, target);
  }

  /// Resolves a path to its real location, or null when it cannot be
  /// resolved.
  Future<String?> _resolve(String path) async {
    try {
      return _canonical(await Directory(path).resolveSymbolicLinks());
    } on FileSystemException {
      return null;
    }
  }

  String _canonical(String path) {
    var value = path;
    // Windows resolves to a `\\?\` path, which no path helper understands.
    if (value.startsWith(r'\\?\')) value = value.substring(4);
    value = p.canonicalize(p.absolute(value));
    return Platform.isWindows ? value.toLowerCase() : value;
  }
}

final RegExp _jobIdPattern = RegExp(r'^\d{8}T\d{6}-[0-9a-f]{6}$');

/// True for a folder name the app generated for a job. Anything else in the
/// jobs root is not ours to delete.
bool isJobId(String name) => _jobIdPattern.hasMatch(name);

final Random _random = Random();

/// `yyyyMMddTHHmmss-<6 hex>`, generated internally so a job folder can never
/// carry a user-supplied name.
String newJobId([DateTime? now]) {
  final stamp = now ?? DateTime.now();
  final hex = _random.nextInt(0x1000000).toRadixString(16).padLeft(6, '0');
  final date = '${_two(stamp.year)}${_two(stamp.month)}${_two(stamp.day)}';
  final time = '${_two(stamp.hour)}${_two(stamp.minute)}${_two(stamp.second)}';
  return '$date'
      'T$time-$hex';
}

String _two(int value) => value.toString().padLeft(2, '0');
