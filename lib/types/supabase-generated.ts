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
    PostgrestVersion: "14.5"
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
      aircraft: {
        Row: {
          aircraft_type: string | null
          created_at: string
          id: string
          make: string | null
          model: string | null
          tail_number: string
          updated_at: string
          user_id: string
          year: number | null
        }
        Insert: {
          aircraft_type?: string | null
          created_at?: string
          id?: string
          make?: string | null
          model?: string | null
          tail_number: string
          updated_at?: string
          user_id: string
          year?: number | null
        }
        Update: {
          aircraft_type?: string | null
          created_at?: string
          id?: string
          make?: string | null
          model?: string | null
          tail_number?: string
          updated_at?: string
          user_id?: string
          year?: number | null
        }
        Relationships: []
      }
      issue_observations: {
        Row: {
          action: string
          created_at: string
          id: string
          issue_id: string
          preflight_session_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          issue_id: string
          preflight_session_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          issue_id?: string
          preflight_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_observations_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_observations_preflight_session_id_fkey"
            columns: ["preflight_session_id"]
            isOneToOne: false
            referencedRelation: "preflight_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_types: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      issues: {
        Row: {
          aircraft_id: string
          created_at: string
          current_status: string
          description: string | null
          first_seen_at: string
          id: string
          issue_type_id: string
          last_seen_at: string
          resolved_at: string | null
          updated_at: string
        }
        Insert: {
          aircraft_id: string
          created_at?: string
          current_status?: string
          description?: string | null
          first_seen_at?: string
          id?: string
          issue_type_id: string
          last_seen_at?: string
          resolved_at?: string | null
          updated_at?: string
        }
        Update: {
          aircraft_id?: string
          created_at?: string
          current_status?: string
          description?: string | null
          first_seen_at?: string
          id?: string
          issue_type_id?: string
          last_seen_at?: string
          resolved_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_aircraft_id_fkey"
            columns: ["aircraft_id"]
            isOneToOne: false
            referencedRelation: "aircraft"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_issue_type_id_fkey"
            columns: ["issue_type_id"]
            isOneToOne: false
            referencedRelation: "issue_types"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          created_at: string
          file_name: string | null
          file_size_bytes: number | null
          id: string
          issue_id: string | null
          media_type: string
          mime_type: string | null
          preflight_session_id: string
          quick_tag: string | null
          storage_key: string
          upload_status: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          issue_id?: string | null
          media_type: string
          mime_type?: string | null
          preflight_session_id: string
          quick_tag?: string | null
          storage_key: string
          upload_status?: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          issue_id?: string | null
          media_type?: string
          mime_type?: string | null
          preflight_session_id?: string
          quick_tag?: string | null
          storage_key?: string
          upload_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_preflight_session_id_fkey"
            columns: ["preflight_session_id"]
            isOneToOne: false
            referencedRelation: "preflight_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      preflight_sessions: {
        Row: {
          aircraft_id: string
          created_at: string
          finalized_at: string | null
          id: string
          input_type: string
          notes_text: string | null
          status_color: string | null
          transcript_text: string | null
        }
        Insert: {
          aircraft_id: string
          created_at?: string
          finalized_at?: string | null
          id?: string
          input_type: string
          notes_text?: string | null
          status_color?: string | null
          transcript_text?: string | null
        }
        Update: {
          aircraft_id?: string
          created_at?: string
          finalized_at?: string | null
          id?: string
          input_type?: string
          notes_text?: string | null
          status_color?: string | null
          transcript_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preflight_sessions_aircraft_id_fkey"
            columns: ["aircraft_id"]
            isOneToOne: false
            referencedRelation: "aircraft"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_transcriptions: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          id: string
          language: string | null
          media_asset_id: string
          model: string
          preflight_session_id: string
          started_at: string | null
          transcript_text: string | null
          transcription_status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          language?: string | null
          media_asset_id: string
          model?: string
          preflight_session_id: string
          started_at?: string | null
          transcript_text?: string | null
          transcription_status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          language?: string | null
          media_asset_id?: string
          model?: string
          preflight_session_id?: string
          started_at?: string | null
          transcript_text?: string | null
          transcription_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_transcriptions_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: true
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_transcriptions_preflight_session_id_fkey"
            columns: ["preflight_session_id"]
            isOneToOne: false
            referencedRelation: "preflight_sessions"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
