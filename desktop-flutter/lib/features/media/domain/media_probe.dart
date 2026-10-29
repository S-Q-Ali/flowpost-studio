import 'dart:convert';

import 'media_validation.dart';

/// The codecs a still image uses.
///
/// A file's name is not proof of what it holds: a video can be renamed to
/// `.png` and the pipeline would then skip the duration limit and produce a
/// single frame instead of three.
const Set<String> imageCodecs = {
  'png',
  'mjpeg',
  'webp',
  'bmp',
  'gif',
  'tiff',
  'jpeg',
};

/// The kind the file really is, according to what the probe reports.
MediaKind kindFromProbe(MediaProbe probe) =>
    imageCodecs.contains(probe.videoCodec) ? MediaKind.image : MediaKind.video;

/// Metadata ffprobe reports for a media file (SPEC-media "Model").
class MediaProbe {
  const MediaProbe({
    required this.duration,
    required this.width,
    required this.height,
    required this.videoCodec,
    required this.pixelFormat,
    required this.fps,
    this.audioCodec,
    this.audioSampleRate,
    this.audioChannels,
    this.bitrate,
  });

  final Duration duration;
  final int width;
  final int height;
  final String videoCodec;
  final String pixelFormat;
  final double fps;
  final String? audioCodec;
  final int? audioSampleRate;
  final int? audioChannels;
  final int? bitrate;

  bool get hasAudio => audioCodec != null;
}

/// Raised when ffprobe output cannot be read as media metadata.
class MediaProbeException implements Exception {
  const MediaProbeException(this.message);

  final String message;

  @override
  String toString() => 'MediaProbeException: $message';
}

/// Metadata ffprobe reports for an audio-only file.
class AudioProbe {
  const AudioProbe({
    required this.duration,
    required this.codec,
    required this.sampleRate,
    required this.channels,
  });

  final Duration duration;
  final String codec;
  final int sampleRate;
  final int channels;
}

/// Parses `ffprobe -print_format json` output for an audio file.
AudioProbe parseAudioProbeJson(String source) {
  final Object? decoded;
  try {
    decoded = jsonDecode(source);
  } on FormatException {
    throw const MediaProbeException('Probe output was not valid JSON.');
  }
  if (decoded is! Map<String, dynamic>) {
    throw const MediaProbeException('Probe output was not an object.');
  }

  final streams = decoded['streams'];
  final streamList = streams is List ? streams : const <Object?>[];
  final audio = _firstStream(streamList, 'audio');
  if (audio == null) {
    throw const MediaProbeException('No audio track found.');
  }

  final format = decoded['format'];
  final formatMap = format is Map<String, dynamic> ? format : const {};

  return AudioProbe(
    duration: _duration(
      _string(formatMap['duration']) ?? _string(audio['duration']),
    ),
    codec: _string(audio['codec_name']) ?? '',
    sampleRate: _int(audio['sample_rate']),
    channels: _int(audio['channels']),
  );
}

/// Parses `ffprobe -print_format json` output.
///
/// Values arrive as strings and rationals, and a still image has no duration
/// at all, so every field is read defensively: a missing or unparsable value
/// becomes zero rather than an exception.
MediaProbe parseProbeJson(String source) {
  final Object? decoded;
  try {
    decoded = jsonDecode(source);
  } on FormatException {
    throw const MediaProbeException('Probe output was not valid JSON.');
  }
  if (decoded is! Map<String, dynamic>) {
    throw const MediaProbeException('Probe output was not an object.');
  }

  final streams = decoded['streams'];
  final streamList = streams is List ? streams : const <Object?>[];
  final video = _firstStream(streamList, 'video');
  if (video == null) {
    throw const MediaProbeException('No video track found.');
  }
  final audio = _firstStream(streamList, 'audio');

  final format = decoded['format'];
  final formatMap = format is Map<String, dynamic> ? format : const {};

  return MediaProbe(
    duration: _duration(
      _string(formatMap['duration']) ?? _string(video['duration']),
    ),
    width: _int(video['width']),
    height: _int(video['height']),
    videoCodec: _string(video['codec_name']) ?? '',
    pixelFormat: _string(video['pix_fmt']) ?? '',
    fps: _fps(video['avg_frame_rate']) ?? _fps(video['r_frame_rate']) ?? 0,
    audioCodec: audio == null ? null : _string(audio['codec_name']),
    audioSampleRate: audio == null ? null : _int(audio['sample_rate']),
    audioChannels: audio == null ? null : _int(audio['channels']),
    bitrate: _int(formatMap['bit_rate']),
  );
}

Map<String, dynamic>? _firstStream(List<Object?> streams, String type) {
  for (final entry in streams) {
    if (entry is! Map<String, dynamic>) continue;
    if (entry['codec_type'] == type) return entry;
  }
  return null;
}

String? _string(Object? value) {
  if (value is String && value.isNotEmpty && value != 'N/A') return value;
  return null;
}

int _int(Object? value) {
  if (value is int) return value;
  if (value is double) return value.round();
  if (value is String) return int.tryParse(value) ?? 0;
  return 0;
}

Duration _duration(String? seconds) {
  if (seconds == null) return Duration.zero;
  final value = double.tryParse(seconds);
  if (value == null || value <= 0) return Duration.zero;
  return Duration(microseconds: (value * 1000000).round());
}

/// Reads a rational such as `30/1`; `0/0` means the value is unknown.
double? _fps(Object? value) {
  if (value is! String) return null;
  final parts = value.split('/');
  if (parts.length != 2) return null;
  final numerator = double.tryParse(parts[0]);
  final denominator = double.tryParse(parts[1]);
  if (numerator == null || denominator == null || denominator == 0) return null;
  return numerator / denominator;
}
