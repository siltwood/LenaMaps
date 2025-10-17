# LenaMaps Token System - Implementation Guide

## Overview

This guide explains the token-based authentication and rate limiting system implemented for LenaMaps. The system protects your Google Maps API usage by limiting free users while encouraging sign-ups.

## Rate Limits (Option D - Ultra Conservative)

- **Anonymous users**: 1 route per day
- **Authenticated users**: 5 routes per day
- **Tracking**: Browser fingerprint + IP address for anonymous users

---

## ✅ What's Been Completed

### Backend (100%)

1. **Database Schema** (`database/schema.sql`)
   - User profiles table
   - Usage tracking table
   - Saved routes table
   - Row Level Security (RLS) policies
   - Helper functions for rate limit checks

2. **Authentication Routes** (`backend/src/routes/auth.js`)
   - POST `/api/auth/signup` - Email/password signup
   - POST `/api/auth/login` - Email/password login
   - POST `/api/auth/logout` - Logout
   - GET `/api/auth/me` - Get user profile
   - POST `/api/auth/reset-password` - Request password reset
   - POST `/api/auth/update-password` - Update password

3. **Usage Tracking Routes** (`backend/src/routes/usage.js`)
   - GET `/api/usage/check` - Check remaining routes
   - POST `/api/usage/track` - Track route creation
   - GET `/api/usage/history` - Get usage history

4. **Middleware**
   - `authMiddleware.js` - JWT verification
   - `rateLimitMiddleware.js` - Rate limiting checks

### Frontend (100%)

1. **Supabase Client** (`frontend/src/utils/supabaseClient.js`)
   - Configured Supabase connection
   - Helper functions

2. **Fingerprinting** (`frontend/src/utils/fingerprint.js`)
   - Anonymous user tracking via browser fingerprint
   - Fallback to localStorage

3. **Auth Modal** (`frontend/src/components/Shared/AuthModal/`)
   - Login/Signup/Password Reset UI
   - Google OAuth integration (requires setup)
   - Responsive design

4. **Usage Indicator** (`frontend/src/components/Shared/UsageIndicator/`)
   - Shows routes used/remaining
   - Visual progress bar
   - Upgrade prompts for anonymous users

---

## 🚧 Integration Steps (What You Need to Do)

### Step 1: Set Up Supabase

1. Go to https://supabase.com and create a new project
2. In Supabase SQL Editor, run `database/schema.sql`
3. Copy your Supabase credentials to `.env`:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here  # KEEP SECRET!
```

### Step 2: Enable Google OAuth (Optional)

1. In Supabase Dashboard → Authentication → Providers
2. Enable Google provider
3. Create OAuth 2.0 credentials in Google Cloud Console
4. Add redirect URI: `https://your-project-ref.supabase.co/auth/v1/callback`

### Step 3: Integrate Components into AppContent

Update `frontend/src/components/AppContent.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../utils/supabaseClient';
import { getFingerprint, initFingerprint } from '../utils/fingerprint';
import AuthModal from './Shared/AuthModal/AuthModal';
import UsageIndicator from './Shared/UsageIndicator/UsageIndicator';

function AppContent() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');
  const [authModalMessage, setAuthModalMessage] = useState('');

  // Initialize fingerprinting on mount
  useEffect(() => {
    if (isSupabaseConfigured()) {
      initFingerprint();
      checkSession();
    }
  }, []);

  // Check for existing session
  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setSession(session);
    setUser(session?.user || null);

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  };

  // Handle authentication success
  const handleAuthSuccess = (user, session) => {
    setUser(user);
    setSession(session);
    // Refresh usage indicator, etc.
  };

  // Show auth modal when user hits rate limit
  const handleRateLimitExceeded = () => {
    setAuthModalMode('signup');
    setAuthModalMessage('You\'ve reached your daily limit. Sign up to get 5 routes per day!');
    setShowAuthModal(true);
  };

  return (
    <div className="app">
      {/* Your existing header */}

      {/* Add Usage Indicator */}
      {isSupabaseConfigured() && (
        <UsageIndicator
          user={user}
          onUpgradeClick={() => {
            setAuthModalMode('signup');
            setShowAuthModal(true);
          }}
        />
      )}

      {/* Your existing content */}

      {/* Add Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
        initialMode={authModalMode}
        message={authModalMessage}
      />
    </div>
  );
}
```

