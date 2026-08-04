export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AccountType = "checking" | "savings" | "cash" | "brokerage";
export type TransactionType = "income" | "expense" | "transfer";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          updated_at: string | null;
        };
        Insert: {
          id: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          account_type: AccountType;
          currency: string;
          initial_balance: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          account_type: AccountType;
          currency?: string;
          initial_balance?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          account_type?: AccountType;
          currency?: string;
          initial_balance?: number;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      categories: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          icon: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          icon: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          name?: string;
          icon?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          category_id: string | null;
          amount: number;
          transaction_type: TransactionType;
          date: string;
          description: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id: string;
          category_id?: string | null;
          amount: number;
          transaction_type: TransactionType;
          date?: string;
          description?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          account_id?: string;
          category_id?: string | null;
          amount?: number;
          transaction_type?: TransactionType;
          date?: string;
          description?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Account = Tables<"accounts">;
export type AccountInsert = TablesInsert<"accounts">;
export type Category = Tables<"categories">;
export type Transaction = Tables<"transactions">;
export type TransactionInsert = TablesInsert<"transactions">;