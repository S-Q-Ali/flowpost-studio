import 'dart:io';

import 'package:path/path.dart' as p;

/// Locates the bundled FFmpeg executables.
///
/// The installed app keeps them next to the executable in `ffmpeg\bin`; a
/// developer checkout uses `third_party\ffmpeg\bin`. `FLOWPOST_FFMPEG_DIR`
/// overrides both and exists for the fixture tests.
class FfmpegPaths {
  const FfmpegPaths({required this.ffmpeg, required this.ffprobe});

  final String ffmpeg;
  final String ffprobe;

  static const String environmentVariable = 'FLOWPOST_FFMPEG_DIR';

  /// Resolves the executables, or returns null when FFmpeg is not installed.
  static Future<FfmpegPaths?> locate() async {
    for (final directory in await candidateDirectories()) {
      final ffmpeg = File(p.join(directory, 'ffmpeg.exe'));
      final ffprobe = File(p.join(directory, 'ffprobe.exe'));
      if (await ffmpeg.exists() && await ffprobe.exists()) {
        return FfmpegPaths(ffmpeg: ffmpeg.path, ffprobe: ffprobe.path);
      }
    }
    return null;
  }

  /// The directories to search, most specific first.
  static Future<List<String>> candidateDirectories() async {
    final override = Platform.environment[environmentVariable];
    if (override != null && override.isNotEmpty) {
      return [override];
    }
    final directories = <String>[];
    final executableDirectory = p.dirname(Platform.resolvedExecutable);
    directories.add(p.join(executableDirectory, 'ffmpeg', 'bin'));
    directories.add(
      p.join(Directory.current.path, 'third_party', 'ffmpeg', 'bin'),
    );
    return directories;
  }
}
