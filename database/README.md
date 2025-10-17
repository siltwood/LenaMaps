# LenaMaps Database Setup

## Supabase Configuration

### 1. Create a Supabase Project

1. Go to https://supabase.com
2. Create a new project
3. Note down your:
   - Project URL
   - Anon (public) key
   - Service role key (keep this secret!)

### 2. Run the Database Schema

1. Open your Supabase Dashboard
2. Go to SQL Editor
3. Copy and paste the contents of `schema.sql`
4. Click "Run" to create all tables, indexes, and policies

### 3. Enable Google OAuth (Optional, for Google sign-in)

1. In Supabase Dashboard, go to Authentication > Providers
2. Enable Google provider
3. Add your Google OAuth credentials:
   - Go to https://console.cloud.google.com
   - Create OAuth 2.0 Client ID
   - Add authorized redirect URIs: `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - Copy Client ID and Client Secret to Supabase

### 4. Configure Environment Variables

Add these to your `.env` file in the project root:

```bash
# Supabase
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Backend (for service role operations)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Database Schema Overview

### Tables

**user_profiles**
- Extends Supabase Auth users
- Stores subscription tier and daily limits
- Default: 5 routes/day for authenticated users

**usage_tracking**
- Tracks API usage per user/day
- Supports both authenticated and anonymous users
- Anonymous tracking via fingerprint + IP hash

**saved_routes**
- Stores user's saved routes
- Only accessible by authenticated users
- Optional public sharing

### Rate Limits (Option D - Ultra Conservative)

- **Anonymous users**: 1 route per day
- **Authenticated users**: 5 routes per day
- **Premium users** (future): Higher limits

### Key Functions

**check_daily_usage_limit(user_id, anonymous_id, ip_address)**
- Returns routes used today, daily limit, and whether user can create more routes
- Used by backend to enforce rate limits

## Testing

After running the schema, you can test with:

```sql
-- Check if tables were created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';

-- Test the usage check function
SELECT * FROM public.check_daily_usage_limit(
    NULL, -- user_id (null for anonymous)
    'test-fingerprint-123',
    '192.168.1.1'
);
```
