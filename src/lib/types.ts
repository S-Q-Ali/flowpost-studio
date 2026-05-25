export type Platform = 'facebook' | 'instagram' | 'youtube';
export type PostStatus = 'scheduled' | 'processing' | 'published' | 'failed';

export interface Video {
  id: string;
  user_id: string;
  title: string;
  file_url: string | null;
  thumbnail_url: string | null;
  duration: number | null;
  media_type: "video" | "image";
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
  created_at: string;
  videos?: Video;
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
  trigger_hour_start: number;
  trigger_hour_end: number;
  run_interval_hours: number | null;
  videos_per_run: number | null;
  run_days: number[] | null;
  day_time_windows: Record<string, { start: number; end: number }> | null;
  total_posted: number | null;
  scheduling_mode: string | null;
  custom_schedule: Record<string, { start: number; end: number }[]> | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectedAccount {
  id: string;
  user_id: string;
  platform: Platform;
  account_name: string | null;
  account_id?: string | null;
  is_connected: boolean;
  connected_at: string | null;
  token_expiry?: string | null;
  metadata?: unknown;
}
