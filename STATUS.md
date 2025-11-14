# LenaMaps Backend Integration Status

**Last Updated:** November 13, 2025
**Status:** Backend ready, frontend DISCONNECTED for release

---

## 🎯 Current State

### ✅ What's Complete

**Backend (100% coded, ready to use):**
- Full authentication system
  - Email/password signup & login
  - Google OAuth flow
  - Password reset via email
  - JWT token generation
- Usage tracking API
  - Check daily limits
  - Track route creation
  - Get usage statistics
- Stripe payment integration
  - Checkout session creation
  - Webhook handling
  - Subscription management
- Database schema (Supabase)
  - User profiles
  - Usage tracking
  - Subscriptions
  - Saved routes
  - Webhook events

**Frontend (coded but DISCONNECTED):**
- `useAnonymousId` hook - generates persistent anonymous ID
- `useUsageTracking` hook - tracks routes with deduplication
- `UpgradeModal` component - limit reached prompt
- API service layer (`frontend/src/services/api.js`)

### 🔌 What's DISCONNECTED (for release)

The following code exists but is **commented out** in the frontend:

**AppContent.jsx:**
- Line 12-14: Import statements for useUsageTracking and UpgradeModal
- Line 44-45: usageTracking hook initialization
- Line 316-317: usageTracking prop passed to GoogleMap
- Line 402-408: UpgradeModal component rendering

**MapComponent.jsx:**
- Line 24-25: usageTracking prop in component signature
- Line 216-217: usageTracking prop passed to RouteSegmentManager

**RouteSegmentManager.jsx:**
- Line 1268-1274: Usage tracking call after route calculation

All disconnected code is marked with:
```
// DISCONNECTED: Usage tracking paused for release - see STATUS.md
```

**Why disconnected:**
- Backend requires credentials we haven't set up yet (Google OAuth, PurelyMail, Stripe)
- PM wants fast release without backend dependency
- Frontend works standalone for now
- Can be reconnected by simply uncommenting the marked sections

---

## 🔑 Required Credentials (When Reconnecting)

To enable backend features, you need these credentials in `backend/.env`:

### 1. **Supabase** (ALREADY CONFIGURED ✅)
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Status:** ✅ Working - already configured

---

### 2. **Google OAuth** (NEEDED)

**What you need:**
- Google Cloud Console account
- OAuth 2.0 credentials

**Setup steps:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials (Web application)
5. Set authorized redirect URI: `http://localhost:5001/api/auth/google/callback`
6. Copy Client ID and Client Secret

**Add to `.env`:**
```env
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5001/api/auth/google/callback
```

**For production:**
```env
GOOGLE_REDIRECT_URI=https://your-api-domain.com/api/auth/google/callback
```

---

### 3. **PurelyMail SMTP** (NEEDED)

**What you need:**
- PurelyMail account
- SMTP credentials

