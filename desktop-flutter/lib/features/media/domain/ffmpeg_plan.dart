import 'package:path/path.dart' as p;

import 'media_probe.dart';
import 'media_validation.dart';

/// Containers whose streams can be copied into MP4 without re-encoding.
const Set<String> remuxableExtensions = {'.mp4', '.mov', '.m4v'};

const int _maxOutputDimension = 1920;
const String _protocolAllowlist = 'file';

/// True when the source can be copied stream-for-stream into MP4.
bool canRemux({
  required MediaKind kind,
  required String sourcePath,
  required MediaProbe probe,
}) {
  if (kind != MediaKind.video) return false;
  if (!remuxableExtensions.contains(p.extension(sourcePath).toLowerCase())) {
    return false;
  }
  if (probe.videoCodec != 'h264') return false;
  if (probe.pixelFormat != 'yuv420p') return false;
  if (probe.width > _maxOutputDimension) return false;
  if (probe.height > _maxOutputDimension) return false;
  if (probe.hasAudio && probe.audioCodec != 'aac') return false;
  return true;
}

List<String> probeArguments(String sourcePath) => [
  '-v',
  'error',
  '-print_format',
  'json',
  '-show_format',
  '-show_streams',
  '-protocol_whitelist',
  _protocolAllowlist,
  // The source is the last argument, and `--` keeps a path that looks like
  // an option from being read as one.
  '--',
  sourcePath,
];

List<String> remuxArguments({
  required String sourcePath,
  required String outputPath,
}) => [
  ..._inputArguments(sourcePath),
  '-map',
  '0:v:0',
  '-map',
  '0:a:0?',
  '-c',
  'copy',
  '-movflags',
  '+faststart',
  '-map_metadata',
  '-1',
  '-map_chapters',
  '-1',
  ..._progressArguments,
  outputPath,
];

List<String> encodeArguments({
  required String sourcePath,
  required String outputPath,
}) => [
  ..._inputArguments(sourcePath),
  '-map',
  '0:v:0',
  '-map',
  '0:a:0?',
  '-vf',
  "scale=w='min($_maxOutputDimension,iw)':h='min($_maxOutputDimension,ih)'"
      ':force_original_aspect_ratio=decrease:force_divisible_by=2',
  '-c:v',
  'libopenh264',
  '-b:v',
  '4M',
  '-maxrate',
  '5M',
  '-bufsize',
  '8M',
  '-pix_fmt',
  'yuv420p',
  '-g',
  '60',
  '-c:a',
  'aac',
  '-b:a',
  '128k',
  '-ar',
  '48000',
  '-movflags',
  '+faststart',
  '-map_metadata',
  '-1',
  '-map_chapters',
  '-1',
  ..._progressArguments,
  outputPath,
];

List<String> thumbnailArguments({
  required String sourcePath,
  required String outputPath,
  required Duration? at,
}) => [
  ..._baseArguments,
  // A still image has no timeline to seek in, so it is read whole.
  if (at != null) ...['-ss', _seconds(at)],
  '-i',
  sourcePath,
  '-frames:v',
  '1',
  '-vf',
  'scale=640:360:force_original_aspect_ratio=decrease,'
      'pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black',
  '-q:v',
  '6',
  '-map_metadata',
  '-1',
  '-map_chapters',
  '-1',
  outputPath,
];

List<String> frameArguments({
  required String sourcePath,
  required String outputPath,
  required Duration? at,
}) => [
  ..._baseArguments,
  if (at != null) ...['-ss', _seconds(at)],
  '-i',
  sourcePath,
  '-frames:v',
  '1',
  '-vf',
  'scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2',
  '-q:v',
  '6',
  '-map_metadata',
  '-1',
  '-map_chapters',
  '-1',
  outputPath,
];

List<String> audioArguments({
  required String sourcePath,
  required String outputPath,
}) => [
  ..._inputArguments(sourcePath),
  '-map',
  '0:a:0',
  '-vn',
  '-c:a',
  'libmp3lame',
  '-b:a',
  '32k',
  '-ar',
  '16000',
  '-ac',
  '1',
  '-map_metadata',
  '-1',
  '-map_chapters',
  '-1',
  outputPath,
];

/// The caption-frame timestamps, matching the web pipeline
/// (`src/lib/captions.ts`): `min(2, d/2)`, `d/2`, `max(d-2, d/2)`.
List<Duration> frameTimestamps(Duration duration) {
  final total = duration.inMicroseconds;
  final half = total ~/ 2;
  final first = total < 4000000 ? half : 2000000;
  final tail = total - 2000000;
  final last = tail > half ? tail : half;
  return [
    Duration(microseconds: first),
    Duration(microseconds: half),
    Duration(microseconds: last),
  ];
}

/// A still image has one frame at zero.
List<Duration> frameTimestampsForKind(MediaKind kind, Duration duration) =>
    kind == MediaKind.image ? [Duration.zero] : frameTimestamps(duration);

/// The thumbnail sits at one second, or halfway through a shorter clip.
Duration thumbnailTimestamp(Duration duration) {
  final half = Duration(microseconds: duration.inMicroseconds ~/ 2);
  return half < const Duration(seconds: 1) ? half : const Duration(seconds: 1);
}

List<String> _inputArguments(String sourcePath) => [
  ..._baseArguments,
  '-i',
  sourcePath,
];

const List<String> _baseArguments = [
  '-hide_banner',
  '-nostdin',
  '-y',
  '-protocol_whitelist',
  _protocolAllowlist,
];

const List<String> _progressArguments = ['-progress', 'pipe:1', '-nostats'];

String _seconds(Duration value) =>
    (value.inMicroseconds / 1000000).toStringAsFixed(3);
