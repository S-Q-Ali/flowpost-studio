export type Platform = 'facebook' | 'instagram' | 'youtube';
export type PostStatus = 'scheduled' | 'published' | 'failed';

export interface Video {
  id: string;
  user_id: string;
  title: string;
  file_url: string | null;
  thumbnail_url: string | null;
  duration: number | null;
  uploaded_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  video_id: string;
  platform: Platform;
  caption: string | null;
  hashtags: string | null;
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
  destination_platforms: string[];
  caption_template: string | null;
  delay_hours: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConnectedAccount {
  id: string;
  user_id: string;
  platform: Platform;
  account_name: string | null;
  is_connected: boolean;
  connected_at: string | null;
}