**Setup steps:**
1. Log into [purelymail.com](https://purelymail.com)
2. Go to Settings → SMTP
3. Create SMTP credentials
4. Copy username and password

**Add to `.env`:**
```env
SMTP_HOST=smtp.purelymail.com
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
SMTP_FROM=LenaMaps <noreply@lenamaps.com>
```

**Note:** In development without SMTP configured, password reset links are logged to console instead.

---

### 4. **Stripe** (NEEDED)

**What you need:**
- Stripe account (free)
- Product and Price created
- Webhook endpoint configured

**Setup steps:**

**A. Get API Keys:**
1. Go to [stripe.com/dashboard](https://stripe.com/dashboard)
2. Navigate to Developers → API Keys
3. Copy Secret Key (starts with `sk_test_` in test mode)

**B. Create Product and Price:**
1. Go to Products → Create Product
2. Name: "LenaMaps Pro"
3. Pricing: $7/month recurring
4. Copy the Price ID (starts with `price_`)

**C. Setup Webhook (for production):**
1. Go to Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://your-domain.com/api/stripe/webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy Webhook Signing Secret (starts with `whsec_`)

**For local development:**
```bash
# Use Stripe CLI to forward webhooks
stripe listen --forward-to localhost:5001/api/stripe/webhook
```

**Add to `.env`:**
```env
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PRICE_ID=price_your_price_id
```

**For production:**
```env
STRIPE_SECRET_KEY=sk_live_your_live_key
STRIPE_WEBHOOK_SECRET=whsec_your_production_secret
STRIPE_PRICE_ID=price_your_production_price_id
```

---

## 📋 Reconnection Checklist

When you're ready to reconnect the frontend to backend:

### Step 1: Configure Backend
- [ ] Add Google OAuth credentials to `.env`
- [ ] Add PurelyMail SMTP credentials to `.env`
- [ ] Add Stripe credentials to `.env`
- [ ] Test backend: `cd backend && npm run dev`
- [ ] Verify: `curl http://localhost:5001/health`

### Step 2: Reconnect Frontend
- [ ] Uncomment imports in `AppContent.jsx` (lines 12-14)
- [ ] Uncomment usage tracking hook in `AppContent.jsx` (lines 44-45)
- [ ] Uncomment usageTracking prop in `AppContent.jsx` (lines 316-317)
- [ ] Uncomment UpgradeModal in `AppContent.jsx` (lines 402-408)
- [ ] Uncomment usageTracking prop in `MapComponent.jsx` (lines 24-25)
- [ ] Uncomment usageTracking prop in `MapComponent.jsx` (lines 216-217)
- [ ] Uncomment tracking call in `RouteSegmentManager.jsx` (lines 1268-1274)
- [ ] Test: Create a route and check console for tracking logs

### Step 3: Test Full Flow
- [ ] Create 2 routes → should see tracking in console
- [ ] Check Supabase → verify usage_tracking records
- [ ] Test signup (requires Google OAuth)
- [ ] Test password reset (requires PurelyMail)
- [ ] Test Stripe checkout (requires Stripe)

---

## 🗂️ File Reference

### Backend Files
```
backend/
├── .env.example              # Template for credentials
├── server.js                 # Main server (port 5001)
├── src/
│   ├── config/
│   │   ├── env.js           # Environment validation
│   │   └── limits.js        # Dev vs prod limits
│   ├── routes/
│   │   ├── auth.js          # Auth endpoints
│   │   ├── usage.js         # Usage tracking endpoints
│   │   └── stripe.js        # Stripe endpoints
│   └── utils/
│       ├── auth.js          # JWT, password hashing
│       └── email.js         # PurelyMail SMTP
└── API.md                    # Complete API documentation
```

### Frontend Files
```
frontend/src/
├── services/
│   └── api.js               # Centralized API calls
├── hooks/
│   ├── useAnonymousId.js    # Anonymous ID generation
│   └── useUsageTracking.js  # Usage tracking hook
├── components/
│   ├── AppContent.jsx       # Main app (DISCONNECTED HERE)
│   └── UpgradeModal.jsx     # Limit reached modal
└── features/map/GoogleMap/components/
    ├── MapComponent.jsx     # (DISCONNECTED HERE)
    └── RouteSegmentManager.jsx  # (DISCONNECTED HERE)
```

---

## 🚀 Quick Start (When Ready)

1. **Add credentials to `backend/.env`** (see sections above)

2. **Start backend:**
```bash
cd backend
npm install
npm run dev
```

3. **Reconnect frontend integration:**

   Search for `// DISCONNECTED: Usage tracking paused for release - see STATUS.md` in these files:

   - `frontend/src/components/AppContent.jsx` (4 locations)
   - `frontend/src/features/map/GoogleMap/components/MapComponent.jsx` (2 locations)
   - `frontend/src/features/map/GoogleMap/components/RouteSegmentManager.jsx` (1 location)

   Uncomment all marked sections and save.

4. **Verify it works:**
```bash
# Check backend health
curl http://localhost:5001/health

# Check usage tracking
curl "http://localhost:5001/api/usage/check?anonymousId=test123"
```

5. **Test in browser:**
   - Open http://localhost:3000
   - Create a route
   - Check browser console for `✅ Route tracked` messages
   - Verify Supabase `usage_tracking` table shows new records

---

## 📊 What Works Right Now (No Backend)

- ✅ Route planning and visualization
- ✅ Multiple locations and transport modes
- ✅ Custom drawing
- ✅ Route animation
- ✅ IndexedDB caching (Google Maps API responses)
- ✅ Local storage for preferences

**What's missing without backend:**
- ❌ User accounts (signup/login)
- ❌ Usage limits enforcement
- ❌ Saved routes (server-side)
- ❌ Pro subscriptions

---

## 📞 Support

**Documentation:**
- Backend API: `backend/API.md`
- Setup guide: `backend/SETUP.md`

**Common Issues:**
- Backend won't start → Check `.env` file
- Auth features disabled → Missing Google OAuth creds
- Emails not sending → Missing PurelyMail creds
- Stripe not working → Missing Stripe creds

---

## 🎯 Next Steps

1. **Now:** Release frontend standalone
2. **Phase 2:** Get credentials (Google, PurelyMail, Stripe)
3. **Phase 3:** Reconnect frontend to backend
4. **Phase 4:** Test full auth + payment flow
5. **Phase 5:** Deploy backend to production (Heroku/Railway)
6. **Phase 6:** Enable usage limits and monetization

---

## 🔮 Future Features (Backlog)

### Admin Panel / Dashboard

Build an admin panel to monitor system health and performance:

**Cache Performance Monitoring:**
- Real-time cache hit rates (Directions, Geocoding, Places)
- Cost savings calculator (API calls avoided × cost per call)
- Cache size metrics (memory + IndexedDB usage)
- Historical trends (daily/weekly cache performance)
- Cache clearing controls for debugging

**Usage Analytics:**
- Total routes created (daily/weekly/monthly)
- Active users and anonymous sessions
- Popular routes and destinations
- User tier breakdown (anonymous/free/pro)
- Revenue metrics (subscriptions, upgrades)

**System Health:**
- API quota monitoring (Google Maps API limits)
- Error rates and failed requests
- Database performance (Supabase queries)
- Webhook health (Stripe events)

**User Management:**
- View user accounts and subscription status
- Manual subscription overrides (refunds, extensions)
- Ban/unban users if needed
- Export user data (GDPR compliance)

**Technical Stack:**
- Backend: Add `/api/admin/*` routes (protected by admin role)
- Frontend: React admin dashboard (separate route `/admin`)
- Auth: Supabase RLS with admin role check
- Charts: recharts or Chart.js for visualizations

**Implementation Notes:**
- Cache stats already available via `directionsCache.getStats()`
- Need to add backend endpoint to aggregate stats across all users
- Store cache stats snapshots in Supabase for historical data
- Add admin role to Supabase user metadata
- See `frontend/CACHING.md` for cache implementation details

---

**Questions?** Check `backend/API.md` for endpoint details or `backend/SETUP.md` for setup instructions.
