-- LenaMaps Database Schema V2.0
-- Complete rebuild for token/limit system with Stripe integration
-- Run this in Supabase SQL Editor
--
-- This replaces the old schema.sql with:
-- - Stripe subscriptions table
-- - Simplified usage tracking (route count only)
-- - 30-day expiration on saved routes (Google ToS)
-- - Webhook events logging
-- - Improved RLS policies

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USER PROFILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro')),
  stripe_customer_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- USAGE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  anonymous_id TEXT,
  date DATE DEFAULT CURRENT_DATE,
  route_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one ID is provided
  CONSTRAINT one_id_required CHECK (
    (user_id IS NOT NULL AND anonymous_id IS NULL) OR
    (user_id IS NULL AND anonymous_id IS NOT NULL)
  ),

  -- Unique constraint per user/day or anonymous/day
  CONSTRAINT unique_user_date UNIQUE(user_id, date),
  CONSTRAINT unique_anon_date UNIQUE(anonymous_id, date)
);

-- Function to check daily usage limit
CREATE OR REPLACE FUNCTION check_daily_usage_limit(
  p_user_id UUID DEFAULT NULL,
  p_anonymous_id TEXT DEFAULT NULL,
  p_tier TEXT DEFAULT 'free'
)
RETURNS TABLE (
  can_create BOOLEAN,
  current_count INTEGER,
  daily_limit INTEGER,
  remaining INTEGER
) AS $$
DECLARE
  v_count INTEGER;
  v_limit INTEGER;
BEGIN
  -- Get current usage for today
  IF p_user_id IS NOT NULL THEN
    SELECT COALESCE(route_count, 0) INTO v_count
    FROM usage_tracking
    WHERE user_id = p_user_id AND date = CURRENT_DATE;
  ELSE
    SELECT COALESCE(route_count, 0) INTO v_count
    FROM usage_tracking
    WHERE anonymous_id = p_anonymous_id AND date = CURRENT_DATE;
  END IF;

  v_count := COALESCE(v_count, 0);

  -- Determine limit based on tier
  CASE p_tier
    WHEN 'pro' THEN v_limit := 999999;
    WHEN 'free' THEN v_limit := 10;
    ELSE v_limit := 2;  -- anonymous
  END CASE;

  -- Return results
  RETURN QUERY SELECT
    v_count < v_limit,
    v_count,
    v_limit,
    GREATEST(v_limit - v_count, 0);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SUBSCRIPTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid', 'trialing')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SAVED ROUTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS saved_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  locations JSONB NOT NULL,
  modes JSONB NOT NULL,
  custom_draw_enabled JSONB,
  custom_points JSONB,
  snap_to_roads JSONB,
  locked_segments JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to clean up expired routes (runs daily via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_routes()
RETURNS void AS $$
BEGIN
  DELETE FROM saved_routes WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- WEBHOOK EVENTS (for debugging Stripe webhooks)
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  stripe_event_id TEXT UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_routes ENABLE ROW LEVEL SECURITY;

-- User Profiles: Users can read and update their own profile
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
CREATE POLICY "Users can read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Usage Tracking: Users can read their own usage
DROP POLICY IF EXISTS "Users can read own usage" ON usage_tracking;
CREATE POLICY "Users can read own usage" ON usage_tracking
  FOR SELECT USING (auth.uid() = user_id);

-- Subscriptions: Users can read their own subscription
DROP POLICY IF EXISTS "Users can read own subscription" ON subscriptions;
CREATE POLICY "Users can read own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Saved Routes: Users can manage their own routes
DROP POLICY IF EXISTS "Users can read own routes" ON saved_routes;
CREATE POLICY "Users can read own routes" ON saved_routes
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own routes" ON saved_routes;
CREATE POLICY "Users can insert own routes" ON saved_routes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own routes" ON saved_routes;
CREATE POLICY "Users can update own routes" ON saved_routes
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own routes" ON saved_routes;
CREATE POLICY "Users can delete own routes" ON saved_routes
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- INDEXES (for performance)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe ON user_profiles(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_tracking(user_id, date);
CREATE INDEX IF NOT EXISTS idx_usage_anon_date ON usage_tracking(anonymous_id, date);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_saved_routes_user ON saved_routes(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_routes_expires ON saved_routes(expires_at);

CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe ON webhook_events(stripe_event_id);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_usage_tracking_updated_at ON usage_tracking;
CREATE TRIGGER update_usage_tracking_updated_at
  BEFORE UPDATE ON usage_tracking
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_saved_routes_updated_at ON saved_routes;
CREATE TRIGGER update_saved_routes_updated_at
  BEFORE UPDATE ON saved_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- NOTES
-- ============================================================================

-- To schedule daily cleanup of expired routes, use pg_cron extension:
-- SELECT cron.schedule('cleanup-expired-routes', '0 2 * * *', 'SELECT cleanup_expired_routes()');

-- To manually clean up expired routes:
-- SELECT cleanup_expired_routes();

-- To check usage for a user:
-- SELECT * FROM check_daily_usage_limit('user-uuid', NULL, 'free');

-- To check usage for anonymous user:
-- SELECT * FROM check_daily_usage_limit(NULL, 'anon-fingerprint', 'anonymous');
