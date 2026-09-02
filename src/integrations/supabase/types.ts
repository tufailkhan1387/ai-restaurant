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
      agent_knowledge: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_active: boolean
          restaurant_id: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          restaurant_id?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          restaurant_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          elevenlabs_agent_id: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          system_prompt_template: string | null
          updated_at: string
          voice_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          elevenlabs_agent_id: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          system_prompt_template?: string | null
          updated_at?: string
          voice_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          elevenlabs_agent_id?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          system_prompt_template?: string | null
          updated_at?: string
          voice_id?: string | null
        }
        Relationships: []
      }
      auto_dialer_events: {
        Row: {
          agent_id: string | null
          created_at: string
          event_type: string
          id: string
          lead_id: string | null
          message: string | null
          metadata: Json
          session_id: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          lead_id?: string | null
          message?: string | null
          metadata?: Json
          session_id: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string | null
          message?: string | null
          metadata?: Json
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_dialer_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_dialer_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "auto_dialer_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_dialer_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "auto_dialer_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_dialer_leads: {
        Row: {
          additional_notes: string | null
          ai_pitch_script: string | null
          ai_summary: string | null
          ai_talking_points: Json | null
          analysis_source: string | null
          analysis_status: string
          call_id: string | null
          call_status: string
          callback_at: string | null
          callback_reason: string | null
          callback_requested: boolean
          called_at: string | null
          client_name: string | null
          company: string | null
          converted_lead_id: string | null
          created_at: string
          elevenlabs_conversation_id: string | null
          email: string | null
          extension: string | null
          gatekeeper_encountered: boolean
          id: string
          industry: string | null
          interest_level: string | null
          pain_points: Json | null
          phone_number: string
          pitched_for: string | null
          recommended_services: Json | null
          retry_count: number
          services_done: string | null
          session_id: string
          sms_body: string | null
          sms_message_sid: string | null
          sms_sent_at: string | null
          sms_status: string
          sort_order: number
          timezone: string | null
          twilio_call_sid: string | null
          updated_at: string
          variant_id: string | null
          website_url: string | null
        }
        Insert: {
          additional_notes?: string | null
          ai_pitch_script?: string | null
          ai_summary?: string | null
          ai_talking_points?: Json | null
          analysis_source?: string | null
          analysis_status?: string
          call_id?: string | null
          call_status?: string
          callback_at?: string | null
          callback_reason?: string | null
          callback_requested?: boolean
          called_at?: string | null
          client_name?: string | null
          company?: string | null
          converted_lead_id?: string | null
          created_at?: string
          elevenlabs_conversation_id?: string | null
          email?: string | null
          extension?: string | null
          gatekeeper_encountered?: boolean
          id?: string
          industry?: string | null
          interest_level?: string | null
          pain_points?: Json | null
          phone_number: string
          pitched_for?: string | null
          recommended_services?: Json | null
          retry_count?: number
          services_done?: string | null
          session_id: string
          sms_body?: string | null
          sms_message_sid?: string | null
          sms_sent_at?: string | null
          sms_status?: string
          sort_order?: number
          timezone?: string | null
          twilio_call_sid?: string | null
          updated_at?: string
          variant_id?: string | null
          website_url?: string | null
        }
        Update: {
          additional_notes?: string | null
          ai_pitch_script?: string | null
          ai_summary?: string | null
          ai_talking_points?: Json | null
          analysis_source?: string | null
          analysis_status?: string
          call_id?: string | null
          call_status?: string
          callback_at?: string | null
          callback_reason?: string | null
          callback_requested?: boolean
          called_at?: string | null
          client_name?: string | null
          company?: string | null
          converted_lead_id?: string | null
          created_at?: string
          elevenlabs_conversation_id?: string | null
          email?: string | null
          extension?: string | null
          gatekeeper_encountered?: boolean
          id?: string
          industry?: string | null
          interest_level?: string | null
          pain_points?: Json | null
          phone_number?: string
          pitched_for?: string | null
          recommended_services?: Json | null
          retry_count?: number
          services_done?: string | null
          session_id?: string
          sms_body?: string | null
          sms_message_sid?: string | null
          sms_sent_at?: string | null
          sms_status?: string
          sort_order?: number
          timezone?: string | null
          twilio_call_sid?: string | null
          updated_at?: string
          variant_id?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_dialer_leads_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_dialer_leads_converted_lead_id_fkey"
            columns: ["converted_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_dialer_leads_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "auto_dialer_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_dialer_leads_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "auto_dialer_prompt_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_dialer_prompt_variants: {
        Row: {
          created_at: string
          first_message_override: string | null
          id: string
          is_control: boolean
          label: string
          session_id: string
          system_prompt_override: string | null
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          first_message_override?: string | null
          id?: string
          is_control?: boolean
          label: string
          session_id: string
          system_prompt_override?: string | null
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          first_message_override?: string | null
          id?: string
          is_control?: boolean
          label?: string
          session_id?: string
          system_prompt_override?: string | null
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "auto_dialer_prompt_variants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "auto_dialer_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_dialer_sessions: {
        Row: {
          agent_id: string | null
          allowed_weekdays: number[]
          bypass_schedule_window: boolean
          call_interval_seconds: number
          campaign_type: string
          completed_leads: number
          created_at: string
          created_by: string | null
          current_lead_index: number
          default_timezone: string
          dialing_window_end: string
          dialing_window_start: string
          discovery_query: string | null
          id: string
          last_dialed_at: string | null
          max_call_duration_seconds: number
          max_retries: number
          name: string
          respect_timezone: boolean
          scheduled_end_at: string | null
          scheduled_start_at: string | null
          sms_fallback_enabled: boolean
          sms_fallback_template: string | null
          status: string
          total_leads: number
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          allowed_weekdays?: number[]
          bypass_schedule_window?: boolean
          call_interval_seconds?: number
          campaign_type?: string
          completed_leads?: number
          created_at?: string
          created_by?: string | null
          current_lead_index?: number
          default_timezone?: string
          dialing_window_end?: string
          dialing_window_start?: string
          discovery_query?: string | null
          id?: string
          last_dialed_at?: string | null
          max_call_duration_seconds?: number
          max_retries?: number
          name?: string
          respect_timezone?: boolean
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          sms_fallback_enabled?: boolean
          sms_fallback_template?: string | null
          status?: string
          total_leads?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          allowed_weekdays?: number[]
          bypass_schedule_window?: boolean
          call_interval_seconds?: number
          campaign_type?: string
          completed_leads?: number
          created_at?: string
          created_by?: string | null
          current_lead_index?: number
          default_timezone?: string
          dialing_window_end?: string
          dialing_window_start?: string
          discovery_query?: string | null
          id?: string
          last_dialed_at?: string | null
          max_call_duration_seconds?: number
          max_retries?: number
          name?: string
          respect_timezone?: boolean
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          sms_fallback_enabled?: boolean
          sms_fallback_template?: string | null
          status?: string
          total_leads?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_dialer_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agent_id: string | null
          created_at: string | null
          customer_id: string | null
          direction: string | null
          duration_seconds: number | null
          elevenlabs_conversation_id: string | null
          ended_at: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          notes: string | null
          phone_number: string
          recording_url: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["call_status"] | null
          transcript: string | null
          twilio_call_sid: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          direction?: string | null
          duration_seconds?: number | null
          elevenlabs_conversation_id?: string | null
          ended_at?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          notes?: string | null
          phone_number: string
          recording_url?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["call_status"] | null
          transcript?: string | null
          twilio_call_sid?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          direction?: string | null
          duration_seconds?: number | null
          elevenlabs_conversation_id?: string | null
          ended_at?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          notes?: string | null
          phone_number?: string
          recording_url?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["call_status"] | null
          transcript?: string | null
          twilio_call_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          call_id: string | null
          created_at: string | null
          id: string
          lead_id: string | null
          message: string
          sentiment: string | null
          speaker: string
          timestamp: string | null
        }
        Insert: {
          call_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          message: string
          sentiment?: string | null
          speaker: string
          timestamp?: string | null
        }
        Update: {
          call_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          message?: string
          sentiment?: string | null
          speaker?: string
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          company: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          notes: string | null
          phone_number: string
          updated_at: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          notes?: string | null
          phone_number: string
          updated_at?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          notes?: string | null
          phone_number?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      deals: {
        Row: {
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          item_ids: string[]
          name: string
          original_price: number | null
          price: number
          restaurant_id: string
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_ids?: string[]
          name: string
          original_price?: number | null
          price?: number
          restaurant_id: string
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_ids?: string[]
          name?: string
          original_price?: number | null
          price?: number
          restaurant_id?: string
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      discounts: {
        Row: {
          code: string
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          min_order_amount: number
          restaurant_id: string
          starts_at: string | null
          updated_at: string
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_amount?: number
          restaurant_id: string
          starts_at?: string | null
          updated_at?: string
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_amount?: number
          restaurant_id?: string
          starts_at?: string | null
          updated_at?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "discounts_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      dnc_list: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          phone_number: string
          reason: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          phone_number: string
          reason?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          phone_number?: string
          reason?: string | null
        }
        Relationships: []
      }
      drivers: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          license_number: string | null
          notes: string | null
          phone: string
          restaurant_id: string
          status: string
          updated_at: string
          user_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          license_number?: string | null
          notes?: string | null
          phone: string
          restaurant_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          license_number?: string | null
          notes?: string | null
          phone?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          notes: string | null
          phone_number: string
          services_interested:
            | Database["public"]["Enums"]["service_interest"][]
            | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"] | null
          updated_at: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          notes?: string | null
          phone_number: string
          services_interested?:
            | Database["public"]["Enums"]["service_interest"][]
            | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          updated_at?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          notes?: string | null
          phone_number?: string
          services_interested?:
            | Database["public"]["Enums"]["service_interest"][]
            | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          dietary_tags: string[]
          id: string
          image_url: string | null
          is_available: boolean
          max_order_quantity: number | null
          name: string
          prep_time_minutes: number
          price: number
          restaurant_id: string
          sort_order: number
          spice_level: number
          stock_quantity: number | null
          track_inventory: boolean
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          dietary_tags?: string[]
          id?: string
          image_url?: string | null
          is_available?: boolean
          max_order_quantity?: number | null
          name: string
          prep_time_minutes?: number
          price?: number
          restaurant_id: string
          sort_order?: number
          spice_level?: number
          stock_quantity?: number | null
          track_inventory?: boolean
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          dietary_tags?: string[]
          id?: string
          image_url?: string | null
          is_available?: boolean
          max_order_quantity?: number | null
          name?: string
          prep_time_minutes?: number
          price?: number
          restaurant_id?: string
          sort_order?: number
          spice_level?: number
          stock_quantity?: number | null
          track_inventory?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_addons: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price?: number
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_addons_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_addons: {
        Row: {
          menu_addon_id: string
          menu_item_id: string
        }
        Insert: {
          menu_addon_id: string
          menu_item_id: string
        }
        Update: {
          menu_addon_id?: string
          menu_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_addons_menu_addon_id_fkey"
            columns: ["menu_addon_id"]
            isOneToOne: false
            referencedRelation: "menu_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_addons_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      mockup_followups: {
        Row: {
          auto_followup_enabled: boolean
          created_at: string
          email_status: string
          followup_count: number
          followup_sequence: number
          id: string
          last_followup_sent_at: string | null
          lead_id: string | null
          mockup_sent_at: string
          mockup_url: string | null
          next_followup_at: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          auto_followup_enabled?: boolean
          created_at?: string
          email_status?: string
          followup_count?: number
          followup_sequence?: number
          id?: string
          last_followup_sent_at?: string | null
          lead_id?: string | null
          mockup_sent_at?: string
          mockup_url?: string | null
          next_followup_at?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          auto_followup_enabled?: boolean
          created_at?: string
          email_status?: string
          followup_count?: number
          followup_sequence?: number
          id?: string
          last_followup_sent_at?: string | null
          lead_id?: string | null
          mockup_sent_at?: string
          mockup_url?: string | null
          next_followup_at?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mockup_followups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outbound_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          error: string | null
          event: string
          id: string
          order_id: string
          payload: Json
          recipient: string | null
          restaurant_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          error?: string | null
          event: string
          id?: string
          order_id: string
          payload?: Json
          recipient?: string | null
          restaurant_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          error?: string | null
          event?: string
          id?: string
          order_id?: string
          payload?: Json
          recipient?: string | null
          restaurant_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          deal_id: string | null
          id: string
          item_name: string
          line_total: number
          menu_item_id: string | null
          notes: string | null
          order_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          deal_id?: string | null
          id?: string
          item_name: string
          line_total?: number
          menu_item_id?: string | null
          notes?: string | null
          order_id: string
          quantity?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          deal_id?: string | null
          id?: string
          item_name?: string
          line_total?: number
          menu_item_id?: string | null
          notes?: string | null
          order_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          notes: string | null
          order_id: string
          status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          ai_extracted_data: Json | null
          assigned_at: string | null
          call_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          delivery_address: string
          delivery_fee: number
          delivery_notes: string | null
          discount_amount: number
          discount_code: string | null
          driver_id: string | null
          estimated_delivery_at: string | null
          id: string
          notes: string | null
          order_number: string
          payment_method: string
          payment_status: string
          restaurant_id: string
          source: string
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          tracking_code: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          ai_extracted_data?: Json | null
          assigned_at?: string | null
          call_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          delivered_at?: string | null
          delivery_address: string
          delivery_fee?: number
          delivery_notes?: string | null
          discount_amount?: number
          discount_code?: string | null
          driver_id?: string | null
          estimated_delivery_at?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          payment_method?: string
          payment_status?: string
          restaurant_id: string
          source?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          tracking_code?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          ai_extracted_data?: Json | null
          assigned_at?: string | null
          call_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          delivered_at?: string | null
          delivery_address?: string
          delivery_fee?: number
          delivery_notes?: string | null
          discount_amount?: number
          discount_code?: string | null
          driver_id?: string | null
          estimated_delivery_at?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          payment_method?: string
          payment_status?: string
          restaurant_id?: string
          source?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          tracking_code?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_campaigns: {
        Row: {
          campaign_type: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          campaign_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      outbound_leads: {
        Row: {
          assigned_agent: string | null
          call_attempts: number
          campaign_id: string | null
          company: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          last_called_at: string | null
          next_followup_at: string | null
          notes: string | null
          phone_number: string
          status: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          assigned_agent?: string | null
          call_attempts?: number
          campaign_id?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          last_called_at?: string | null
          next_followup_at?: string | null
          notes?: string | null
          phone_number: string
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          assigned_agent?: string | null
          call_attempts?: number
          campaign_id?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          last_called_at?: string | null
          next_followup_at?: string | null
          notes?: string | null
          phone_number?: string
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbound_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outbound_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          phone_extension: string | null
          status: Database["public"]["Enums"]["agent_status"] | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          phone_extension?: string | null
          status?: Database["public"]["Enums"]["agent_status"] | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          phone_extension?: string | null
          status?: Database["public"]["Enums"]["agent_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      restaurant_members: {
        Row: {
          created_at: string
          id: string
          member_role: string
          restaurant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_role?: string
          restaurant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_role?: string
          restaurant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_members_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_settings: {
        Row: {
          address: string | null
          created_at: string
          currency: string
          delivery_fee: number
          email: string | null
          id: string
          is_open: boolean
          logo_url: string | null
          min_order_amount: number
          name: string
          phone: string | null
          restaurant_id: string
          tax_rate: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          currency?: string
          delivery_fee?: number
          email?: string | null
          id?: string
          is_open?: boolean
          logo_url?: string | null
          min_order_amount?: number
          name?: string
          phone?: string | null
          restaurant_id: string
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          currency?: string
          delivery_fee?: number
          email?: string | null
          id?: string
          is_open?: boolean
          logo_url?: string | null
          min_order_amount?: number
          name?: string
          phone?: string | null
          restaurant_id?: string
          tax_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_settings_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address: string | null
          agent_first_message: string | null
          agent_knowledge_doc_id: string | null
          agent_language: string
          agent_menu_synced_at: string | null
          agent_system_prompt: string | null
          agent_voice_id: string | null
          contact_email: string | null
          cover_image_url: string | null
          created_at: string
          elevenlabs_agent_id: string | null
          elevenlabs_api_key: string | null
          elevenlabs_connected_at: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          phone: string | null
          slug: string
          twilio_account_sid: string | null
          twilio_auth_token: string | null
          twilio_connected_at: string | null
          twilio_phone_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          agent_first_message?: string | null
          agent_knowledge_doc_id?: string | null
          agent_language?: string
          agent_menu_synced_at?: string | null
          agent_system_prompt?: string | null
          agent_voice_id?: string | null
          contact_email?: string | null
          cover_image_url?: string | null
          created_at?: string
          elevenlabs_agent_id?: string | null
          elevenlabs_api_key?: string | null
          elevenlabs_connected_at?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          phone?: string | null
          slug: string
          twilio_account_sid?: string | null
          twilio_auth_token?: string | null
          twilio_connected_at?: string | null
          twilio_phone_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          agent_first_message?: string | null
          agent_knowledge_doc_id?: string | null
          agent_language?: string
          agent_menu_synced_at?: string | null
          agent_system_prompt?: string | null
          agent_voice_id?: string | null
          contact_email?: string | null
          cover_image_url?: string | null
          created_at?: string
          elevenlabs_agent_id?: string | null
          elevenlabs_api_key?: string | null
          elevenlabs_connected_at?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          phone?: string | null
          slug?: string
          twilio_account_sid?: string | null
          twilio_auth_token?: string | null
          twilio_connected_at?: string | null
          twilio_phone_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          assigned_to: string | null
          call_id: string | null
          created_at: string | null
          customer_id: string | null
          description: string | null
          id: string
          priority: string | null
          status: string | null
          subject: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          call_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          subject: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          call_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          capacity_kg: number | null
          created_at: string
          id: string
          model: string | null
          notes: string | null
          plate_number: string
          restaurant_id: string
          status: string
          updated_at: string
          vehicle_type: string
        }
        Insert: {
          capacity_kg?: number | null
          created_at?: string
          id?: string
          model?: string | null
          notes?: string | null
          plate_number: string
          restaurant_id: string
          status?: string
          updated_at?: string
          vehicle_type?: string
        }
        Update: {
          capacity_kg?: number | null
          created_at?: string
          id?: string
          model?: string | null
          notes?: string | null
          plate_number?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
          vehicle_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      website_analysis: {
        Row: {
          analysis_status: string
          analyzed_at: string | null
          created_at: string
          design_score: number | null
          id: string
          lead_id: string | null
          missing_services: string[] | null
          mobile_friendly: boolean | null
          raw_analysis: Json | null
          recommendations: string | null
          seo_issues: string[] | null
          tech_stack: string[] | null
          website_url: string
        }
        Insert: {
          analysis_status?: string
          analyzed_at?: string | null
          created_at?: string
          design_score?: number | null
          id?: string
          lead_id?: string | null
          missing_services?: string[] | null
          mobile_friendly?: boolean | null
          raw_analysis?: Json | null
          recommendations?: string | null
          seo_issues?: string[] | null
          tech_stack?: string[] | null
          website_url: string
        }
        Update: {
          analysis_status?: string
          analyzed_at?: string | null
          created_at?: string
          design_score?: number | null
          id?: string
          lead_id?: string | null
          missing_services?: string[] | null
          mobile_friendly?: boolean | null
          raw_analysis?: Json | null
          recommendations?: string | null
          seo_issues?: string[] | null
          tech_stack?: string[] | null
          website_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_analysis_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outbound_leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_restaurant_id: { Args: { _user_id: string }; Returns: string }
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
      is_driver: { Args: { _user_id: string }; Returns: boolean }
      is_management: { Args: { _user_id: string }; Returns: boolean }
      is_restaurant_member: {
        Args: { _restaurant_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      agent_status: "available" | "on_call" | "busy" | "offline" | "break"
      app_role: "super_admin" | "admin" | "manager" | "agent" | "driver"
      call_status:
        | "queued"
        | "in_progress"
        | "completed"
        | "missed"
        | "transferred"
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "proposal"
        | "negotiation"
        | "won"
        | "lost"
      service_interest:
        | "consulting"
        | "support"
        | "sales"
        | "technical"
        | "billing"
        | "partnership"
        | "other"
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
    Enums: {
      agent_status: ["available", "on_call", "busy", "offline", "break"],
      app_role: ["super_admin", "admin", "manager", "agent", "driver"],
      call_status: [
        "queued",
        "in_progress",
        "completed",
        "missed",
        "transferred",
      ],
      lead_status: [
        "new",
        "contacted",
        "qualified",
        "proposal",
        "negotiation",
        "won",
        "lost",
      ],
      service_interest: [
        "consulting",
        "support",
        "sales",
        "technical",
        "billing",
        "partnership",
        "other",
      ],
    },
  },
} as const
