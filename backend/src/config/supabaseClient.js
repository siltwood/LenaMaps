/**
 * Supabase client for backend operations
 *
 * Uses service role key to bypass RLS (Row Level Security)
 * Only use server-side - never expose service role key to frontend
 *
 * DISCONNECTED: Usage tracking paused for release - see STATUS.md
 * Supabase client is optional - only initialized if env vars are set
 */

const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('./env');

// Create Supabase client with service role key for backend operations (if configured)
let supabase = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

module.exports = { supabase };
