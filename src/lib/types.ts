export type Platform = 'facebook' | 'instagram' | 'youtube' | 'tiktok' | 'linkedin';
export type PostStatus = 'scheduled' | 'processing' | 'published' | 'failed';

export interface Video {
  id: string;
  user_id: string;
  title: string;
  file_url: string | null;
  thumbnail_url: string | null;
  duration: number | null;
  media_type: "video" | "image";
  video_size: number | null;
  uploaded_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  video_id: string;
  platform: Platform;
  account_id?: string | null;
  caption: string | null;
  hashtags: string | null;
  contains_altered_content?: boolean;
  scheduled_at: string | null;
  published_at: string | null;
  status: PostStatus;
  captions_enabled: boolean;
  workflow_item_id?: string | null;
  created_at: string;
  videos?: Video;
}

export interface MasterPrompt {
  strict_rules: string;
  output_format: string;
  example_output: string;
  hashtags: string;
  generation_instruction: string;
}

export interface Workflow {
  id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  platforms: string[] | null;
  sheet_url: string | null;
  sheet_id: string | null;
  youtube_channel_ids: string[] | null;
  facebook_page_ids: string[] | null;
  instagram_account_ids: string[] | null;
  tiktok_account_ids: string[] | null;
  linkedin_account_ids: string[] | null;
  run_interval_hours: number | null;
  videos_per_run: number | null;
  run_days: number[] | null;
  total_posted: number | null;
  scheduling_mode: string | null;
  custom_schedule: Record<string, { start: number; end: number }[]> | null;
  media_type: "video" | "image";
  post_as_story: boolean;
  youtube_altered_content: boolean;
  drive_account_id: string | null;
  drive_folder_id: string | null;
  data_source: "g_sheet" | "flowpost";
  caption_master_prompt: MasterPrompt | null;
  last_triggered_at: string | null;
  last_manual_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowItem {
  id: string;
  workflow_id: string;
  drive_file_id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  status: "pending" | "ready" | "posted" | "failed";
  yt_video_title: string | null;
  yt_video_description: string | null;
  fb_ig_caption: string | null;
  tiktok_caption: string | null;
  linkedin_caption: string | null;
  platforms_override: string[] | null;
  sort_order: number | null;
  created_at: string;
  posted_at: string | null;
}

export interface ConnectedAccount {
  id: string;
  user_id: string;
  platform: Platform;
  account_name: string | null;
  account_id?: string | null;
  display_name?: string | null;
  is_connected: boolean;
  connected_at: string | null;
  token_expiry?: string | null;
  metadata?: unknown;
}
