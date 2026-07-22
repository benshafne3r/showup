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
      artists: {
        Row: {
          bio: string
          company_id: string
          created_at: string
          genre: string
          id: string
          image_url: string | null
          instagram_handle: string | null
          name: string
          spotify_url: string | null
          updated_at: string
        }
        Insert: {
          bio?: string
          company_id: string
          created_at?: string
          genre?: string
          id?: string
          image_url?: string | null
          instagram_handle?: string | null
          name: string
          spotify_url?: string | null
          updated_at?: string
        }
        Update: {
          bio?: string
          company_id?: string
          created_at?: string
          genre?: string
          id?: string
          image_url?: string | null
          instagram_handle?: string | null
          name?: string
          spotify_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artists_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_submissions: {
        Row: {
          booking_id: string
          checked_in_at: string
          company_id: string
          created_at: string
          creator_id: string
          id: string
          note: string
          proof_paths: string[]
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
        }
        Insert: {
          booking_id: string
          checked_in_at?: string
          company_id: string
          created_at?: string
          creator_id: string
          id?: string
          note?: string
          proof_paths?: string[]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Update: {
          booking_id?: string
          checked_in_at?: string
          company_id?: string
          created_at?: string
          creator_id?: string
          id?: string
          note?: string
          proof_paths?: string[]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_submissions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_submissions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip: string | null
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip?: string | null
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip?: string | null
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      authorization_records: {
        Row: {
          amount_cents: number
          attempt_count: number
          authorized_at: string | null
          booking_id: string
          canceled_at: string | null
          capture_amount_cents: number | null
          captured_at: string | null
          company_id: string
          created_at: string
          creator_id: string
          failed_at: string | null
          failure_reason: string | null
          grace_deadline_at: string | null
          id: string
          idempotency_key: string | null
          payment_method_id: string | null
          provider: string
          provider_intent_id: string | null
          released_at: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["authorization_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          attempt_count?: number
          authorized_at?: string | null
          booking_id: string
          canceled_at?: string | null
          capture_amount_cents?: number | null
          captured_at?: string | null
          company_id: string
          created_at?: string
          creator_id: string
          failed_at?: string | null
          failure_reason?: string | null
          grace_deadline_at?: string | null
          id?: string
          idempotency_key?: string | null
          payment_method_id?: string | null
          provider: string
          provider_intent_id?: string | null
          released_at?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["authorization_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          attempt_count?: number
          authorized_at?: string | null
          booking_id?: string
          canceled_at?: string | null
          capture_amount_cents?: number | null
          captured_at?: string | null
          company_id?: string
          created_at?: string
          creator_id?: string
          failed_at?: string | null
          failure_reason?: string | null
          grace_deadline_at?: string | null
          id?: string
          idempotency_key?: string | null
          payment_method_id?: string | null
          provider?: string
          provider_intent_id?: string | null
          released_at?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["authorization_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "authorization_records_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_records_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_records_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_tickets: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["ticket_kind"]
          status: Database["public"]["Enums"]["ticket_status"]
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["ticket_kind"]
          status?: Database["public"]["Enums"]["ticket_status"]
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["ticket_kind"]
          status?: Database["public"]["Enums"]["ticket_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_tickets_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          acceptance_deadline_at: string
          accepted_at: string | null
          attendance_state: Database["public"]["Enums"]["attendance_status"]
          authorization_amount_cents: number
          cancel_reason: string | null
          canceled_at: string | null
          company_id: string
          completed_at: string | null
          content_deadline_at: string | null
          content_required: boolean
          content_state: Database["public"]["Enums"]["content_status"]
          created_at: string
          creator_id: string
          creator_payment_cents: number
          deposit_percentage: number
          id: string
          includes_plus_one: boolean
          opportunity_id: string
          request_id: string
          show_id: string
          stated_ticket_value_cents: number
          status: Database["public"]["Enums"]["booking_status"]
          terms_accepted_at: string | null
          terms_version: string | null
          ticket_count: number
          ticket_instructions: string | null
          ticket_instructions_sent_at: string | null
          updated_at: string
        }
        Insert: {
          acceptance_deadline_at: string
          accepted_at?: string | null
          attendance_state?: Database["public"]["Enums"]["attendance_status"]
          authorization_amount_cents: number
          cancel_reason?: string | null
          canceled_at?: string | null
          company_id: string
          completed_at?: string | null
          content_deadline_at?: string | null
          content_required?: boolean
          content_state?: Database["public"]["Enums"]["content_status"]
          created_at?: string
          creator_id: string
          creator_payment_cents: number
          deposit_percentage: number
          id?: string
          includes_plus_one?: boolean
          opportunity_id: string
          request_id: string
          show_id: string
          stated_ticket_value_cents: number
          status?: Database["public"]["Enums"]["booking_status"]
          terms_accepted_at?: string | null
          terms_version?: string | null
          ticket_count: number
          ticket_instructions?: string | null
          ticket_instructions_sent_at?: string | null
          updated_at?: string
        }
        Update: {
          acceptance_deadline_at?: string
          accepted_at?: string | null
          attendance_state?: Database["public"]["Enums"]["attendance_status"]
          authorization_amount_cents?: number
          cancel_reason?: string | null
          canceled_at?: string | null
          company_id?: string
          completed_at?: string | null
          content_deadline_at?: string | null
          content_required?: boolean
          content_state?: Database["public"]["Enums"]["content_status"]
          created_at?: string
          creator_id?: string
          creator_payment_cents?: number
          deposit_percentage?: number
          id?: string
          includes_plus_one?: boolean
          opportunity_id?: string
          request_id?: string
          show_id?: string
          stated_ticket_value_cents?: number
          status?: Database["public"]["Enums"]["booking_status"]
          terms_accepted_at?: string | null
          terms_version?: string | null
          ticket_count?: number
          ticket_instructions?: string | null
          ticket_instructions_sent_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "show_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "show_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          onboarded_at: string | null
          suspended_at: string | null
          updated_at: string
          verified_at: string | null
          website: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          onboarded_at?: string | null
          suspended_at?: string | null
          updated_at?: string
          verified_at?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          onboarded_at?: string | null
          suspended_at?: string | null
          updated_at?: string
          verified_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      company_invites: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["company_member_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["company_member_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["company_member_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["company_member_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_member_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_member_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_submissions: {
        Row: {
          booking_id: string
          caption_note: string
          company_id: string
          created_at: string
          creator_id: string
          deliverable_id: string | null
          id: string
          post_url: string
          proof_paths: string[]
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["content_status"]
          submitted_at: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          caption_note?: string
          company_id: string
          created_at?: string
          creator_id: string
          deliverable_id?: string | null
          id?: string
          post_url: string
          proof_paths?: string[]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          caption_note?: string
          company_id?: string
          created_at?: string
          creator_id?: string
          deliverable_id?: string | null
          id?: string
          post_url?: string
          proof_paths?: string[]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_submissions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_submissions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_submissions_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverable_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payment_records: {
        Row: {
          amount_cents: number
          booking_id: string
          canceled_at: string | null
          company_id: string
          created_at: string
          creator_id: string
          failed_at: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          paid_at: string | null
          paused_at: string | null
          paused_by: string | null
          provider: string
          provider_transfer_id: string | null
          status: Database["public"]["Enums"]["creator_payment_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          booking_id: string
          canceled_at?: string | null
          company_id: string
          created_at?: string
          creator_id: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          paid_at?: string | null
          paused_at?: string | null
          paused_by?: string | null
          provider: string
          provider_transfer_id?: string | null
          status?: Database["public"]["Enums"]["creator_payment_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string
          canceled_at?: string | null
          company_id?: string
          created_at?: string
          creator_id?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          paid_at?: string | null
          paused_at?: string | null
          paused_by?: string | null
          provider?: string
          provider_transfer_id?: string | null
          status?: Database["public"]["Enums"]["creator_payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_payment_records_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payment_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payment_records_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payment_records_paused_by_fkey"
            columns: ["paused_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_profiles: {
        Row: {
          audience_size: number
          avg_views: number
          bio: string
          categories: string[]
          city: string
          country: string
          created_at: string
          example_work: Json
          id: string
          onboarded_at: string | null
          stripe_account_id: string | null
          stripe_onboarded_at: string | null
          stripe_payouts_enabled: boolean
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          audience_size?: number
          avg_views?: number
          bio?: string
          categories?: string[]
          city?: string
          country?: string
          created_at?: string
          example_work?: Json
          id?: string
          onboarded_at?: string | null
          stripe_account_id?: string | null
          stripe_onboarded_at?: string | null
          stripe_payouts_enabled?: boolean
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          audience_size?: number
          avg_views?: number
          bio?: string
          categories?: string[]
          city?: string
          country?: string
          created_at?: string
          example_work?: Json
          id?: string
          onboarded_at?: string | null
          stripe_account_id?: string | null
          stripe_onboarded_at?: string | null
          stripe_payouts_enabled?: boolean
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_social_accounts: {
        Row: {
          avg_views: number
          created_at: string
          followers: number
          handle: string
          id: string
          platform: Database["public"]["Enums"]["social_platform"]
          profile_id: string
          updated_at: string
          url: string | null
        }
        Insert: {
          avg_views?: number
          created_at?: string
          followers?: number
          handle: string
          id?: string
          platform: Database["public"]["Enums"]["social_platform"]
          profile_id: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          avg_views?: number
          created_at?: string
          followers?: number
          handle?: string
          id?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          profile_id?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_social_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverable_requirements: {
        Row: {
          created_at: string
          description: string
          id: string
          opportunity_id: string
          platform: Database["public"]["Enums"]["deliverable_platform"]
          quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          opportunity_id: string
          platform: Database["public"]["Enums"]["deliverable_platform"]
          quantity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          opportunity_id?: string
          platform?: Database["public"]["Enums"]["deliverable_platform"]
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverable_requirements_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "show_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          booking_id: string
          company_id: string
          created_at: string
          creator_id: string
          evidence_paths: string[]
          id: string
          kind: Database["public"]["Enums"]["dispute_kind"]
          opened_by: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }
        Insert: {
          booking_id: string
          company_id: string
          created_at?: string
          creator_id: string
          evidence_paths?: string[]
          id?: string
          kind: Database["public"]["Enums"]["dispute_kind"]
          opened_by: string
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Update: {
          booking_id?: string
          company_id?: string
          created_at?: string
          creator_id?: string
          evidence_paths?: string[]
          id?: string
          kind?: Database["public"]["Enums"]["dispute_kind"]
          opened_by?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          company_id: string
          created_at: string
          creator_id: string
          id: string
          last_message_at: string | null
          request_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          creator_id: string
          id?: string
          last_message_at?: string | null
          request_id: string
          subject?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          creator_id?: string
          id?: string
          last_message_at?: string | null
          request_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "show_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_paths: string[]
          body: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          read_by: string[]
          sender_id: string | null
          thread_id: string
        }
        Insert: {
          attachment_paths?: string[]
          body?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          read_by?: string[]
          sender_id?: string | null
          thread_id: string
        }
        Update: {
          attachment_paths?: string[]
          body?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          read_by?: string[]
          sender_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_payment_state: {
        Row: {
          created_at: string
          id: string
          kind: string
          state: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          kind: string
          state?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          state?: Json
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          emailed_at: string | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          emailed_at?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          emailed_at?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          brand: string
          created_at: string
          exp_month: number | null
          exp_year: number | null
          id: string
          is_default: boolean
          last4: string
          provider: string
          provider_method_id: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          brand?: string
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string
          provider: string
          provider_method_id: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          brand?: string
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string
          provider?: string
          provider_method_id?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      request_tickets: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["ticket_kind"]
          request_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["ticket_kind"]
          request_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["ticket_kind"]
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_tickets_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "show_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      show_opportunities: {
        Row: {
          application_deadline: string
          company_id: string
          content_deadline_days: number
          created_at: string
          creator_payment_cents: number
          deposit_percentage: number
          id: string
          notes: string
          plus_one_allowed: boolean
          published_at: string | null
          show_id: string
          stated_ticket_value_cents: number
          tickets_claimed: number
          tickets_total: number
          updated_at: string
        }
        Insert: {
          application_deadline: string
          company_id: string
          content_deadline_days?: number
          created_at?: string
          creator_payment_cents?: number
          deposit_percentage: number
          id?: string
          notes?: string
          plus_one_allowed?: boolean
          published_at?: string | null
          show_id: string
          stated_ticket_value_cents: number
          tickets_claimed?: number
          tickets_total: number
          updated_at?: string
        }
        Update: {
          application_deadline?: string
          company_id?: string
          content_deadline_days?: number
          created_at?: string
          creator_payment_cents?: number
          deposit_percentage?: number
          id?: string
          notes?: string
          plus_one_allowed?: boolean
          published_at?: string | null
          show_id?: string
          stated_ticket_value_cents?: number
          tickets_claimed?: number
          tickets_total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_opportunities_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: true
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      show_requests: {
        Row: {
          company_id: string
          created_at: string
          creator_id: string
          decided_at: string | null
          decided_by: string | null
          expired_at: string | null
          id: string
          includes_plus_one: boolean
          message: string
          opportunity_id: string
          show_id: string
          status: Database["public"]["Enums"]["request_status"]
          ticket_count: number
          updated_at: string
          waitlisted_at: string | null
          withdrawn_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          creator_id: string
          decided_at?: string | null
          decided_by?: string | null
          expired_at?: string | null
          id?: string
          includes_plus_one?: boolean
          message?: string
          opportunity_id: string
          show_id: string
          status?: Database["public"]["Enums"]["request_status"]
          ticket_count?: number
          updated_at?: string
          waitlisted_at?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          creator_id?: string
          decided_at?: string | null
          decided_by?: string | null
          expired_at?: string | null
          id?: string
          includes_plus_one?: boolean
          message?: string
          opportunity_id?: string
          show_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          ticket_count?: number
          updated_at?: string
          waitlisted_at?: string | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "show_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_requests_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "show_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_requests_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      shows: {
        Row: {
          artist_id: string
          cancel_reason: string | null
          canceled_at: string | null
          company_id: string
          created_at: string
          date: string
          doors_time: string | null
          hide_venue_until_approved: boolean
          id: string
          image_url: string | null
          postponed_from: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["show_status"]
          ticket_delivery_method: Database["public"]["Enums"]["ticket_delivery_method"]
          title: string | null
          tour_id: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          artist_id: string
          cancel_reason?: string | null
          canceled_at?: string | null
          company_id: string
          created_at?: string
          date: string
          doors_time?: string | null
          hide_venue_until_approved?: boolean
          id?: string
          image_url?: string | null
          postponed_from?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["show_status"]
          ticket_delivery_method?: Database["public"]["Enums"]["ticket_delivery_method"]
          title?: string | null
          tour_id?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          artist_id?: string
          cancel_reason?: string | null
          canceled_at?: string | null
          company_id?: string
          created_at?: string
          date?: string
          doors_time?: string | null
          hide_venue_until_approved?: boolean
          id?: string
          image_url?: string | null
          postponed_from?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["show_status"]
          ticket_delivery_method?: Database["public"]["Enums"]["ticket_delivery_method"]
          title?: string | null
          tour_id?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shows_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shows_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shows_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      tours: {
        Row: {
          artist_id: string
          company_id: string
          created_at: string
          description: string
          ends_on: string | null
          id: string
          name: string
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          artist_id: string
          company_id: string
          created_at?: string
          description?: string
          ends_on?: string | null
          id?: string
          name: string
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          artist_id?: string
          company_id?: string
          created_at?: string
          description?: string
          ends_on?: string | null
          id?: string
          name?: string
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["account_status"]
          suspended_at: string | null
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          suspended_at?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          suspended_at?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      venues: {
        Row: {
          address: string | null
          capacity: number | null
          city: string
          country: string
          created_at: string
          created_by_company: string | null
          id: string
          name: string
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          city: string
          country?: string
          created_at?: string
          created_by_company?: string | null
          id?: string
          name: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          capacity?: number | null
          city?: string
          country?: string
          created_at?: string
          created_by_company?: string | null
          id?: string
          name?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_created_by_company_fkey"
            columns: ["created_by_company"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          id: string
          payload: Json
          processed_at: string
          provider: string
          type: string
        }
        Insert: {
          id: string
          payload?: Json
          processed_at?: string
          provider: string
          type: string
        }
        Update: {
          id?: string
          payload?: Json
          processed_at?: string
          provider?: string
          type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
      is_company_member: { Args: { cid: string }; Returns: boolean }
      mark_thread_read: {
        Args: { p_thread_id: string; p_user_id: string }
        Returns: undefined
      }
      release_tickets: {
        Args: { p_count: number; p_opportunity_id: string }
        Returns: boolean
      }
      reserve_tickets: {
        Args: { p_count: number; p_opportunity_id: string }
        Returns: boolean
      }
      shares_company_with: { Args: { other: string }; Returns: boolean }
    }
    Enums: {
      account_status: "active" | "suspended"
      attendance_status:
        | "not_started"
        | "submitted"
        | "approved"
        | "rejected"
        | "disputed"
      authorization_status:
        | "not_scheduled"
        | "scheduled"
        | "pending"
        | "authorized"
        | "failed"
        | "released"
        | "captured"
        | "canceled"
      booking_status:
        | "awaiting_acceptance"
        | "awaiting_payment_method"
        | "confirmed"
        | "authorization_failed"
        | "attended"
        | "no_show_review"
        | "completed"
        | "canceled"
        | "disputed"
      company_member_role: "owner" | "admin" | "member"
      content_status:
        | "not_required"
        | "pending"
        | "submitted"
        | "revision_requested"
        | "approved"
        | "rejected"
        | "disputed"
      creator_payment_status:
        | "not_required"
        | "awaiting_funding"
        | "funded"
        | "pending_fulfillment"
        | "ready"
        | "paid"
        | "failed"
        | "disputed"
        | "canceled"
      deliverable_platform:
        | "instagram_story"
        | "instagram_reel"
        | "instagram_post"
        | "tiktok_video"
        | "youtube_short"
        | "youtube_video"
        | "twitter_post"
        | "other"
      dispute_kind: "attendance" | "content" | "charge" | "other"
      dispute_status: "open" | "under_review" | "resolved" | "closed"
      message_kind: "text" | "attachment" | "ticket_instructions" | "system"
      notification_type:
        | "request_submitted"
        | "request_approved"
        | "request_rejected"
        | "request_waitlisted"
        | "new_message"
        | "approval_expiring"
        | "booking_confirmed"
        | "payment_method_problem"
        | "authorization_placed"
        | "authorization_released"
        | "authorization_captured"
        | "upcoming_show_reminder"
        | "ticket_instructions"
        | "attendance_submitted"
        | "attendance_approved"
        | "attendance_rejected"
        | "content_deadline_approaching"
        | "content_submitted"
        | "content_approved"
        | "content_revision_requested"
        | "payment_released"
        | "show_canceled"
        | "show_postponed"
        | "booking_canceled"
        | "dispute_opened"
        | "dispute_resolved"
        | "invite_received"
        | "account_verified"
      request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "waitlisted"
        | "expired"
        | "withdrawn"
      show_status:
        | "draft"
        | "published"
        | "canceled"
        | "postponed"
        | "completed"
      social_platform:
        | "instagram"
        | "tiktok"
        | "youtube"
        | "twitter"
        | "twitch"
        | "other"
      ticket_delivery_method:
        | "will_call"
        | "digital_transfer"
        | "guest_list"
        | "box_office"
      ticket_kind: "primary" | "plus_one"
      ticket_status: "reserved" | "issued" | "used" | "unused" | "canceled"
      user_role: "creator" | "label" | "admin"
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
      account_status: ["active", "suspended"],
      attendance_status: [
        "not_started",
        "submitted",
        "approved",
        "rejected",
        "disputed",
      ],
      authorization_status: [
        "not_scheduled",
        "scheduled",
        "pending",
        "authorized",
        "failed",
        "released",
        "captured",
        "canceled",
      ],
      booking_status: [
        "awaiting_acceptance",
        "awaiting_payment_method",
        "confirmed",
        "authorization_failed",
        "attended",
        "no_show_review",
        "completed",
        "canceled",
        "disputed",
      ],
      company_member_role: ["owner", "admin", "member"],
      content_status: [
        "not_required",
        "pending",
        "submitted",
        "revision_requested",
        "approved",
        "rejected",
        "disputed",
      ],
      creator_payment_status: [
        "not_required",
        "awaiting_funding",
        "funded",
        "pending_fulfillment",
        "ready",
        "paid",
        "failed",
        "disputed",
        "canceled",
      ],
      deliverable_platform: [
        "instagram_story",
        "instagram_reel",
        "instagram_post",
        "tiktok_video",
        "youtube_short",
        "youtube_video",
        "twitter_post",
        "other",
      ],
      dispute_kind: ["attendance", "content", "charge", "other"],
      dispute_status: ["open", "under_review", "resolved", "closed"],
      message_kind: ["text", "attachment", "ticket_instructions", "system"],
      notification_type: [
        "request_submitted",
        "request_approved",
        "request_rejected",
        "request_waitlisted",
        "new_message",
        "approval_expiring",
        "booking_confirmed",
        "payment_method_problem",
        "authorization_placed",
        "authorization_released",
        "authorization_captured",
        "upcoming_show_reminder",
        "ticket_instructions",
        "attendance_submitted",
        "attendance_approved",
        "attendance_rejected",
        "content_deadline_approaching",
        "content_submitted",
        "content_approved",
        "content_revision_requested",
        "payment_released",
        "show_canceled",
        "show_postponed",
        "booking_canceled",
        "dispute_opened",
        "dispute_resolved",
        "invite_received",
        "account_verified",
      ],
      request_status: [
        "pending",
        "approved",
        "rejected",
        "waitlisted",
        "expired",
        "withdrawn",
      ],
      show_status: ["draft", "published", "canceled", "postponed", "completed"],
      social_platform: [
        "instagram",
        "tiktok",
        "youtube",
        "twitter",
        "twitch",
        "other",
      ],
      ticket_delivery_method: [
        "will_call",
        "digital_transfer",
        "guest_list",
        "box_office",
      ],
      ticket_kind: ["primary", "plus_one"],
      ticket_status: ["reserved", "issued", "used", "unused", "canceled"],
      user_role: ["creator", "label", "admin"],
    },
  },
} as const
