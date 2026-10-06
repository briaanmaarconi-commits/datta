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
      afip_certificates: {
        Row: {
          certificate_pem: string
          created_at: string
          establishment_id: string
          expires_at: string | null
          id: string
          private_key_pem: string
        }
        Insert: {
          certificate_pem: string
          created_at?: string
          establishment_id: string
          expires_at?: string | null
          id?: string
          private_key_pem: string
        }
        Update: {
          certificate_pem?: string
          created_at?: string
          establishment_id?: string
          expires_at?: string | null
          id?: string
          private_key_pem?: string
        }
        Relationships: [
          {
            foreignKeyName: "afip_certificates_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: true
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "afip_certificates_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: true
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      afip_tokens: {
        Row: {
          created_at: string
          environment: string
          establishment_id: string
          expires_at: string
          id: string
          service: string
          sign: string
          token: string
        }
        Insert: {
          created_at?: string
          environment?: string
          establishment_id: string
          expires_at: string
          id?: string
          service?: string
          sign: string
          token: string
        }
        Update: {
          created_at?: string
          environment?: string
          establishment_id?: string
          expires_at?: string
          id?: string
          service?: string
          sign?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "afip_tokens_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "afip_tokens_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insight_preferences: {
        Row: {
          daily_report_emails: string[]
          daily_report_enabled: boolean
          daily_report_hour: number
          enabled: boolean
          establishment_id: string
          silenced_categories: string[]
          thresholds: Json
          updated_at: string
        }
        Insert: {
          daily_report_emails?: string[]
          daily_report_enabled?: boolean
          daily_report_hour?: number
          enabled?: boolean
          establishment_id: string
          silenced_categories?: string[]
          thresholds?: Json
          updated_at?: string
        }
        Update: {
          daily_report_emails?: string[]
          daily_report_enabled?: boolean
          daily_report_hour?: number
          enabled?: boolean
          establishment_id?: string
          silenced_categories?: string[]
          thresholds?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_insight_preferences_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: true
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insight_preferences_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: true
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          body: string
          category: string
          created_at: string
          establishment_id: string
          id: string
          kind: string
          payload: Json
          read_at: string | null
          severity: string
          status: string
          title: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          establishment_id: string
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          severity?: string
          status?: string
          title: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          establishment_id?: string
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          severity?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          establishment_id: string
          id: string
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          establishment_id: string
          id?: string
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          establishment_id?: string
          id?: string
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          establishment_id: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          establishment_id: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          establishment_id?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      client_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          establishment_id: string
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          period_month: number
          period_year: number
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          establishment_id: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          period_month: number
          period_year: number
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          establishment_id?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          period_month?: number
          period_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_payments_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_payments_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      client_plans: {
        Row: {
          created_at: string
          description: string | null
          features: string[] | null
          id: string
          is_active: boolean
          name: string
          price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          features?: string[] | null
          id?: string
          is_active?: boolean
          name: string
          price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          features?: string[] | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
        }
        Relationships: []
      }
      courtesy_accounts: {
        Row: {
          created_at: string
          establishment_id: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          establishment_id: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          establishment_id?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courtesy_accounts_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courtesy_accounts_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      courtesy_charges: {
        Row: {
          account_id: string | null
          cost_amount: number
          courtesy_type: string
          created_at: string
          created_by: string | null
          establishment_id: string
          finance_transaction_id: string | null
          id: string
          notes: string | null
          order_ids: string[]
          sale_amount: number
          table_number: number | null
        }
        Insert: {
          account_id?: string | null
          cost_amount?: number
          courtesy_type?: string
          created_at?: string
          created_by?: string | null
          establishment_id: string
          finance_transaction_id?: string | null
          id?: string
          notes?: string | null
          order_ids?: string[]
          sale_amount?: number
          table_number?: number | null
        }
        Update: {
          account_id?: string | null
          cost_amount?: number
          courtesy_type?: string
          created_at?: string
          created_by?: string | null
          establishment_id?: string
          finance_transaction_id?: string | null
          id?: string
          notes?: string | null
          order_ids?: string[]
          sale_amount?: number
          table_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "courtesy_charges_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "courtesy_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courtesy_charges_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courtesy_charges_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      datta_finance_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          type?: string
        }
        Relationships: []
      }
      datta_transactions: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          establishment_id: string | null
          id: string
          type: string
        }
        Insert: {
          amount?: number
          category_id: string
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          establishment_id?: string | null
          id?: string
          type: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          establishment_id?: string | null
          id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "datta_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "datta_finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datta_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datta_transactions_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datta_transactions_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_integrations: {
        Row: {
          client_id: string | null
          created_at: string
          credentials: Json
          environment: string
          establishment_id: string
          external_vendor_id: string | null
          id: string
          last_checked_at: string | null
          last_error: string | null
          platform: string
          secret_last4: string | null
          status: string
          store_id: string | null
          updated_at: string
          webhook_token: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          credentials?: Json
          environment?: string
          establishment_id: string
          external_vendor_id?: string | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          platform: string
          secret_last4?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          webhook_token?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          credentials?: Json
          environment?: string
          establishment_id?: string
          external_vendor_id?: string | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          platform?: string
          secret_last4?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          webhook_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_integrations_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_integrations_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_menu_mapping: {
        Row: {
          created_at: string
          establishment_id: string
          external_item_id: string
          external_item_name: string | null
          id: string
          platform: string
          product_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          establishment_id: string
          external_item_id: string
          external_item_name?: string | null
          id?: string
          platform: string
          product_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          establishment_id?: string
          external_item_id?: string
          external_item_name?: string | null
          id?: string
          platform?: string
          product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_menu_mapping_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_menu_mapping_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_menu_mapping_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      establishments: {
        Row: {
          address: string | null
          afip_environment: string | null
          agreed_price: number | null
          ai_invoice_reader: boolean
          auto_purchase_to_expense: boolean
          city: string | null
          condicion_iva: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          cuit: string | null
          delivery_enabled: boolean
          domicilio_comercial: string | null
          id: string
          iibb: string | null
          inicio_actividades: string | null
          is_active: boolean
          logo_url: string | null
          name: string
          onboarded_at: string | null
          onboarding_progress: Json
          peya_commission: number
          plan_id: string | null
          punto_venta_afip: number | null
          rappi_commission: number
          razon_social: string | null
          service_start_date: string | null
          service_status: string
          stock_simple_mode: boolean
          tip_mode: string
        }
        Insert: {
          address?: string | null
          afip_environment?: string | null
          agreed_price?: number | null
          ai_invoice_reader?: boolean
          auto_purchase_to_expense?: boolean
          city?: string | null
          condicion_iva?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          cuit?: string | null
          delivery_enabled?: boolean
          domicilio_comercial?: string | null
          id?: string
          iibb?: string | null
          inicio_actividades?: string | null
          is_active?: boolean
          logo_url?: string | null
          name: string
          onboarded_at?: string | null
          onboarding_progress?: Json
          peya_commission?: number
          plan_id?: string | null
          punto_venta_afip?: number | null
          rappi_commission?: number
          razon_social?: string | null
          service_start_date?: string | null
          service_status?: string
          stock_simple_mode?: boolean
          tip_mode?: string
        }
        Update: {
          address?: string | null
          afip_environment?: string | null
          agreed_price?: number | null
          ai_invoice_reader?: boolean
          auto_purchase_to_expense?: boolean
          city?: string | null
          condicion_iva?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          cuit?: string | null
          delivery_enabled?: boolean
          domicilio_comercial?: string | null
          id?: string
          iibb?: string | null
          inicio_actividades?: string | null
          is_active?: boolean
          logo_url?: string | null
          name?: string
          onboarded_at?: string | null
          onboarding_progress?: Json
          peya_commission?: number
          plan_id?: string | null
          punto_venta_afip?: number | null
          rappi_commission?: number
          razon_social?: string | null
          service_start_date?: string | null
          service_status?: string
          stock_simple_mode?: boolean
          tip_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "establishments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "client_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_categories: {
        Row: {
          created_at: string
          establishment_id: string
          id: string
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          establishment_id: string
          id?: string
          name: string
          type: string
        }
        Update: {
          created_at?: string
          establishment_id?: string
          id?: string
          name?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_categories_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_categories_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_transactions: {
        Row: {
          affects_cash: boolean
          amount: number
          category_id: string
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          establishment_id: string
          id: string
          notes: string | null
          type: string
        }
        Insert: {
          affects_cash?: boolean
          amount?: number
          category_id: string
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          establishment_id: string
          id?: string
          notes?: string | null
          type: string
        }
        Update: {
          affects_cash?: boolean
          amount?: number
          category_id?: string
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          establishment_id?: string
          id?: string
          notes?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_invoice_covered_invoices: {
        Row: {
          created_at: string
          establishment_id: string
          fiscal_invoice_id: string
          id: string
          invoice_id: string
        }
        Insert: {
          created_at?: string
          establishment_id: string
          fiscal_invoice_id: string
          id?: string
          invoice_id: string
        }
        Update: {
          created_at?: string
          establishment_id?: string
          fiscal_invoice_id?: string
          id?: string
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_invoice_covered_invoices_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoice_covered_invoices_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoice_covered_invoices_fiscal_invoice_id_fkey"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoice_covered_invoices_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_invoices: {
        Row: {
          afip_response: Json | null
          cae: string | null
          cae_vto: string | null
          cbte_numero: number | null
          created_at: string
          created_by: string | null
          credit_note_reason: string | null
          establishment_id: string
          id: string
          invoice_id: string | null
          invoice_ids: string[] | null
          is_credit_note: boolean
          items_detail: Json | null
          iva_amount: number | null
          neto_gravado: number | null
          payment_method: string | null
          punto_venta: number
          receptor_condicion_iva: string | null
          receptor_cuit: string | null
          receptor_razon_social: string | null
          related_fiscal_invoice_id: string | null
          status: string
          tipo_cbte: number
          total: number
        }
        Insert: {
          afip_response?: Json | null
          cae?: string | null
          cae_vto?: string | null
          cbte_numero?: number | null
          created_at?: string
          created_by?: string | null
          credit_note_reason?: string | null
          establishment_id: string
          id?: string
          invoice_id?: string | null
          invoice_ids?: string[] | null
          is_credit_note?: boolean
          items_detail?: Json | null
          iva_amount?: number | null
          neto_gravado?: number | null
          payment_method?: string | null
          punto_venta: number
          receptor_condicion_iva?: string | null
          receptor_cuit?: string | null
          receptor_razon_social?: string | null
          related_fiscal_invoice_id?: string | null
          status?: string
          tipo_cbte: number
          total?: number
        }
        Update: {
          afip_response?: Json | null
          cae?: string | null
          cae_vto?: string | null
          cbte_numero?: number | null
          created_at?: string
          created_by?: string | null
          credit_note_reason?: string | null
          establishment_id?: string
          id?: string
          invoice_id?: string | null
          invoice_ids?: string[] | null
          is_credit_note?: boolean
          items_detail?: Json | null
          iva_amount?: number | null
          neto_gravado?: number | null
          payment_method?: string | null
          punto_venta?: number
          receptor_condicion_iva?: string | null
          receptor_cuit?: string | null
          receptor_razon_social?: string | null
          related_fiscal_invoice_id?: string | null
          status?: string
          tipo_cbte?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_invoices_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_related_fiscal_invoice_id_fkey"
            columns: ["related_fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_plans: {
        Row: {
          created_at: string
          establishment_id: string
          id: string
          layout_data: Json
          sector_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          establishment_id: string
          id?: string
          layout_data?: Json
          sector_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          establishment_id?: string
          id?: string
          layout_data?: Json
          sector_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_plans_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_plans_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_plans_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          cost_mode: string
          cost_per_unit: number
          created_at: string
          current_stock: number
          establishment_id: string
          id: string
          is_active: boolean
          min_stock: number
          name: string
          supplier: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          cost_mode?: string
          cost_per_unit?: number
          created_at?: string
          current_stock?: number
          establishment_id: string
          id?: string
          is_active?: boolean
          min_stock?: number
          name: string
          supplier?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          cost_mode?: string
          cost_per_unit?: number
          created_at?: string
          current_stock?: number
          establishment_id?: string
          id?: string
          is_active?: boolean
          min_stock?: number
          name?: string
          supplier?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_paid: number
          change_amount: number
          created_at: string
          created_by: string | null
          establishment_id: string
          id: string
          invoice_number: number
          items: Json
          order_ids: string[]
          payment_method: string
          table_number: number
          tip_amount: number
          tip_mode: string | null
          tip_payment_method: string | null
          tip_settled: boolean
          tip_settled_at: string | null
          tip_settlement_tx_id: string | null
          tip_waiter_id: string | null
          total: number
        }
        Insert: {
          amount_paid?: number
          change_amount?: number
          created_at?: string
          created_by?: string | null
          establishment_id: string
          id?: string
          invoice_number?: number
          items: Json
          order_ids: string[]
          payment_method: string
          table_number: number
          tip_amount?: number
          tip_mode?: string | null
          tip_payment_method?: string | null
          tip_settled?: boolean
          tip_settled_at?: string | null
          tip_settlement_tx_id?: string | null
          tip_waiter_id?: string | null
          total?: number
        }
        Update: {
          amount_paid?: number
          change_amount?: number
          created_at?: string
          created_by?: string | null
          establishment_id?: string
          id?: string
          invoice_number?: number
          items?: Json
          order_ids?: string[]
          payment_method?: string
          table_number?: number
          tip_amount?: number
          tip_mode?: string | null
          tip_payment_method?: string | null
          tip_settled?: boolean
          tip_settled_at?: string | null
          tip_settlement_tx_id?: string | null
          tip_waiter_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_combo_items: {
        Row: {
          combo_id: string
          created_at: string
          id: string
          item_group: string
          product_id: string
          sort_order: number
        }
        Insert: {
          combo_id: string
          created_at?: string
          id?: string
          item_group?: string
          product_id: string
          sort_order?: number
        }
        Update: {
          combo_id?: string
          created_at?: string
          id?: string
          item_group?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_combo_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "menu_combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_combo_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_combos: {
        Row: {
          created_at: string
          description: string | null
          establishment_id: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          establishment_id: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          establishment_id?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_combos_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_combos_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          cost_snapshot: number
          created_at: string
          id: string
          notes: string | null
          order_id: string
          product_id: string
          quantity: number
          status: Database["public"]["Enums"]["order_item_status"]
          unit_price: number
        }
        Insert: {
          cost_snapshot?: number
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          product_id: string
          quantity?: number
          status?: Database["public"]["Enums"]["order_item_status"]
          unit_price?: number
        }
        Update: {
          cost_snapshot?: number
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string
          quantity?: number
          status?: Database["public"]["Enums"]["order_item_status"]
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_paid: number | null
          channel: string
          created_at: string
          created_by: string | null
          customer_name: string | null
          delivered_at: string | null
          delivery_address: Json | null
          delivery_fee: number
          establishment_id: string
          external_order_id: string | null
          external_platform: string | null
          id: string
          payment_method: string | null
          platform_commission: number
          prepared_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          table_id: string | null
          total: number
        }
        Insert: {
          amount_paid?: number | null
          channel?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          delivery_address?: Json | null
          delivery_fee?: number
          establishment_id: string
          external_order_id?: string | null
          external_platform?: string | null
          id?: string
          payment_method?: string | null
          platform_commission?: number
          prepared_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          total?: number
        }
        Update: {
          amount_paid?: number | null
          channel?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          delivery_address?: Json | null
          delivery_fee?: number
          establishment_id?: string
          external_order_id?: string | null
          external_platform?: string | null
          id?: string
          payment_method?: string | null
          platform_commission?: number
          prepared_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      product_recipes: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          product_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_recipes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          comment: string | null
          created_at: string
          establishment_id: string
          id: string
          product_id: string
          rating: number
          reviewer_name: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          establishment_id: string
          id?: string
          product_id: string
          rating: number
          reviewer_name?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          establishment_id?: string
          id?: string
          product_id?: string
          rating?: number
          reviewer_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string
          cost: number
          cost_mode: string
          created_at: string
          description: string | null
          direct_min_stock: number
          direct_stock: number
          establishment_id: string
          id: string
          image_url: string | null
          is_available: boolean
          is_daily_special: boolean
          name: string
          price: number
          promo_active: boolean
          promo_price: number | null
          stock_mode: string
          tax_percentage: number
        }
        Insert: {
          category_id: string
          cost?: number
          cost_mode?: string
          created_at?: string
          description?: string | null
          direct_min_stock?: number
          direct_stock?: number
          establishment_id: string
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_daily_special?: boolean
          name: string
          price?: number
          promo_active?: boolean
          promo_price?: number | null
          stock_mode?: string
          tax_percentage?: number
        }
        Update: {
          category_id?: string
          cost?: number
          cost_mode?: string
          created_at?: string
          description?: string | null
          direct_min_stock?: number
          direct_stock?: number
          establishment_id?: string
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_daily_special?: boolean
          name?: string
          price?: number
          promo_active?: boolean
          promo_price?: number | null
          stock_mode?: string
          tax_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      purchase_invoice_items: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string | null
          invoice_id: string
          item_name: string | null
          purchase_quantity: number | null
          purchase_unit: string | null
          quantity: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id?: string | null
          invoice_id: string
          item_name?: string | null
          purchase_quantity?: number | null
          purchase_unit?: string | null
          quantity?: number
          unit?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string | null
          invoice_id?: string
          item_name?: string | null
          purchase_quantity?: number | null
          purchase_unit?: string | null
          quantity?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          auto_expense: boolean
          created_at: string
          created_by: string | null
          establishment_id: string
          finance_transaction_id: string | null
          id: string
          invoice_date: string
          invoice_number: string | null
          notes: string | null
          payment_method: string
          receipt_url: string | null
          supplier: string
          total: number
        }
        Insert: {
          auto_expense?: boolean
          created_at?: string
          created_by?: string | null
          establishment_id: string
          finance_transaction_id?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          notes?: string | null
          payment_method?: string
          receipt_url?: string | null
          supplier: string
          total?: number
        }
        Update: {
          auto_expense?: boolean
          created_at?: string
          created_by?: string | null
          establishment_id?: string
          finance_transaction_id?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          notes?: string | null
          payment_method?: string
          receipt_url?: string | null
          supplier?: string
          total?: number
        }
        Relationships: []
      }
      reservations: {
        Row: {
          created_at: string
          created_by: string | null
          customer_name: string
          customer_phone: string | null
          establishment_id: string
          id: string
          notes: string | null
          party_size: number
          reservation_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          table_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_name: string
          customer_phone?: string | null
          establishment_id: string
          id?: string
          notes?: string | null
          party_size?: number
          reservation_at: string
          status?: Database["public"]["Enums"]["reservation_status"]
          table_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_name?: string
          customer_phone?: string | null
          establishment_id?: string
          id?: string
          notes?: string | null
          party_size?: number
          reservation_at?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          table_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sectors: {
        Row: {
          created_at: string
          establishment_id: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          establishment_id: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          establishment_id?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "sectors_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sectors_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_controls: {
        Row: {
          actual_cash: number | null
          cash_difference: number | null
          closed_at: string | null
          closed_by: string | null
          controlled_at: string | null
          controlled_by: string | null
          created_at: string
          establishment_id: string
          id: string
          initial_cash: number
          is_controlled: boolean
          notes: string | null
          opened_at: string | null
          shift_date: string
        }
        Insert: {
          actual_cash?: number | null
          cash_difference?: number | null
          closed_at?: string | null
          closed_by?: string | null
          controlled_at?: string | null
          controlled_by?: string | null
          created_at?: string
          establishment_id: string
          id?: string
          initial_cash?: number
          is_controlled?: boolean
          notes?: string | null
          opened_at?: string | null
          shift_date: string
        }
        Update: {
          actual_cash?: number | null
          cash_difference?: number | null
          closed_at?: string | null
          closed_by?: string | null
          controlled_at?: string | null
          controlled_by?: string | null
          created_at?: string
          establishment_id?: string
          id?: string
          initial_cash?: number
          is_controlled?: boolean
          notes?: string | null
          opened_at?: string | null
          shift_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_controls_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_controls_controlled_by_fkey"
            columns: ["controlled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_controls_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_controls_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_shifts: {
        Row: {
          created_at: string
          ended_at: string | null
          establishment_id: string
          id: string
          notes: string | null
          orders_count: number
          sales_total: number
          started_at: string
          tables_served: number
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          establishment_id: string
          id?: string
          notes?: string | null
          orders_count?: number
          sales_total?: number
          started_at?: string
          tables_served?: number
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          establishment_id?: string
          id?: string
          notes?: string | null
          orders_count?: number
          sales_total?: number
          started_at?: string
          tables_served?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_shifts_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          consumption_type: string | null
          created_at: string
          created_by: string | null
          establishment_id: string
          finance_transaction_id: string | null
          id: string
          ingredient_id: string | null
          product_id: string | null
          quantity: number
          reason: string | null
          reference_id: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
        }
        Insert: {
          consumption_type?: string | null
          created_at?: string
          created_by?: string | null
          establishment_id: string
          finance_transaction_id?: string | null
          id?: string
          ingredient_id?: string | null
          product_id?: string | null
          quantity: number
          reason?: string | null
          reference_id?: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
        }
        Update: {
          consumption_type?: string | null
          created_at?: string
          created_by?: string | null
          establishment_id?: string
          finance_transaction_id?: string | null
          id?: string
          ingredient_id?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          type?: Database["public"]["Enums"]["stock_movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          capacity: number
          created_at: string
          establishment_id: string
          guest_count: number | null
          id: string
          number: number
          sector_id: string | null
          status: Database["public"]["Enums"]["table_status"]
        }
        Insert: {
          capacity?: number
          created_at?: string
          establishment_id: string
          guest_count?: number | null
          id?: string
          number: number
          sector_id?: string | null
          status?: Database["public"]["Enums"]["table_status"]
        }
        Update: {
          capacity?: number
          created_at?: string
          establishment_id?: string
          guest_count?: number | null
          id?: string
          number?: number
          sector_id?: string | null
          status?: Database["public"]["Enums"]["table_status"]
        }
        Relationships: [
          {
            foreignKeyName: "tables_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          establishment_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          establishment_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          establishment_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waiter_calls: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          establishment_id: string
          id: string
          sector_id: string | null
          status: string
          table_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          establishment_id: string
          id?: string
          sector_id?: string | null
          status?: string
          table_id: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          establishment_id?: string
          id?: string
          sector_id?: string | null
          status?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiter_calls_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_calls_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_calls_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_calls_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      waiter_reviews: {
        Row: {
          comment: string | null
          created_at: string
          establishment_id: string
          id: string
          rating: number
          reviewer_name: string | null
          waiter_name: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          establishment_id: string
          id?: string
          rating: number
          reviewer_name?: string | null
          waiter_name: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          establishment_id?: string
          id?: string
          rating?: number
          reviewer_name?: string | null
          waiter_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiter_reviews_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_reviews_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "public_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_establishments: {
        Row: {
          address: string | null
          city: string | null
          id: string | null
          is_active: boolean | null
          logo_url: string | null
          name: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          id?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          id?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_purchase_stock: {
        Args: { _invoice_id: string; _lines: Json }
        Returns: Json
      }
      apply_sale_stock: { Args: { _invoice_id: string }; Returns: Json }
      cleanup_disabled_purchase_expenses: { Args: never; Returns: undefined }
      ensure_consumption_expense_category: {
        Args: { _consumption_type: string; _establishment_id: string }
        Returns: string
      }
      ensure_insight_preferences: {
        Args: { _establishment_id: string }
        Returns: {
          daily_report_emails: string[]
          daily_report_enabled: boolean
          daily_report_hour: number
          enabled: boolean
          establishment_id: string
          silenced_categories: string[]
          thresholds: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_insight_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_raw_material_expense_category: {
        Args: { _establishment_id: string }
        Returns: string
      }
      ensure_supplies_expense_category: {
        Args: { _establishment_id: string }
        Returns: string
      }
      ensure_tips_income_category: {
        Args: { _establishment_id: string }
        Returns: string
      }
      ensure_tips_payout_category: {
        Args: { _establishment_id: string }
        Returns: string
      }
      get_afip_cert_status: {
        Args: { _establishment_id: string }
        Returns: Json
      }
      get_business_health: {
        Args: { _establishment_id: string }
        Returns: Json
      }
      get_delivery_integration_status: {
        Args: { _establishment_id: string }
        Returns: Json
      }
      get_product_effective_cost: {
        Args: { _product_id: string }
        Returns: number
      }
      get_product_recipe_cost: {
        Args: { _product_id: string }
        Returns: number
      }
      get_user_establishment: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      recalculate_ingredient_cost: {
        Args: { _ingredient_id: string }
        Returns: undefined
      }
      seed_default_finance_categories: {
        Args: { _establishment_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "superadmin" | "admin" | "cashier" | "waiter" | "kitchen"
      order_item_status: "pending" | "preparing" | "ready"
      order_status:
        | "new"
        | "preparing"
        | "ready"
        | "delivered"
        | "closed"
        | "cancelled"
      reservation_status: "confirmed" | "seated" | "cancelled" | "no_show"
      stock_movement_type:
        | "entry"
        | "sale"
        | "waste"
        | "adjustment"
        | "consumption"
      table_status: "free" | "occupied" | "billing"
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
    Enums: {
      app_role: ["superadmin", "admin", "cashier", "waiter", "kitchen"],
      order_item_status: ["pending", "preparing", "ready"],
      order_status: [
        "new",
        "preparing",
        "ready",
        "delivered",
        "closed",
        "cancelled",
      ],
      reservation_status: ["confirmed", "seated", "cancelled", "no_show"],
      stock_movement_type: [
        "entry",
        "sale",
        "waste",
        "adjustment",
        "consumption",
      ],
      table_status: ["free", "occupied", "billing"],
    },
  },
} as const
