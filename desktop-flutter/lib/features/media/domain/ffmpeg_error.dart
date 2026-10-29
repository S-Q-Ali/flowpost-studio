/// Turns FFmpeg's stderr into a short reason a user can act on.
///
/// FFmpeg stderr carries library prefixes, absolute paths and whatever the
/// file itself carries, so the raw output never reaches the screen: the
/// prefix is dropped, the source path is replaced and any other path is
/// masked.
String ffmpegErrorReason(String stderr, {String? sourcePath}) {
  final lines = stderr
      .split('\n')
      .map((line) => line.trim())
      .where((line) => line.isNotEmpty)
      .toList();
  if (lines.isEmpty) return 'The file could not be processed.';
  // FFmpeg ends its output with the file it choked on, so the line that
  // names the error is the useful one.
  final error = lines.firstWhere(
    (line) => line.toLowerCase().contains('error'),
    orElse: () => lines.last,
  );
  return _mask(_stripPrefix(error), sourcePath);
}

final RegExp _prefixPattern = RegExp(r'^\[[^\]]*\]\s*');

/// A Windows path, spaces included: the match runs on to the next colon, so
/// `C:\Users\Jane Doe\clip.mp4` is masked whole instead of up to its first
/// space.
final RegExp _windowsPathPattern = RegExp(
  r'[A-Za-z]:\\(?:[^\n:*?"<>|]*\\)*[^\n:*?"<>|]*',
);

/// A UNC path such as `\\server\share\clip.mp4`.
final RegExp _uncPathPattern = RegExp(r'\\\\[^\n:*?"<>|]+');

final RegExp _controlPattern = RegExp(r'[\x00-\x1f\x7f]');

String _stripPrefix(String line) => line.replaceFirst(_prefixPattern, '');

String _mask(String line, String? sourcePath) {
  var value = line;
  for (final path in _knownPaths(sourcePath)) {
    value = value.replaceAll(path, 'the file');
  }
  value = value.replaceAll(_windowsPathPattern, 'the file');
  value = value.replaceAll(_uncPathPattern, 'the file');
  value = value.replaceAll(_controlPattern, ' ');
  return value.trim();
}

/// The paths the job already knows: the source as it was handed over, the
/// same path with forward slashes, and the file name on its own.
List<String> _knownPaths(String? sourcePath) {
  if (sourcePath == null || sourcePath.isEmpty) return const [];
  final paths = <String>{sourcePath};
  final slashed = sourcePath.replaceAll('\\', '/');
  if (slashed != sourcePath) paths.add(slashed);
  final name = sourcePath.split(RegExp(r'[/\\]')).last;
  if (name.isNotEmpty && name != sourcePath) paths.add(name);
  return paths.toList();
}
