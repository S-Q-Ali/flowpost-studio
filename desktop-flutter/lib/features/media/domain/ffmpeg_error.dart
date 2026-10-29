/// Turns FFmpeg's stderr into a short reason a user can act on.
///
/// FFmpeg stderr carries library prefixes and absolute paths, so the raw
/// output never reaches the screen: the bracketed prefix is dropped and any
/// path is replaced before the line is shown.
String ffmpegErrorReason(String stderr) {
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
  return _stripPaths(_stripPrefix(error));
}

final RegExp _prefixPattern = RegExp(r'^\[[^\]]*\]\s*');
final RegExp _pathPattern = RegExp(r'[A-Za-z]:\\[^\s"]+');
final RegExp _quotedPathPattern = RegExp(r'"[^"]*"');

String _stripPrefix(String line) => line.replaceFirst(_prefixPattern, '');

String _stripPaths(String line) {
  final withoutQuoted = line.replaceAll(_quotedPathPattern, 'the file');
  return withoutQuoted.replaceAll(_pathPattern, 'the file');
}