### Step 4: Implement Rate Limiting on Route Creation

Before creating a route, check the rate limit:

```jsx
const createRoute = async (locations, modes) => {
  try {
    const anonymousId = user ? null : await getFingerprint();
    const accessToken = session?.access_token;

    // Check rate limit
    const checkResponse = await fetch(
      `http://localhost:5000/api/usage/check?anonymousId=${anonymousId || ''}`,
      {
        headers: accessToken ? {
          'Authorization': `Bearer ${accessToken}`
        } : {}
      }
    );

    const checkData = await checkResponse.json();

    if (!checkData.canCreateRoute) {
      // Show rate limit modal
      handleRateLimitExceeded();
      return;
    }

    // Create the route (your existing logic)
    // ...

    // Track usage after successful route creation
    await fetch('http://localhost:5000/api/usage/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({
        anonymousId,
        apiCallType: 'directions',
        routeCount: 1
      })
    });

  } catch (error) {
    console.error('Route creation error:', error);
  }
};
```

### Step 5: Start Backend Server

```bash
cd backend
npm run dev
```

Backend will run on http://localhost:5000

---

## 🔐 Security Considerations

1. **Never expose service role key** - It bypasses RLS and should only be on the server
2. **Use HTTPS in production** - Required for auth tokens
3. **Enable email verification** - Configured in Supabase Auth settings
4. **Rate limit backend endpoints** - Consider adding express-rate-limit
5. **Validate all inputs** - Backend validates, but add frontend validation too

---

## 🧪 Testing the System

### Test Anonymous User Flow

1. Open app in incognito mode
2. Create 1 route
3. Try to create a 2nd route → Should show rate limit modal

### Test Authenticated User Flow

1. Sign up with email/password
2. Verify you can create 5 routes
3. On 6th attempt → Should show rate limit message

### Test Rate Limit Reset

Rate limits reset daily at midnight UTC. You can manually test by:

```sql
-- In Supabase SQL Editor
DELETE FROM public.usage_tracking WHERE date = CURRENT_DATE;
```

---

## 📊 Monitoring Usage

View usage in Supabase Dashboard:

```sql
-- Total routes today
SELECT COUNT(*) FROM usage_tracking WHERE date = CURRENT_DATE;

-- Routes by user type
SELECT
  CASE WHEN user_id IS NOT NULL THEN 'Authenticated' ELSE 'Anonymous' END as user_type,
  COUNT(*) as route_count
FROM usage_tracking
WHERE date = CURRENT_DATE
GROUP BY user_type;

-- Top users
SELECT
  user_id,
  COUNT(*) as routes_created,
  MAX(created_at) as last_activity
FROM usage_tracking
GROUP BY user_id
ORDER BY routes_created DESC
LIMIT 10;
```

---

## 🚀 Future Enhancements (TODO)

- [ ] Implement Google OAuth (requires Google Cloud setup)
- [ ] Set up email service for password recovery
- [ ] Add wildcard redirect for auth routes
- [ ] Implement auth redirect after login/signup
- [ ] Run security audit on authentication flow
- [ ] Plan and implement paid tier system
- [ ] Add usage analytics dashboard
- [ ] Implement route saving for authenticated users
- [ ] Add social sharing for public routes

---

## 🐛 Troubleshooting

**Issue**: "Supabase credentials not configured"
- **Solution**: Check `.env` file has all Supabase variables

**Issue**: Rate limiting not working
- **Solution**: Ensure backend is running and database schema is deployed

**Issue**: Anonymous tracking not working
- **Solution**: Check browser allows fingerprinting, fallback uses localStorage

**Issue**: Google OAuth not working
- **Solution**: Verify OAuth credentials in Supabase and Google Cloud Console

---

## 📞 Support

For issues or questions:
1. Check the console for error messages
2. Verify Supabase database schema is deployed
3. Ensure backend server is running
4. Check that all environment variables are set

## Summary

You've built a complete authentication and rate limiting system! The backend is 100% complete, and the frontend components are ready to use. Just follow the integration steps above to wire everything together.

**Key Files to Integrate:**
- `AppContent.jsx` - Add auth state and modals
- Route creation logic - Add rate limit checks
- `.env` - Add Supabase credentials
