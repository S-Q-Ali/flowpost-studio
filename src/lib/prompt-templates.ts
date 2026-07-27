export interface MasterPrompt {
  strict_rules: string;
  output_format: string;
  example_output: string;
  hashtags: string;
  generation_instruction: string;
  raw_prompt?: string;
}

export interface PromptTemplate {
  name: string;
  description: string;
  prompt: MasterPrompt;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    name: "Wrestling / Viral",
    description: "Hype-driven, short-form wrestling content for all platforms",
    prompt: {
      strict_rules:
        "Titles must be UNDER 60 characters. Facebook/Instagram/TikTok captions must be under 150 characters. LinkedIn captions can be up to 300 characters. Each caption must start with a hook (question or bold statement). Use 3-5 relevant hashtags per platform. Never use clickbait that misrepresents the content. Always mention the wrestler names if identifiable from transcript.",
      output_format:
        "Return a JSON object with exactly these keys: yt_video_title (string), yt_video_description (string, 2-3 sentences), fb_ig_caption (string), tiktok_caption (string), linkedin_caption (string).",
      example_output: `{
  "yt_video_title": "JOHN CENA RETURNS! Shocking Royal Rumble Moment",
  "yt_video_description": "Watch the electrifying moment John Cena made his surprise return at the Royal Rumble. The crowd erupts as the 16-time champion enters at #30. Full analysis and reaction inside.",
  "fb_ig_caption": "YOU WON'T BELIEVE WHO JUST RETURNED 😱 John Cena is BACK at the Royal Rumble! Drop a 🔥 if you're hyped! #WWE #RoyalRumble #JohnCena",
  "tiktok_caption": "POV: John Cena returns and the crowd goes WILD 🚨 #wwe #johncena #royalrumble",
  "linkedin_caption": "John Cena's surprise return at the Royal Rumble demonstrates the enduring power of brand legacy in sports entertainment. Key takeaway: authentic moments create unscriptable engagement."
}`,
      hashtags: "#WWE #Wrestling #Viral #SportsEntertainment #Highlight",
      generation_instruction:
        "Generate platform-optimized captions for this wrestling/viral video content. Use the transcript to identify key moments, wrestlers, and reactions. Title must be punchy and SEO-friendly. Keep short-form platform captions tight and engaging. LinkedIn can be more analytical.",
    },
  },
  {
    name: "Gaming / Trendy",
    description: "Fast-paced gaming clips, montages, and streaming highlights",
    prompt: {
      strict_rules:
        "Titles max 60 characters. Captions max 120 characters for TikTok/IG, 200 for FB, 300 for LinkedIn. Use gaming slang naturally. Include 3 relevant gaming hashtags. Add a call-to-action like 'follow for more' or 'like if you agree'. Never spoil major game plot points without warning.",
      output_format:
        "Return a JSON object with exactly these keys: yt_video_title (string), yt_video_description (string, 1-2 sentences), fb_ig_caption (string), tiktok_caption (string), linkedin_caption (string).",
      example_output: `{
  "yt_video_title": "INSANE Valorant Clutch | 1v5 Ace Moments",
  "yt_video_description": "Caught this insane 1v5 ace in Valorant ranked. Every shot landed perfectly. Full clutch breakdown and reaction included.",
  "fb_ig_caption": "When the enemy team thought they had you 💀 1v5 ACE in Valorant ranked! What's your best clutch moment? Drop it below 👇 #Valorant #Gaming #Clutch",
  "tiktok_caption": "1v5 ace with zero HP left 😱 #valorant #gaming #fyp #clutch",
  "linkedin_caption": "5 lessons from a high-pressure 1v5 clutch in Valorant: 1) Stay calm under pressure 2) Predict opponent patterns 3) Trust your mechanics 4) Use utility wisely 5) Never give up.",
  "hashtags": "#Valorant #Gaming #Esports #Clutch #FYP"
}`,
      hashtags: "#Gaming #Esports #Valorant #Clutch #FYP",
      generation_instruction:
        "Generate platform-optimized gaming content captions. Keep energy high, use gaming terminology naturally. TikTok/IG should feel native to those platforms. LinkedIn can frame gaming as lessons in strategy and teamwork.",
    },
  },
  {
    name: "Dance / Funny",
    description: "Dance trends, comedy skits, and entertaining short-form content",
    prompt: {
      strict_rules:
        "Keep captions LIGHT and FUN. TikTok/IG captions max 100 characters. Use emojis liberally. Include the dance trend or sound name if identifiable. Facebook captions max 200 characters. LinkedIn captions optional — keep professional but light. Add 2-4 trending hashtags.",
      output_format:
        "Return a JSON object with exactly these keys: yt_video_title (string), yt_video_description (string), fb_ig_caption (string), tiktok_caption (string), linkedin_caption (string).",
      example_output: `{
  "yt_video_title": "Try Not to Laugh Challenge EPIC FAILS",
  "yt_video_description": "We tried the viral 'Try Not to Laugh' challenge and FAILED miserably 😂 Watch the funniest moments from today's shoot!",
  "fb_ig_caption": "Try not to laugh challenge = epic fail 🤡😂 We lasted 30 seconds before losing it. How long would YOU last? 👇",
  "tiktok_caption": "We literally couldn't stop laughing 😭 #trynottolaugh #fails #funny",
  "linkedin_caption": "Our team bonding session today involved the 'Try Not to Laugh' challenge. Key insight: laughter is the best team-building exercise. 😄",
  "hashtags": "#Funny #Dance #Trending #Comedy #Viral"
}`,
      hashtags: "#Funny #Dance #Trending #Comedy #Viral",
      generation_instruction:
        "Generate fun, lighthearted captions for dance or comedy content. Match the energy of the video. Use emojis, keep it short, make it shareable. LinkedIn should tie it back to a relatable professional angle.",
    },
  },
  {
    name: "Educational / Professional",
    description: "Tutorials, explainers, thought leadership, and professional content",
    prompt: {
      strict_rules:
        "YouTube title max 70 characters (SEO-friendly). Description 2-4 sentences with key learning points. LinkedIn caption can be 300-500 characters with professional insight. TikTok/IG captions max 200 characters — educate briefly. No excessive emojis (max 2). Include 3-5 relevant hashtags. Cite sources if applicable.",
      output_format:
        "Return a JSON object with exactly these keys: yt_video_title (string), yt_video_description (string), fb_ig_caption (string), tiktok_caption (string), linkedin_caption (string).",
      example_output: `{
  "yt_video_title": "How AI is Transforming Content Creation in 2026",
  "yt_video_description": "Discover how artificial intelligence is revolutionizing content creation workflows. From automated editing to AI-powered caption generation, learn the tools and strategies that top creators are using right now.",
  "fb_ig_caption": "AI is changing content creation forever 🚀 Here's what every creator needs to know about the tools shaping 2026. Save this for later!",
  "tiktok_caption": "AI tools every content creator needs in 2026 🤖✨ #AItools #contentcreation #creator",
  "linkedin_caption": "The content creation landscape is shifting dramatically in 2026. AI-powered tools are no longer optional — they're essential for staying competitive.\n\nKey trends:\n• Automated editing reduces turnaround by 60%\n• AI caption generation enables multi-platform publishing at scale\n• Personalization algorithms are getting smarter\n\nWhat tools are you using in your workflow? Share below.",
  "hashtags": "#ContentCreation #AI #Technology #DigitalMarketing #FutureOfWork"
}`,
      hashtags: "#Education #Professional #Tutorial #Learning #HowTo",
      generation_instruction:
        "Generate professional, educational captions that position the content as valuable and authoritative. YouTube title should be search-optimized. LinkedIn should provide substantive insight. Keep TikTok/IG digestible but informative.",
    },
  },
  {
    name: "YouTube Shorts",
    description: "Vertical short-form videos optimized for YouTube Shorts, with cross-platform captions",
    prompt: {
      strict_rules:
        "Titles max 60 characters. YouTube Shorts description max 2 sentences with key CTAs. Facebook/Instagram/TikTok captions max 150 characters. LinkedIn caption max 300 characters. Use 3-5 relevant hashtags. Match the fast-paced, hook-driven style of short-form content. Each caption must start with a strong hook.",
      output_format:
        "Return a JSON object with exactly these keys: yt_video_title (string), yt_video_description (string, 1-2 sentences), fb_ig_caption (string), tiktok_caption (string), linkedin_caption (string).",
      example_output: `{
  "yt_video_title": "This AI Tool Blew My Mind 🤯",
  "yt_video_description": "Testing the latest AI video generator — the results are INSANE. Watch till the end for the best one! #AI #Shorts",
  "fb_ig_caption": "This AI tool just changed the game forever 🤯 Which clip was your favorite? 👇",
  "tiktok_caption": "POV: AI generates video from text 🤖 This is CRAZY #ai #technology #shorts",
  "linkedin_caption": "AI video generation has reached a turning point. Here's what I tested and why it matters for content creators."
}`,
      hashtags: "#Shorts #YouTubeShorts #AI #Viral #ContentCreation",
      generation_instruction:
        "Generate platform-optimized captions for YouTube Shorts / short-form vertical video content. Keep energy high and captions concise. YouTube title should work as a Shorts title (under 60 chars). TikTok/IG should feel native to those platforms.",
    },
  },
];

export function getDefaultMasterPrompt(): MasterPrompt {
  return {
    strict_rules:
      "YouTube titles max 60 characters. Descriptions 2-3 sentences. Facebook/Instagram/TikTok captions max 150 characters. LinkedIn captions max 300 characters. Include 3-5 relevant hashtags. Use the transcript to identify key moments. Match the tone of the video content.",
    output_format:
      'Return a JSON object with exactly these keys: yt_video_title (string), yt_video_description (string), fb_ig_caption (string), tiktok_caption (string), linkedin_caption (string), hashtags (string).',
    example_output: `{
  "yt_video_title": "Amazing Video Title Here",
  "yt_video_description": "Description with 2-3 sentences about the video content.",
  "fb_ig_caption": "Engaging caption for Facebook and Instagram with emojis and CTAs.",
  "tiktok_caption": "Short punchy TikTok caption with relevant hashtags.",
  "linkedin_caption": "Professional LinkedIn caption with insights and takeaways.",
  "hashtags": "#Topic #Category #Relevant #Trending"
}`,
    hashtags: "#Content #Video #Trending #Viral #Creator",
    generation_instruction:
      "Generate platform-optimized captions based on the video transcript. Adapt the tone to each platform's style while keeping the core message consistent.",
  };
}
