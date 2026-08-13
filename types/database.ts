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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: string
          currency: string
          id: string
          initial_balance: number
          name: string
          user_id: string
        }
        Insert: {
          account_type: string
          currency?: string
          id?: string
          initial_balance?: number
          name: string
          user_id: string
        }
        Update: {
          account_type?: string
          currency?: string
          id?: string
          initial_balance?: number
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          icon: string
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          icon: string
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          icon?: string
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      holding_transactions: {
        Row: {
          commission: number
          created_at: string
          holding_id: string
          id: string
          notes: string | null
          price_per_share: number
          shares: number
          transacted_at: string
          type: string
          user_id: string
        }
        Insert: {
          commission?: number
          created_at?: string
          holding_id: string
          id?: string
          notes?: string | null
          price_per_share: number
          shares: number
          transacted_at?: string
          type: string
          user_id: string
        }
        Update: {
          commission?: number
          created_at?: string
          holding_id?: string
          id?: string
          notes?: string | null
          price_per_share?: number
          shares?: number
          transacted_at?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holding_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "portfolio_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      net_worth_categories: {
        Row: {
          created_at: string
          icon: string
          id: string
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          icon: string
          id?: string
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "net_worth_categories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      net_worth_entries: {
        Row: {
          category_id: string | null
          created_at: string
          currency: string
          description: string | null
          entry_type: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          entry_type: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          entry_type?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "net_worth_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "net_worth_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "net_worth_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      net_worth_entry_values: {
        Row: {
          as_of: string
          created_at: string
          entry_id: string
          id: string
          updated_at: string
          value: number
        }
        Insert: {
          as_of: string
          created_at?: string
          entry_id: string
          id?: string
          updated_at?: string
          value: number
        }
        Update: {
          as_of?: string
          created_at?: string
          entry_id?: string
          id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "net_worth_entry_values_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "net_worth_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_holdings: {
        Row: {
          asset_type: string
          created_at: string
          currency: string
          id: string
          name: string | null
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_type: string
          created_at?: string
          currency?: string
          id?: string
          name?: string | null
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          currency?: string
          id?: string
          name?: string | null
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          default_account_id: string | null
          default_category_id: string | null
          display_currency: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          default_account_id?: string | null
          default_category_id?: string | null
          display_currency?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          default_account_id?: string | null
          default_category_id?: string | null
          display_currency?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_account_id_fkey"
            columns: ["default_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_transaction_occurrences: {
        Row: {
          created_at: string
          id: string
          occurrence_date: string
          status: string
          override_account_id: string | null
          override_amount: number | null
          override_category_id: string | null
          override_description: string | null
          override_to_account_id: string | null
          override_transaction_type: string | null
          recurring_transaction_id: string
          transaction_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          occurrence_date: string
          status?: string
          override_account_id?: string | null
          override_amount?: number | null
          override_category_id?: string | null
          override_description?: string | null
          override_to_account_id?: string | null
          override_transaction_type?: string | null
          recurring_transaction_id: string
          transaction_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          occurrence_date?: string
          status?: string
          override_account_id?: string | null
          override_amount?: number | null
          override_category_id?: string | null
          override_description?: string | null
          override_to_account_id?: string | null
          override_transaction_type?: string | null
          recurring_transaction_id?: string
          transaction_id?: string | null
        }
        Relationships: [
          { foreignKeyName: "recurring_transaction_occurrences_override_account_id_fkey"; columns: ["override_account_id"]; isOneToOne: false; referencedRelation: "accounts"; referencedColumns: ["id"] },
          { foreignKeyName: "recurring_transaction_occurrences_override_category_id_fkey"; columns: ["override_category_id"]; isOneToOne: false; referencedRelation: "categories"; referencedColumns: ["id"] },
          { foreignKeyName: "recurring_transaction_occurrences_override_to_account_id_fkey"; columns: ["override_to_account_id"]; isOneToOne: false; referencedRelation: "accounts"; referencedColumns: ["id"] },
          { foreignKeyName: "recurring_transaction_occurrences_recurring_transaction_id_fkey"; columns: ["recurring_transaction_id"]; isOneToOne: false; referencedRelation: "recurring_transactions"; referencedColumns: ["id"] },
          { foreignKeyName: "recurring_transaction_occurrences_transaction_id_fkey"; columns: ["transaction_id"]; isOneToOne: false; referencedRelation: "transactions"; referencedColumns: ["id"] },
        ]
      }
      recurring_transaction_versions: {
        Row: {
          account_id: string
          amount: number
          category_id: string | null
          created_at: string
          description: string | null
          effective_date: string
          id: string
          recurring_transaction_id: string
          to_account_id: string | null
          transaction_type: string
          recurrence_kind: string
          recurrence_unit: string | null
          recurrence_interval: number | null
        }
        Insert: {
          account_id: string
          amount: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          effective_date: string
          id?: string
          recurring_transaction_id: string
          to_account_id?: string | null
          transaction_type: string
          recurrence_kind: string
          recurrence_unit?: string | null
          recurrence_interval?: number | null
        }
        Update: {
          account_id?: string
          amount?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          effective_date?: string
          id?: string
          recurring_transaction_id?: string
          to_account_id?: string | null
          transaction_type?: string
          recurrence_kind?: string
          recurrence_unit?: string | null
          recurrence_interval?: number | null
        }
        Relationships: [
          { foreignKeyName: "recurring_transaction_versions_account_id_fkey"; columns: ["account_id"]; isOneToOne: false; referencedRelation: "accounts"; referencedColumns: ["id"] },
          { foreignKeyName: "recurring_transaction_versions_category_id_fkey"; columns: ["category_id"]; isOneToOne: false; referencedRelation: "categories"; referencedColumns: ["id"] },
          { foreignKeyName: "recurring_transaction_versions_recurring_transaction_id_fkey"; columns: ["recurring_transaction_id"]; isOneToOne: false; referencedRelation: "recurring_transactions"; referencedColumns: ["id"] },
          { foreignKeyName: "recurring_transaction_versions_to_account_id_fkey"; columns: ["to_account_id"]; isOneToOne: false; referencedRelation: "accounts"; referencedColumns: ["id"] },
        ]
      }
      recurring_transactions: {
        Row: {
          account_id: string
          amount: number
          category_id: string | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          is_active: boolean
          recurrence_interval: number | null
          recurrence_kind: string
          recurrence_unit: string | null
          start_date: string
          to_account_id: string | null
          transaction_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          recurrence_interval?: number | null
          recurrence_kind: string
          recurrence_unit?: string | null
          start_date: string
          to_account_id?: string | null
          transaction_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          recurrence_interval?: number | null
          recurrence_kind?: string
          recurrence_unit?: string | null
          start_date?: string
          to_account_id?: string | null
          transaction_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          { foreignKeyName: "recurring_transactions_account_id_fkey"; columns: ["account_id"]; isOneToOne: false; referencedRelation: "accounts"; referencedColumns: ["id"] },
          { foreignKeyName: "recurring_transactions_category_id_fkey"; columns: ["category_id"]; isOneToOne: false; referencedRelation: "categories"; referencedColumns: ["id"] },
          { foreignKeyName: "recurring_transactions_to_account_id_fkey"; columns: ["to_account_id"]; isOneToOne: false; referencedRelation: "accounts"; referencedColumns: ["id"] },
          { foreignKeyName: "recurring_transactions_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          category_id: string | null
          date: string
          description: string | null
          id: string
          to_account_id: string | null
          transaction_type: string
          user_id: string
          recurring_transaction_id: string | null
        }
        Insert: {
          account_id: string
          amount: number
          category_id?: string | null
          date?: string
          description?: string | null
          id?: string
          to_account_id?: string | null
          transaction_type: string
          user_id: string
          recurring_transaction_id?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          category_id?: string | null
          date?: string
          description?: string | null
          id?: string
          to_account_id?: string | null
          transaction_type?: string
          user_id?: string
          recurring_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurring_transaction_id_fkey"
            columns: ["recurring_transaction_id"]
            isOneToOne: false
            referencedRelation: "recurring_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_recurring_edit_from_occurrence: { Args: { p_effective_date: string; p_recurring_transaction_id: string; p_version: Json }; Returns: undefined }
      create_and_materialize_recurring_transaction: { Args: { p_rule: Json; p_through_month: string }; Returns: Database["public"]["Tables"]["recurring_transactions"]["Row"] }
      delete_recurring_from_occurrence: { Args: { p_effective_date: string; p_recurring_transaction_id: string }; Returns: undefined }
      materialize_recurring_transactions: { Args: { p_month: string }; Returns: Database["public"]["Tables"]["transactions"]["Row"][] }
      purge_demo_user: { Args: never; Returns: undefined }
      purge_stale_demo_users: { Args: never; Returns: undefined }
      seed_demo_data: { Args: never; Returns: undefined }
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
  public: {
    Enums: {},
  },
} as const
