import 'package:flowpost_desktop/features/media/captions/domain/caption_prompt.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('defaultMasterPrompt', () {
    test('carries the five fields the web prompt has', () {
      expect(defaultMasterPrompt.toJson().keys, {
        'strict_rules',
        'output_format',
        'example_output',
        'hashtags',
        'generation_instruction',
      });
    });

    test('names every caption key the model has to return', () {
      final format = defaultMasterPrompt.toJson()['output_format'] as String;

      for (final key in const [
        'yt_video_title',
        'yt_video_description',
        'fb_ig_caption',
        'tiktok_caption',
        'linkedin_caption',
      ]) {
        expect(format, contains(key));
      }
    });
  });

  group('allowedCaptionKeys', () {
    test('maps every platform to the keys the web allows', () {
      expect(allowedCaptionKeys(['youtube']), {
        'yt_video_title',
        'yt_video_description',
      });
      expect(allowedCaptionKeys(['facebook']), {'fb_ig_caption', 'caption'});
      expect(allowedCaptionKeys(['instagram']), {'fb_ig_caption', 'caption'});
      expect(allowedCaptionKeys(['tiktok']), {'tiktok_caption'});
      expect(allowedCaptionKeys(['linkedin']), {'linkedin_caption'});
    });

    test('unions the keys of several platforms', () {
      expect(allowedCaptionKeys(['youtube', 'tiktok']), {
        'yt_video_title',
        'yt_video_description',
        'tiktok_caption',
      });
    });

    test('keeps every key when no platform is chosen', () {
      expect(allowedCaptionKeys(const []), isNull);
    });

    test('drops the keys of a platform that is not chosen', () {
      expect(allowedCaptionKeys(['tiktok']), isNot(contains('fb_ig_caption')));
    });
  });

  group('buildSystemPrompt', () {
    test('names the file and carries the prompt as JSON', () {
      final prompt = buildSystemPrompt(
        fileName: 'holiday.mp4',
        prompt: defaultMasterPrompt,
      );

      expect(prompt, contains('holiday.mp4'));
      expect(prompt, contains('"strict_rules"'));
      expect(prompt, contains('"generation_instruction"'));
    });

    test('asks for the chosen platforms only', () {
      final prompt = buildSystemPrompt(
        fileName: 'holiday.mp4',
        prompt: defaultMasterPrompt,
        platforms: const ['tiktok', 'youtube'],
      );

      expect(prompt, contains('Only generate captions for these platforms'));
      expect(prompt, contains('tiktok'));
      expect(prompt, contains('youtube'));
    });

    test('leaves the platform hint out when no platform is chosen', () {
      final prompt = buildSystemPrompt(
        fileName: 'holiday.mp4',
        prompt: defaultMasterPrompt,
      );

      expect(prompt, isNot(contains('Only generate captions')));
    });
  });

  group('buildUserMessage', () {
    test('carries the transcript and the visual description', () {
      final message = buildUserMessage(
        transcript: 'a short greeting',
        visualDescription: 'a beach at sunset',
      );

      expect(message, contains('a short greeting'));
      expect(message, contains('a beach at sunset'));
    });

    test('says so when there is nothing to work with', () {
      final message = buildUserMessage(transcript: '', visualDescription: '');

      expect(message, contains('No transcript available.'));
      expect(message, contains('No visual description available.'));
    });
  });
}
