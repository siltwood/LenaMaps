/**
 * Supabase client for backend operations
 *
 * Uses service role key to bypass RLS (Row Level Security)
 * Only use server-side - never expose service role key to frontend
 */

const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('./env');

// Create Supabase client with service role key for backend operations
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

module.exports = { supabase };
