import 'dart:convert';
import 'dart:io';

import '../domain/caption_processing.dart';
import '../domain/caption_prompt.dart';

/// What the caption service answered.
class CaptionReply {
  const CaptionReply({required this.statusCode, required this.body});

  final int statusCode;

  /// The parsed JSON body. Empty when the answer was not JSON.
  final Map<String, dynamic> body;
}

/// Carries one request to the caption service.
abstract class CaptionTransport {
  Future<CaptionReply> post({
    required Uri url,
    required Map<String, dynamic> body,
    String? token,
  });

  /// Aborts the request in flight.
  void cancel();
}

/// The three calls the caption pipeline makes.
///
/// The interface keeps the generator testable without an HTTP server.
abstract class CaptionsApi {
  /// The transcript of the audio track.
  Future<String> transcribe({
    required String audioBase64,
    required String filename,
  });

  /// What the caption frames show.
  Future<String> describeFrames({required List<String> frames});

  /// The captions themselves.
  Future<Map<String, String>> generateCaptions({
    required String systemPrompt,
    required String userMessage,
    List<String> platforms,
  });

  /// Aborts the call in flight.
  void cancel();
}

/// Talks to the `generate-ai-captions` edge function.
///
/// The function is a Groq proxy, so the client sends the model's own request
/// shape and reads the answer back (SPEC-media "Captions contract").
class CaptionsClient implements CaptionsApi {
  CaptionsClient({
    required this.endpoint,
    required this.token,
    CaptionTransport? transport,
  }) : _transport = transport ?? HttpCaptionTransport();

  /// The full URL of the edge function.
  final Uri endpoint;

  /// The session token. Null while there is no identity, and then nothing
  /// is sent.
  final String? token;

  final CaptionTransport _transport;

  /// The transcript of the audio track.
  @override
  Future<String> transcribe({
    required String audioBase64,
    required String filename,
  }) async {
    final reply = await _post({
      'mode': 'groq-transcribe',
      'audio_base64': audioBase64,
      'filename': filename,
    });
    final transcript = reply.body['transcript'];
    if (transcript is! String) {
      throw const CaptionException('The transcription came back empty.');
    }
    return transcript;
  }

  /// What the caption frames show.
  @override
  Future<String> describeFrames({required List<String> frames}) async {
    final content = <Map<String, dynamic>>[
      {'type': 'text', 'text': _analysisPrompt},
      for (final frame in frames)
        {
          'type': 'image_url',
          'image_url': {'url': frame},
        },
    ];
    final reply = await _post({
      'mode': 'groq-chat',
      'model': _describeModel,
      'messages': [
        {'role': 'user', 'content': content},
      ],
      'temperature': 0.6,
      'max_tokens': 512,
    });
    return _chatContent(reply);
  }

  /// The captions themselves.
  @override
  Future<Map<String, String>> generateCaptions({
    required String systemPrompt,
    required String userMessage,
    List<String> platforms = const [],
  }) async {
    final reply = await _post({
      'mode': 'groq-chat',
      'model': _captionModel,
      'messages': [
        {'role': 'system', 'content': systemPrompt},
        {'role': 'user', 'content': userMessage},
      ],
      'temperature': 0.7,
      'max_tokens': 4096,
    });
    final captions = parseCaptionJson(_chatContent(reply));
    final allowed = allowedCaptionKeys(platforms);
    if (allowed == null) return captions;
    return {
      for (final entry in captions.entries)
        if (allowed.contains(entry.key)) entry.key: entry.value,
    };
  }

  /// Aborts the request in flight.
  @override
  void cancel() => _transport.cancel();

  Future<CaptionReply> _post(Map<String, dynamic> body) async {
    final token = this.token;
    if (token == null || token.isEmpty) {
      throw const CaptionException('Sign in required to generate captions.');
    }
    final reply = await _transport.post(
      url: endpoint,
      body: body,
      token: token,
    );
    if (reply.statusCode < 200 || reply.statusCode >= 300) {
      final error = reply.body['error'];
      throw CaptionException(
        error is String && error.isNotEmpty
            ? error
            : 'The caption service returned an error (${reply.statusCode}).',
      );
    }
    return reply;
  }
}

/// The models the caption service allows.
const String _describeModel = 'qwen/qwen3.6-27b';
const String _captionModel = 'openai/gpt-oss-120b';

/// The same analysis prompt as `src/lib/captions.ts`.
const String _analysisPrompt =
    'Analyze these video frames in detail. Identify any celebrities, athletes, '
    'streamers, or well-known personalities visible. Be specific — use full '
    'names (e.g. \'Cristiano Ronaldo\', \'iShowSpeed\'). Describe: setting, '
    'people/objects, actions, mood, text overlays, and overall vibe. This will '
    'be used alongside an audio transcript to generate social media captions.';

/// The captions the model returned, as a map of key to caption.
Map<String, String> parseCaptionJson(String content) {
  var cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replaceFirst(
      RegExp(r'^```(?:json)?\s*', caseSensitive: false),
      '',
    );
    cleaned = cleaned.replaceFirst(
      RegExp(r'\s*```$', caseSensitive: false),
      '',
    );
  }
  final Object? decoded;
  try {
    decoded = jsonDecode(cleaned);
  } on FormatException {
    throw const CaptionException(
      'The caption service did not return usable captions.',
    );
  }
  if (decoded is! Map) {
    throw const CaptionException(
      'The caption service did not return usable captions.',
    );
  }
  return {
    for (final entry in decoded.entries)
      if (entry.value is String) entry.key as String: entry.value as String,
  };
}

/// The message the model answered with.
String _chatContent(CaptionReply reply) {
  final choices = reply.body['choices'];
  if (choices is! List || choices.isEmpty) {
    throw const CaptionException(
      'The caption service returned an unexpected answer.',
    );
  }
  final first = choices.first;
  if (first is! Map) {
    throw const CaptionException(
      'The caption service returned an unexpected answer.',
    );
  }
  final message = first['message'];
  if (message is! Map) {
    throw const CaptionException(
      'The caption service returned an unexpected answer.',
    );
  }
  final content = message['content'];
  if (content is! String) {
    throw const CaptionException(
      'The caption service returned an unexpected answer.',
    );
  }
  return content;
}

/// The real transport: one HTTPS request with the session token.
class HttpCaptionTransport implements CaptionTransport {
  HttpCaptionTransport({HttpClient? client}) : _client = client ?? HttpClient();

  HttpClient _client;

  @override
  Future<CaptionReply> post({
    required Uri url,
    required Map<String, dynamic> body,
    String? token,
  }) async {
    final client = _client;
    final request = await client.postUrl(url);
    request.headers.contentType = ContentType.json;
    if (token != null) {
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
    }
    request.write(jsonEncode(body));
    final response = await request.close();
    final text = await response.transform(utf8.decoder).join();
    Object? decoded;
    try {
      decoded = text.isEmpty ? null : jsonDecode(text);
    } on FormatException {
      decoded = null;
    }
    return CaptionReply(
      statusCode: response.statusCode,
      body: decoded is Map ? Map<String, dynamic>.from(decoded) : const {},
    );
  }

  @override
  void cancel() {
    // Closing the client forcible aborts the request in flight. A fresh one
    // is made for the next call, because a closed client cannot be reused.
    _client.close(force: true);
    _client = HttpClient();
  }
}
