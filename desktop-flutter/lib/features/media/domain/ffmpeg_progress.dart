// FFmpeg writes progress as `key=value` lines on stdout when
// `-progress pipe:1` is set.

/// Reads the media time reached so far from a progress line.
Duration? parseProgressOutTime(String line) {
  const prefix = 'out_time_us=';
  if (!line.startsWith(prefix)) return null;
  final micros = int.tryParse(line.substring(prefix.length).trim());
  if (micros == null || micros < 0) return null;
  return Duration(microseconds: micros);
}

/// True when the line marks the end of the run.
bool isProgressComplete(String line) => line.trim() == 'progress=end';
