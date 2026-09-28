// Archivo generado desde Supabase (generate_typescript_types). No lo edites a mano:
// volvé a generarlo después de cada migración.

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
  public: {
    Tables: {
      admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          at: string
          detail: Json
          entity: string
          entity_id: string | null
          id: number
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          at?: string
          detail?: Json
          entity: string
          entity_id?: string | null
          id?: never
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          at?: string
          detail?: Json
          entity?: string
          entity_id?: string | null
          id?: never
        }
        Relationships: []
      }
      crm_consents: {
        Row: {
          granted: boolean
          id: string
          kind: string
          lead_id: string | null
          person_id: string
          recorded_at: string
          recorded_by: string | null
          recorded_by_email: string | null
          source: string
        }
        Insert: {
          granted: boolean
          id?: string
          kind: string
          lead_id?: string | null
          person_id: string
          recorded_at?: string
          recorded_by?: string | null
          recorded_by_email?: string | null
          source: string
        }
        Update: {
          granted?: boolean
          id?: string
          kind?: string
          lead_id?: string | null
          person_id?: string
          recorded_at?: string
          recorded_by?: string | null
          recorded_by_email?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_consents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_consents_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crm_people"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_data_requests: {
        Row: {
          channel: string
          code: string
          created_at: string
          created_by: string | null
          created_by_email: string | null
          detail: string | null
          due_date: string
          id: string
          identity_verified: boolean
          kind: string
          person_id: string | null
          received_at: string
          requester_email: string | null
          requester_name: string | null
          resolution_note: string | null
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channel?: string
          code: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          detail?: string | null
          due_date: string
          id?: string
          identity_verified?: boolean
          kind: string
          person_id?: string | null
          received_at: string
          requester_email?: string | null
          requester_name?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          channel?: string
          code?: string
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          detail?: string | null
          due_date?: string
          id?: string
          identity_verified?: boolean
          kind?: string
          person_id?: string | null
          received_at?: string
          requester_email?: string | null
          requester_name?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_data_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crm_people"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_email_settings: {
        Row: {
          auto_confirm: boolean
          from_address: string | null
          from_name: string
          id: number
          provider_checked_at: string | null
          provider_ready: boolean
          reply_to: string | null
          updated_at: string
          updated_by_email: string | null
        }
        Insert: {
          auto_confirm?: boolean
          from_address?: string | null
          from_name?: string
          id?: number
          provider_checked_at?: string | null
          provider_ready?: boolean
          reply_to?: string | null
          updated_at?: string
          updated_by_email?: string | null
        }
        Update: {
          auto_confirm?: boolean
          from_address?: string | null
          from_name?: string
          id?: number
          provider_checked_at?: string | null
          provider_ready?: boolean
          reply_to?: string | null
          updated_at?: string
          updated_by_email?: string | null
        }
        Relationships: []
      }
      crm_email_templates: {
        Row: {
          body: string
          description: string
          key: string
          name: string
          placeholders: string[]
          subject: string
          updated_at: string
          updated_by_email: string | null
        }
        Insert: {
          body: string
          description?: string
          key: string
          name: string
          placeholders?: string[]
          subject: string
          updated_at?: string
          updated_by_email?: string | null
        }
        Update: {
          body?: string
          description?: string
          key?: string
          name?: string
          placeholders?: string[]
          subject?: string
          updated_at?: string
          updated_by_email?: string | null
        }
        Relationships: []
      }
      crm_holidays: {
        Row: {
          created_at: string
          day: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          day: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          day?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      crm_members: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          email: string
          invited_by: string | null
          is_owner: boolean
          role_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string
          email: string
          invited_by?: string | null
          is_owner?: boolean
          role_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          email?: string
          invited_by?: string | null
          is_owner?: boolean
          role_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_members_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "crm_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_people: {
        Row: {
          country: string | null
          created_at: string
          email: string | null
          email_normalized: string | null
          first_name: string | null
          id: string
          last_activity_at: string
          last_name: string | null
          phone: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          email?: string | null
          email_normalized?: string | null
          first_name?: string | null
          id?: string
          last_activity_at?: string
          last_name?: string | null
          phone?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          email?: string | null
          email_normalized?: string | null
          first_name?: string | null
          id?: string
          last_activity_at?: string
          last_name?: string | null
          phone?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      crm_permissions: {
        Row: {
          area: string
          description: string
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          area: string
          description?: string
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          area?: string
          description?: string
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      crm_person_notes: {
        Row: {
          author_email: string | null
          author_id: string | null
          body: string
          created_at: string
          id: string
          person_id: string
        }
        Insert: {
          author_email?: string | null
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          person_id: string
        }
        Update: {
          author_email?: string | null
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_person_notes_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crm_people"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_role_permissions: {
        Row: {
          permission_key: string
          role_id: string
        }
        Insert: {
          permission_key: string
          role_id: string
        }
        Update: {
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "crm_permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "crm_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "crm_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_roles: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_contacts: {
        Row: {
          area: string
          email: string
          id: string
          order_index: number
          updated_at: string
        }
        Insert: {
          area: string
          email: string
          id?: string
          order_index?: number
          updated_at?: string
        }
        Update: {
          area?: string
          email?: string
          id?: string
          order_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      faq_items: {
        Row: {
          answer: string
          id: string
          order_index: number
          question: string
          updated_at: string
        }
        Insert: {
          answer: string
          id?: string
          order_index: number
          question: string
          updated_at?: string
        }
        Update: {
          answer?: string
          id?: string
          order_index?: number
          question?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          adult_confirmed: boolean
          confirmed_at: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          last_name: string | null
          message: string | null
          motivo: string | null
          name: string | null
          notes: string | null
          person_id: string | null
          phone: string | null
          privacy_consent: boolean
          publish_consent: boolean
          request_code: string | null
          source: string
          status: string
        }
        Insert: {
          adult_confirmed?: boolean
          confirmed_at?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_name?: string | null
          message?: string | null
          motivo?: string | null
          name?: string | null
          notes?: string | null
          person_id?: string | null
          phone?: string | null
          privacy_consent?: boolean
          publish_consent?: boolean
          request_code?: string | null
          source: string
          status?: string
        }
        Update: {
          adult_confirmed?: boolean
          confirmed_at?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_name?: string | null
          message?: string | null
          motivo?: string | null
          name?: string | null
          notes?: string | null
          person_id?: string | null
          phone?: string | null
          privacy_consent?: boolean
          publish_consent?: boolean
          request_code?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crm_people"
            referencedColumns: ["id"]
          },
        ]
      }
      masters: {
        Row: {
          color_token: string
          description: string
          id: string
          name: string
          order_index: number
          price: number
          topics: Json
          updated_at: string
        }
        Insert: {
          color_token?: string
          description?: string
          id?: string
          name: string
          order_index: number
          price?: number
          topics?: Json
          updated_at?: string
        }
        Update: {
          color_token?: string
          description?: string
          id?: string
          name?: string
          order_index?: number
          price?: number
          topics?: Json
          updated_at?: string
        }
        Relationships: []
      }
      pricing_plan: {
        Row: {
          currency: string
          guarantee_days: number
          id: number
          price_promo: number
          price_regular: number
          show_promo: boolean
          updated_at: string
        }
        Insert: {
          currency?: string
          guarantee_days?: number
          id?: number
          price_promo?: number
          price_regular?: number
          show_promo?: boolean
          updated_at?: string
        }
        Update: {
          currency?: string
          guarantee_days?: number
          id?: number
          price_promo?: number
          price_regular?: number
          show_promo?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      site_copy: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      social_links: {
        Row: {
          id: string
          name: string
          order_index: number
          updated_at: string
          url: string
        }
        Insert: {
          id?: string
          name: string
          order_index?: number
          updated_at?: string
          url: string
        }
        Update: {
          id?: string
          name?: string
          order_index?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          created_at: string
          id: string
          masters: Json
          privacy_consent: boolean
          status: string
          student_name: string
          testimonial: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          masters?: Json
          privacy_consent?: boolean
          status?: string
          student_name: string
          testimonial: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          masters?: Json
          privacy_consent?: boolean
          status?: string
          student_name?: string
          testimonial?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_contacts: {
        Row: {
          area: string
          id: string
          message: string
          order_index: number
          phone: string
          updated_at: string
        }
        Insert: {
          area: string
          id?: string
          message?: string
          order_index?: number
          phone: string
          updated_at?: string
        }
        Update: {
          area?: string
          id?: string
          message?: string
          order_index?: number
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      crm_admin_find_user: {
        Args: { p_email: string }
        Returns: {
          email_confirmed_at: string
          id: string
          last_sign_in_at: string
        }[]
      }
      crm_admin_users_status: {
        Args: { p_ids: string[] }
        Returns: {
          email_confirmed_at: string
          id: string
          invited_at: string
          last_sign_in_at: string
        }[]
      }
      crm_consent_withdraw: {
        Args: { p_kind: string; p_person_id: string }
        Returns: number
      }
      crm_data_request_close: {
        Args: { p_id: string; p_note: string; p_status: string }
        Returns: undefined
      }
      crm_data_request_create: {
        Args: {
          p_channel?: string
          p_detail?: string
          p_kind: string
          p_person_id?: string
          p_received_at: string
          p_requester_email?: string
          p_requester_name?: string
        }
        Returns: Json
      }
      crm_data_request_update: {
        Args: { p_detail: string; p_id: string; p_identity_verified: boolean }
        Returns: undefined
      }
      crm_data_requests_list: {
        Args: never
        Returns: {
          channel: string
          code: string
          contact_hidden: boolean
          created_by_email: string
          days_left: number
          detail: string
          due_date: string
          id: string
          identity_verified: boolean
          kind: string
          missing_holiday_years: number[]
          person_id: string
          person_name: string
          previous_access_at: string
          received_at: string
          requester_email: string
          requester_name: string
          resolution_note: string
          resolved_at: string
          resolved_on_time: boolean
          status: string
        }[]
      }
      crm_email_cancel: { Args: { p_id: string }; Returns: undefined }
      crm_email_compose: {
        Args: { p_body: string; p_lead_id?: string; p_person_id: string; p_subject: string }
        Returns: string
      }
      crm_email_request_send: { Args: { p_id: string }; Returns: undefined }
      crm_email_settings_save: {
        Args: { p_auto_confirm: boolean; p_from_address: string; p_from_name: string; p_reply_to: string }
        Returns: undefined
      }
      crm_email_template_save: {
        Args: { p_body: string; p_key: string; p_subject: string }
        Returns: undefined
      }
      crm_email_test: { Args: { p_to: string }; Returns: string }
      crm_emails_list: {
        Args: never
        Returns: {
          attempts: number
          body: string
          can_handle: boolean
          cancel_reason: string
          contact_hidden: boolean
          created_at: string
          created_by_email: string
          id: string
          kind: string
          last_error: string
          lead_id: string
          lead_source: string
          person_id: string
          person_name: string
          sent_at: string
          status: string
          subject: string
          template_key: string
          to_email: string
        }[]
      }
      crm_log: {
        Args: {
          p_action: string
          p_detail?: Json
          p_entity: string
          p_entity_id?: string
        }
        Returns: undefined
      }
      crm_message_confirm: { Args: { p_id: string }; Returns: string }
      crm_message_delete: { Args: { p_id: string }; Returns: undefined }
      crm_message_update: {
        Args: {
          p_id: string
          p_notes?: string
          p_set_notes?: boolean
          p_status?: string
        }
        Returns: undefined
      }
      crm_messages_list: {
        Args: never
        Returns: {
          adult_confirmed: boolean
          can_handle: boolean
          confirmed_at: string
          contact_hidden: boolean
          country: string
          created_at: string
          email: string
          id: string
          last_name: string
          message: string
          motivo: string
          name: string
          notes: string
          person_id: string
          phone: string
          privacy_consent: boolean
          publish_consent: boolean
          request_code: string
          source: string
          status: string
        }[]
      }
      crm_messages_unread_count: { Args: never; Returns: number }
      crm_people_list: {
        Args: never
        Returns: {
          contact_hidden: boolean
          country: string
          created_at: string
          email: string
          first_name: string
          id: string
          last_activity_at: string
          last_name: string
          message_count: number
          phone: string
          sources: string[]
          tags: string[]
        }[]
      }
      crm_person_add_note: {
        Args: { p_body: string; p_id: string }
        Returns: string
      }
      crm_person_delete: { Args: { p_id: string }; Returns: undefined }
      crm_person_detail: { Args: { p_id: string }; Returns: Json }
      crm_person_update: {
        Args: {
          p_country: string
          p_email?: string
          p_first_name: string
          p_id: string
          p_last_name: string
          p_phone?: string
          p_tags: string[]
        }
        Returns: undefined
      }
      crm_retention_list: {
        Args: never
        Returns: {
          created_at: string
          expires_at: string
          first_name: string
          id: string
          last_name: string
          person_id: string
          request_code: string
          source: string
        }[]
      }
      crm_retention_purge: { Args: { p_ids: string[] }; Returns: Json }
      crm_save_role: {
        Args: {
          p_description: string
          p_id: string
          p_name: string
          p_permissions: string[]
        }
        Returns: string
      }
      crm_today: { Args: never; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
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
  public: {
    Enums: {},
  },
} as const
