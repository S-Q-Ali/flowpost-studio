import 'package:flowpost_desktop/features/media/captions/data/captions_client.dart';
import 'package:flowpost_desktop/features/media/captions/domain/caption_processing.dart';
import 'package:flutter_test/flutter_test.dart';

/// A transport that answers with one canned reply and records what it sent.
class _FakeTransport implements CaptionTransport {
  _FakeTransport(this.reply);

  final CaptionReply reply;

  final List<Map<String, dynamic>> bodies = [];
  final List<String?> tokens = [];
  bool cancelled = false;

  @override
  Future<CaptionReply> post({
    required Uri url,
    required Map<String, dynamic> body,
    String? token,
  }) async {
    bodies.add(body);
    tokens.add(token);
    return reply;
  }

  @override
  void cancel() {
    cancelled = true;
  }
}

CaptionReply _ok(Map<String, dynamic> body) =>
    CaptionReply(statusCode: 200, body: body);

void main() {
  final endpoint = Uri.parse('https://example.supabase.co/functions/v1/x');

  group('transcribe', () {
    test('asks for a transcription and returns the text', () async {
      final transport = _FakeTransport(_ok({'transcript': 'hello there'}));
      final client = CaptionsClient(
        endpoint: endpoint,
        token: 'session-token',
        transport: transport,
      );

      final transcript = await client.transcribe(
        audioBase64: 'AAAA',
        filename: 'audio.mp3',
      );

      expect(transcript, 'hello there');
      expect(transport.bodies.single['mode'], 'groq-transcribe');
      expect(transport.bodies.single['audio_base64'], 'AAAA');
      expect(transport.bodies.single['filename'], 'audio.mp3');
    });

    test('sends the session token', () async {
      final transport = _FakeTransport(_ok({'transcript': 'x'}));
      final client = CaptionsClient(
        endpoint: endpoint,
        token: 'session-token',
        transport: transport,
      );

      await client.transcribe(audioBase64: 'AAAA', filename: 'audio.mp3');

      expect(transport.tokens.single, 'session-token');
    });
  });

  group('describeFrames', () {
    test('sends the frames as data URLs and returns the description', () async {
      final transport = _FakeTransport(
        _ok({
          'choices': [
            {
              'message': {'content': 'a beach at sunset'},
            },
          ],
        }),
      );
      final client = CaptionsClient(
        endpoint: endpoint,
        token: 'session-token',
        transport: transport,
      );

      final description = await client.describeFrames(
        frames: ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB'],
      );

      expect(description, 'a beach at sunset');
      final body = transport.bodies.single;
      expect(body['mode'], 'groq-chat');
      expect(body['model'], 'qwen/qwen3.6-27b');
      expect(body['temperature'], 0.6);
      expect(body['max_tokens'], 512);
      final content = (body['messages'] as List).first['content'] as List;
      expect(
        content.where((part) => part['type'] == 'image_url'),
        hasLength(2),
      );
    });
  });

  group('generateCaptions', () {
    test(
      'sends the system and user messages and returns the captions',
      () async {
        final transport = _FakeTransport(
          _ok({
            'choices': [
              {
                'message': {
                  'content': '{"yt_video_title": "A title", "tiktok_caption": "A caption"}',
                },
              },
            ],
          }),
        );
        final client = CaptionsClient(
          endpoint: endpoint,
          token: 'session-token',
          transport: transport,
        );

        final captions = await client.generateCaptions(
          systemPrompt: 'the system message',
          userMessage: 'the user message',
        );

        expect(captions, {
          'yt_video_title': 'A title',
          'tiktok_caption': 'A caption',
        });
        final body = transport.bodies.single;
        expect(body['model'], 'openai/gpt-oss-120b');
        expect(body['temperature'], 0.7);
        expect(body['max_tokens'], 4096);
        final messages = body['messages'] as List;
        expect(messages.first['role'], 'system');
        expect(messages.first['content'], 'the system message');
        expect(messages.last['role'], 'user');
        expect(messages.last['content'], 'the user message');
      },
    );

    test('reads captions wrapped in a code fence', () async {
      final transport = _FakeTransport(
        _ok({
          'choices': [
            {
              'message': {
                'content': '```json\n{"tiktok_caption": "A caption"}\n```',
              },
            },
          ],
        }),
      );
      final client = CaptionsClient(
        endpoint: endpoint,
        token: 'session-token',
        transport: transport,
      );

      final captions = await client.generateCaptions(
        systemPrompt: 'system',
        userMessage: 'user',
      );

      expect(captions, {'tiktok_caption': 'A caption'});
    });

    test('drops the keys the chosen platforms do not allow', () async {
      final transport = _FakeTransport(
        _ok({
          'choices': [
            {
              'message': {
                'content': '{"yt_video_title": "A title", "tiktok_caption": "A caption"}',
              },
            },
          ],
        }),
      );
      final client = CaptionsClient(
        endpoint: endpoint,
        token: 'session-token',
        transport: transport,
      );

      final captions = await client.generateCaptions(
        systemPrompt: 'system',
        userMessage: 'user',
        platforms: const ['tiktok'],
      );

      expect(captions, {'tiktok_caption': 'A caption'});
    });

    test(
      'an answer that is not JSON fails instead of returning nothing',
      () async {
        final transport = _FakeTransport(
          _ok({
            'choices': [
              {
                'message': {'content': 'I am afraid I cannot do that.'},
              },
            ],
          }),
        );
        final client = CaptionsClient(
          endpoint: endpoint,
          token: 'session-token',
          transport: transport,
        );

        await expectLater(
          client.generateCaptions(systemPrompt: 'system', userMessage: 'user'),
          throwsA(isA<CaptionException>()),
        );
      },
    );

    test('an answer without a choice fails', () async {
      final transport = _FakeTransport(_ok({'choices': []}));
      final client = CaptionsClient(
        endpoint: endpoint,
        token: 'session-token',
        transport: transport,
      );

      await expectLater(
        client.generateCaptions(systemPrompt: 'system', userMessage: 'user'),
        throwsA(isA<CaptionException>()),
      );
    });
  });

  group('failures', () {
    test('the message from the service is shown to the user', () async {
      final transport = _FakeTransport(
        const CaptionReply(
          statusCode: 500,
          body: {'error': 'Groq API key not configured'},
        ),
      );
      final client = CaptionsClient(
        endpoint: endpoint,
        token: 'session-token',
        transport: transport,
      );

      await expectLater(
        client.generateCaptions(systemPrompt: 'system', userMessage: 'user'),
        throwsA(
          isA<CaptionException>().having(
            (error) => error.message,
            'message',
            'Groq API key not configured',
          ),
        ),
      );
    });

    test('a failure without a message still says something', () async {
      final transport = _FakeTransport(
        const CaptionReply(statusCode: 502, body: {}),
      );
      final client = CaptionsClient(
        endpoint: endpoint,
        token: 'session-token',
        transport: transport,
      );

      await expectLater(
        client.generateCaptions(systemPrompt: 'system', userMessage: 'user'),
        throwsA(
          isA<CaptionException>().having(
            (error) => error.message,
            'message',
            contains('502'),
          ),
        ),
      );
    });

    test('without a session token nothing is sent', () async {
      final transport = _FakeTransport(_ok({'transcript': 'x'}));
      final client = CaptionsClient(
        endpoint: endpoint,
        token: null,
        transport: transport,
      );

      await expectLater(
        client.transcribe(audioBase64: 'AAAA', filename: 'audio.mp3'),
        throwsA(
          isA<CaptionException>().having(
            (error) => error.message,
            'message',
            contains('Sign in required'),
          ),
        ),
      );
      expect(transport.bodies, isEmpty);
    });
  });
}
