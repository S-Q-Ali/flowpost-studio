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
      'YouTube: High-CTR title strictly under 60 characters (no mobile truncation). '
      'YouTube description: First 2 lines high-intent SEO search keywords, followed by core bullet takeaways, ending with #Shorts. '
      'Instagram/Facebook: First line MUST be a scroll-stopping hook under 125 characters (before the "...more" fold). '
      'Use crisp paragraph breaks, tasteful emojis, and a clear CTA (e.g. "Save this", "Share thoughts"). '
      'Include 5-8 targeted hashtags (niche, broad, trending). '
      'TikTok: Ultra-punchy under 120 characters with 3 viral tags. '
      'LinkedIn: Professional contrarian or strategic takeaway with discussion prompt.',
  outputFormat:
      'Return a JSON object with exactly these keys: yt_video_title (string), '
      'yt_video_description (string), fb_ig_caption (string), tiktok_caption '
      '(string), linkedin_caption (string), hashtags (string).',
  exampleOutput: '''
{
  "yt_video_title": "Stop Doing This! The Secret That Changes Everything",
  "yt_video_description": "Discover the essential insight that transformed our approach. In this video, we break down key principles step by step.\\n\\nKey Takeaways:\\n• Why standard methods fail\\n• The one shift you must make\\n\\n#Shorts #Viral #Tips #Strategy",
  "fb_ig_caption": "Most people get this completely backwards... 🤯\\n\\nHere is the exact framework to fix it today.\\n\\nDrop a 🔥 below if this helped and save for later!\\n\\n#ContentCreator #DigitalGrowth #ProTips #Trending #Reels",
  "tiktok_caption": "Wait till the end... you won't believe this 🤯 #fyp #trending #viral #lifehack",
  "linkedin_caption": "The most common mistake teams make early on—and how to overcome it.\\n\\n3 actionable takeaways:\\n1. Focus on core value\\n2. Automate repetitive tasks\\n3. Measure what truly matters\\n\\nWhat is your team's approach? Share below.",
  "hashtags": "#Viral #Trending #Creator #Reels #Growth #Tips"
}''',
  hashtags: '#Viral #Trending #Creator #Reels #Growth #Tips',
  generationInstruction:
      'Analyze the audio transcript and visuals. Generate high-retention, SEO-optimized, '
      'platform-native captions that maximize watch time, engagement, and click-through rate.',
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
