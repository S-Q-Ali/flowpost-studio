import 'dart:convert';

/// The prompt template the caption model receives.
///
/// Mirrors `MasterPrompt` in `src/lib/prompt-templates.ts`. The keys are
/// snake_case on purpose: this JSON is the prompt text the model reads, not
/// a Dart API.
class MasterPrompt {
  const MasterPrompt({
    required this.strictRules,
    required this.outputFormat,
    required this.exampleOutput,
    required this.hashtags,
    required this.generationInstruction,
  });

  final String strictRules;
  final String outputFormat;
  final String exampleOutput;
  final String hashtags;
  final String generationInstruction;

  Map<String, dynamic> toJson() => {
    'strict_rules': strictRules,
    'output_format': outputFormat,
    'example_output': exampleOutput,
    'hashtags': hashtags,
    'generation_instruction': generationInstruction,
  };
}

/// The prompt used when the user has not chosen one of their own.
///
/// The same text as `getDefaultMasterPrompt()` in `src/lib/prompt-templates.ts`.
const MasterPrompt defaultMasterPrompt = MasterPrompt(
  strictRules:
      'YouTube titles max 60 characters. Descriptions 2-3 sentences. '
      'Facebook/Instagram/TikTok captions max 150 characters. LinkedIn '
      'captions max 300 characters. Include 3-5 relevant hashtags. Use the '
      'transcript to identify key moments. Match the tone of the video '
      'content.',
  outputFormat:
      'Return a JSON object with exactly these keys: yt_video_title (string), '
      'yt_video_description (string), fb_ig_caption (string), tiktok_caption '
      '(string), linkedin_caption (string), hashtags (string).',
  exampleOutput: '''
{
  "yt_video_title": "Amazing Video Title Here",
  "yt_video_description": "Description with 2-3 sentences about the video content.",
  "fb_ig_caption": "Engaging caption for Facebook and Instagram with emojis and CTAs.",
  "tiktok_caption": "Short punchy TikTok caption with relevant hashtags.",
  "linkedin_caption": "Professional LinkedIn caption with insights and takeaways.",
  "hashtags": "#Topic #Category #Relevant #Trending"
}''',
  hashtags: '#Content #Video #Trending #Viral #Creator',
  generationInstruction:
      'Generate platform-optimized captions based on the video transcript. '
      'Adapt the tone to each platform\'s style while keeping the core '
      'message consistent.',
);

/// The caption keys each platform accepts.
///
/// The same map as `PLATFORM_ALLOWED_KEYS` in `src/lib/captions.ts` and in
/// the `generate-ai-captions` edge function.
const Map<String, List<String>> platformAllowedCaptionKeys = {
  'youtube': ['yt_video_title', 'yt_video_description'],
  'facebook': ['fb_ig_caption', 'caption'],
  'instagram': ['fb_ig_caption', 'caption'],
  'tiktok': ['tiktok_caption'],
  'linkedin': ['linkedin_caption'],
};

/// The label to show for each caption key.
const Map<String, String> captionKeyLabels = {
  'yt_video_title': 'YouTube title',
  'yt_video_description': 'YouTube description',
  'fb_ig_caption': 'Facebook / Instagram caption',
  'caption': 'Caption',
  'tiktok_caption': 'TikTok caption',
  'linkedin_caption': 'LinkedIn caption',
  'hashtags': 'Hashtags',
};

/// The caption keys the chosen platforms allow, or null when every key is
/// allowed because no platform was chosen.
Set<String>? allowedCaptionKeys(List<String> platforms) {
  if (platforms.isEmpty) return null;
  final keys = <String>{};
  for (final platform in platforms) {
    keys.addAll(platformAllowedCaptionKeys[platform] ?? const []);
  }
  return keys;
}

/// The system message that carries the template and the platform hint.
String buildSystemPrompt({
  required String fileName,
  required MasterPrompt prompt,
  List<String> platforms = const [],
}) {
  final platformHint = platforms.isEmpty
      ? ''
      : '\n\nIMPORTANT: Only generate captions for these platforms: '
            '${platforms.join(', ')}.';

  final promptJson = const JsonEncoder.withIndent('  ')
      .convert(prompt.toJson());

  return 'You are an expert social media content strategist. Generate captions '
      'for a video file named "$fileName".\n\n'
      'Follow this prompt template EXACTLY — return valid JSON matching the '
      'output_format below.\n\n'
      '$promptJson'
      '$platformHint\n\n'
      'Return ONLY valid JSON — no markdown, no code fences, no explanation.';
}

/// The user message that carries what the audio and the frames said.
String buildUserMessage({
  required String transcript,
  required String visualDescription,
}) {
  return 'Audio transcript:\n\n${transcript.isEmpty ? 'No transcript available.' : transcript}'
      '\n\nVisual description:\n\n${visualDescription.isEmpty ? 'No visual description available.' : visualDescription}';
}
