-- LenaMaps Database Schema for Supabase
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User profiles table (extends Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium')),
    daily_route_limit INTEGER DEFAULT 5, -- 5 routes/day for authenticated users
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage tracking table (for both anonymous and authenticated users)
CREATE TABLE IF NOT EXISTS public.usage_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE, -- NULL for anonymous users
    anonymous_id TEXT, -- For tracking anonymous users (fingerprint + IP hash)
    api_call_type TEXT NOT NULL CHECK (api_call_type IN ('directions', 'geocoding', 'places_details')),
    route_count INTEGER DEFAULT 1, -- Each route = 1 count (may have multiple API calls)
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date DATE DEFAULT CURRENT_DATE -- For daily limits
);

-- Index for fast lookup of daily usage
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_date ON public.usage_tracking(user_id, date);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_anon_date ON public.usage_tracking(anonymous_id, date);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_ip_date ON public.usage_tracking(ip_address, date);

-- Saved routes table (only for authenticated users)
CREATE TABLE IF NOT EXISTS public.saved_routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    route_name TEXT NOT NULL,
    locations JSONB NOT NULL, -- Array of {lat, lng, name, address}
    modes JSONB NOT NULL, -- Array of transportation modes
    route_data JSONB, -- Cached route response from Google Maps
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup of user routes
CREATE INDEX IF NOT EXISTS idx_saved_routes_user ON public.saved_routes(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_routes_created ON public.saved_routes(created_at DESC);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;

-- User profiles: Users can only read/update their own profile
CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- Usage tracking: Users can only view their own usage
CREATE POLICY "Users can view own usage" ON public.usage_tracking
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can insert usage records (backend only)
CREATE POLICY "Service role can insert usage" ON public.usage_tracking
    FOR INSERT WITH CHECK (true);

-- Saved routes: Users can manage their own routes
CREATE POLICY "Users can view own routes" ON public.saved_routes
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own routes" ON public.saved_routes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routes" ON public.saved_routes
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own routes" ON public.saved_routes
    FOR DELETE USING (auth.uid() = user_id);

-- Public routes can be viewed by anyone
CREATE POLICY "Public routes are viewable by everyone" ON public.saved_routes
    FOR SELECT USING (is_public = true);

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_saved_routes_updated_at BEFORE UPDATE ON public.saved_routes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to check daily usage limit
CREATE OR REPLACE FUNCTION public.check_daily_usage_limit(
    p_user_id UUID DEFAULT NULL,
    p_anonymous_id TEXT DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL
)
RETURNS TABLE(
    routes_used_today INTEGER,
    daily_limit INTEGER,
    can_create_route BOOLEAN
) AS $$
DECLARE
    v_routes_used INTEGER := 0;
    v_limit INTEGER := 1; -- Default for anonymous
BEGIN
    -- If authenticated user
    IF p_user_id IS NOT NULL THEN
        -- Get user's daily limit
        SELECT daily_route_limit INTO v_limit
        FROM public.user_profiles
        WHERE id = p_user_id;

        -- Count routes used today
        SELECT COALESCE(SUM(route_count), 0)::INTEGER INTO v_routes_used
        FROM public.usage_tracking
        WHERE user_id = p_user_id
        AND date = CURRENT_DATE;
    ELSE
        -- Anonymous user: check by anonymous_id OR IP
        v_limit := 1; -- Anonymous users get 1 route/day

        -- Count routes by anonymous_id or IP
        SELECT COALESCE(SUM(route_count), 0)::INTEGER INTO v_routes_used
        FROM public.usage_tracking
        WHERE (
            (p_anonymous_id IS NOT NULL AND anonymous_id = p_anonymous_id) OR
            (p_ip_address IS NOT NULL AND ip_address = p_ip_address)
        )
        AND date = CURRENT_DATE;
    END IF;

    RETURN QUERY SELECT
        v_routes_used,
        v_limit,
        (v_routes_used < v_limit) AS can_create_route;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
