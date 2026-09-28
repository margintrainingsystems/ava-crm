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
      crm_save_role: {
        Args: {
          p_description: string
          p_id: string
          p_name: string
          p_permissions: string[]
        }
        Returns: string
      }
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
