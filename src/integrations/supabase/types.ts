export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      carousel_items: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          sort_order: number
          video_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          sort_order: number
          video_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          sort_order?: number
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carousel_items_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carousel_items_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_accounts: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_name: string | null
          connected_at: string | null
          display_name: string | null
          id: string
          is_connected: boolean | null
          metadata: Json | null
          platform: string
          refresh_token: string | null
          token_expiry: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          connected_at?: string | null
          display_name?: string | null
          id?: string
          is_connected?: boolean | null
          metadata?: Json | null
          platform: string
          refresh_token?: string | null
          token_expiry?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          connected_at?: string | null
          display_name?: string | null
          id?: string
          is_connected?: boolean | null
          metadata?: Json | null
          platform?: string
          refresh_token?: string | null
          token_expiry?: string | null
          user_id?: string
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          mode: string | null
          state: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          mode?: string | null
          state: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          mode?: string | null
          state?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      page_eligibility: {
        Row: {
          checked_at: string
          criteria_progress: Json | null
          eligibility_bucket: string | null
          id: string
          monetization_tools: Json | null
          page_id: string
          page_name: string | null
          user_id: string
        }
        Insert: {
          checked_at?: string
          criteria_progress?: Json | null
          eligibility_bucket?: string | null
          id?: string
          monetization_tools?: Json | null
          page_id: string
          page_name?: string | null
          user_id: string
        }
        Update: {
          checked_at?: string
          criteria_progress?: Json | null
          eligibility_bucket?: string | null
          id?: string
          monetization_tools?: Json | null
          page_id?: string
          page_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          account_id: string | null
          caption: string | null
          captions_enabled: boolean | null
          contains_altered_content: boolean | null
          created_at: string | null
          fb_ai_label: boolean | null
          hashtags: string | null
          id: string
          metadata: Json | null
          platform: string
          post_type: string
          published_at: string | null
          scheduled_at: string | null
          status: string | null
          user_id: string
          video_id: string | null
          workflow_item_id: string | null
        }
        Insert: {
          account_id?: string | null
          caption?: string | null
          captions_enabled?: boolean | null
          contains_altered_content?: boolean | null
          created_at?: string | null
          fb_ai_label?: boolean | null
          hashtags?: string | null
          id?: string
          metadata?: Json | null
          platform: string
          post_type?: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string | null
          user_id: string
          video_id?: string | null
          workflow_item_id?: string | null
        }
        Update: {
          account_id?: string | null
          caption?: string | null
          captions_enabled?: boolean | null
          contains_altered_content?: boolean | null
          created_at?: string | null
          fb_ai_label?: boolean | null
          hashtags?: string | null
          id?: string
          metadata?: Json | null
          platform?: string
          post_type?: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string | null
          user_id?: string
          video_id?: string | null
          workflow_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_workflow_item_id_fkey"
            columns: ["workflow_item_id"]
            isOneToOne: false
            referencedRelation: "workflow_items"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          attempts: number | null
          created_at: string | null
          id: string
          key: string
          reset_at: string
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          id?: string
          key: string
          reset_at: string
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          id?: string
          key?: string
          reset_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          token: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          token: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          token?: string
          user_id?: string | null
        }
        Relationships: []
      }
      tiktok_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          state: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          state: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          state?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          best_night_date: string | null
          created_at: string | null
          email: string | null
          failed_login_attempts: number | null
          fav_teacher: string | null
          id: string
          is_admin: boolean | null
          lockout_until: string | null
          name: string | null
        }
        Insert: {
          avatar_url?: string | null
          best_night_date?: string | null
          created_at?: string | null
          email?: string | null
          failed_login_attempts?: number | null
          fav_teacher?: string | null
          id?: string
          is_admin?: boolean | null
          lockout_until?: string | null
          name?: string | null
        }
        Update: {
          avatar_url?: string | null
          best_night_date?: string | null
          created_at?: string | null
          email?: string | null
          failed_login_attempts?: number | null
          fav_teacher?: string | null
          id?: string
          is_admin?: boolean | null
          lockout_until?: string | null
          name?: string | null
        }
        Relationships: []
      }
      videos: {
        Row: {
          duration: number | null
          file_url: string | null
          id: string
          media_type: string
          thumbnail_url: string | null
          title: string
          uploaded_at: string | null
          user_id: string
          video_size: number | null
        }
        Insert: {
          duration?: number | null
          file_url?: string | null
          id?: string
          media_type?: string
          thumbnail_url?: string | null
          title: string
          uploaded_at?: string | null
          user_id: string
          video_size?: number | null
        }
        Update: {
          duration?: number | null
          file_url?: string | null
          id?: string
          media_type?: string
          thumbnail_url?: string | null
          title?: string
          uploaded_at?: string | null
          user_id?: string
          video_size?: number | null
        }
        Relationships: []
      }
      workflow_items: {
        Row: {
          created_at: string
          drive_file_id: string
          fb_ig_caption: string | null
          file_name: string
          file_size: number | null
          id: string
          linkedin_caption: string | null
          mime_type: string | null
          platforms_override: string[] | null
          posted_at: string | null
          sort_order: number | null
          status: string
          tiktok_caption: string | null
          workflow_id: string
          yt_video_description: string | null
          yt_video_title: string | null
        }
        Insert: {
          created_at?: string
          drive_file_id: string
          fb_ig_caption?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          linkedin_caption?: string | null
          mime_type?: string | null
          platforms_override?: string[] | null
          posted_at?: string | null
          sort_order?: number | null
          status?: string
          tiktok_caption?: string | null
          workflow_id: string
          yt_video_description?: string | null
          yt_video_title?: string | null
        }
        Update: {
          created_at?: string
          drive_file_id?: string
          fb_ig_caption?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          linkedin_caption?: string | null
          mime_type?: string | null
          platforms_override?: string[] | null
          posted_at?: string | null
          sort_order?: number | null
          status?: string
          tiktok_caption?: string | null
          workflow_id?: string
          yt_video_description?: string | null
          yt_video_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_items_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_locks: {
        Row: {
          expires_at: string
          lock_key: string
          locked_at: string | null
        }
        Insert: {
          expires_at: string
          lock_key: string
          locked_at?: string | null
        }
        Update: {
          expires_at?: string
          lock_key?: string
          locked_at?: string | null
        }
        Relationships: []
      }
      workflows: {
        Row: {
          caption_master_prompt: Json | null
          created_at: string | null
          custom_schedule: Json | null
          data_source: string
          day_time_windows: Json | null
          drive_account_id: string | null
          drive_folder_id: string | null
          facebook_ai_generated: boolean | null
          facebook_page_ids: string[] | null
          id: string
          instagram_account_ids: string[] | null
          instagram_ai_generated: boolean | null
          is_active: boolean | null
          last_manual_triggered_at: string | null
          last_triggered_at: string | null
          linkedin_account_ids: string[] | null
          max_videos_per_trigger: number | null
          media_type: string
          name: string
          platforms: string[] | null
          post_as_story: boolean | null
          run_days: number[] | null
          run_interval_hours: number | null
          scheduling_mode: string
          sheet_id: string | null
          sheet_url: string | null
          tiktok_account_ids: string[] | null
          total_posted: number | null
          trigger_hour_end: number
          trigger_hour_start: number
          updated_at: string | null
          user_id: string
          videos_per_run: number | null
          youtube_altered_content: boolean | null
          youtube_channel_ids: string[] | null
        }
        Insert: {
          caption_master_prompt?: Json | null
          created_at?: string | null
          custom_schedule?: Json | null
          data_source?: string
          day_time_windows?: Json | null
          drive_account_id?: string | null
          drive_folder_id?: string | null
          facebook_ai_generated?: boolean | null
          facebook_page_ids?: string[] | null
          id?: string
          instagram_account_ids?: string[] | null
          instagram_ai_generated?: boolean | null
          is_active?: boolean | null
          last_manual_triggered_at?: string | null
          last_triggered_at?: string | null
          linkedin_account_ids?: string[] | null
          max_videos_per_trigger?: number | null
          media_type?: string
          name: string
          platforms?: string[] | null
          post_as_story?: boolean | null
          run_days?: number[] | null
          run_interval_hours?: number | null
          scheduling_mode?: string
          sheet_id?: string | null
          sheet_url?: string | null
          tiktok_account_ids?: string[] | null
          total_posted?: number | null
          trigger_hour_end?: number
          trigger_hour_start?: number
          updated_at?: string | null
          user_id: string
          videos_per_run?: number | null
          youtube_altered_content?: boolean | null
          youtube_channel_ids?: string[] | null
        }
        Update: {
          caption_master_prompt?: Json | null
          created_at?: string | null
          custom_schedule?: Json | null
          data_source?: string
          day_time_windows?: Json | null
          drive_account_id?: string | null
          drive_folder_id?: string | null
          facebook_ai_generated?: boolean | null
          facebook_page_ids?: string[] | null
          id?: string
          instagram_account_ids?: string[] | null
          instagram_ai_generated?: boolean | null
          is_active?: boolean | null
          last_manual_triggered_at?: string | null
          last_triggered_at?: string | null
          linkedin_account_ids?: string[] | null
          max_videos_per_trigger?: number | null
          media_type?: string
          name?: string
          platforms?: string[] | null
          post_as_story?: boolean | null
          run_days?: number[] | null
          run_interval_hours?: number | null
          scheduling_mode?: string
          sheet_id?: string | null
          sheet_url?: string | null
          tiktok_account_ids?: string[] | null
          total_posted?: number | null
          trigger_hour_end?: number
          trigger_hour_start?: number
          updated_at?: string | null
          user_id?: string
          videos_per_run?: number | null
          youtube_altered_content?: boolean | null
          youtube_channel_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "workflows_drive_account_id_fkey"
            columns: ["drive_account_id"]
            isOneToOne: false
            referencedRelation: "connected_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
