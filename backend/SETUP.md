# Backend Setup Guide

Complete guide to setting up the LenaMaps backend with authentication, usage tracking, and Stripe payments.

## Prerequisites

- Node.js 18+ and npm
- Supabase account (free tier works)
- Stripe account (test mode is fine for development)
- PurelyMail account (optional - for password reset emails)

## 1. Install Dependencies

```bash
cd backend
npm install
```

## 2. Supabase Setup

### Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Save your project URL and service role key

### Run Database Schema

1. Open Supabase SQL Editor
2. Run `/database/schema-v2.sql` to create tables and functions
3. Run `/database/migrations/001_add_reset_token_fields.sql` for password reset

### Enable Row Level Security (RLS)

The schema includes RLS policies. Verify they're enabled in the Supabase dashboard.

## 3. Stripe Setup

### Get API Keys

1. Go to [stripe.com](https://stripe.com/dashboard)
2. Navigate to Developers → API Keys
3. Copy your **Secret key** (starts with `sk_test_` in test mode)

### Create Product and Price

1. Go to Products → Create Product
2. Name: "LenaMaps Pro"
3. Pricing: $7/month recurring
4. Copy the **Price ID** (starts with `price_`)

### Setup Webhook (for production)

1. Go to Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://your-domain.com/api/stripe/webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the **Webhook signing secret** (starts with `whsec_`)

For local development, use Stripe CLI:
```bash
stripe listen --forward-to localhost:5000/api/stripe/webhook
```

## 4. Google OAuth Setup (Optional)

### Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:5000/api/auth/google/callback`
5. Copy **Client ID** and **Client Secret**

## 5. PurelyMail SMTP Setup (Optional)

For password reset emails:

1. Log into [purelymail.com](https://purelymail.com)
2. Go to Settings → SMTP
3. Create SMTP credentials
4. Save username and password

**Note**: In development, password reset links are logged to console if SMTP is not configured.

## 6. Environment Configuration

Create `.env` file in `/backend`:

```bash
# Copy from .env.example
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Environment
NODE_ENV=development

# Server
PORT=5000
FRONTEND_URL=http://localhost:3001

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your_random_secret_key_here
JWT_EXPIRES_IN=7d

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback

# Stripe
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PRICE_ID=price_your_price_id

# PurelyMail SMTP (optional)
SMTP_HOST=smtp.purelymail.com
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
SMTP_FROM=LenaMaps <noreply@lenamaps.com>
```

### Required Environment Variables

Minimum required for basic functionality:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`

### Generate JWT Secret

```bash
openssl rand -base64 32
```

## 7. Start Development Server

```bash
npm run dev
```

Server will start on `http://localhost:5000`

### Verify Server is Running

```bash
curl http://localhost:5000/health
```

Should return:
```json
{
  "status": "ok",
  "environment": "development"
}
```

## 8. API Endpoints

### Authentication

- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/google` - Google OAuth
- `GET /api/auth/google/callback` - OAuth callback
- `POST /api/auth/reset-password` - Request password reset
- `POST /api/auth/confirm-reset` - Confirm password reset
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Usage Tracking

- `GET /api/usage/check?anonymousId=xxx` - Check remaining routes
- `POST /api/usage/track` - Track route creation
- `GET /api/usage/stats` - Get 30-day usage history (auth required)

### Stripe Payments

- `POST /api/stripe/create-checkout-session` - Start checkout (auth required)
- `POST /api/stripe/create-portal-session` - Manage subscription (auth required)
- `POST /api/stripe/webhook` - Webhook events (Stripe only)
- `GET /api/stripe/subscription` - Get subscription status (auth required)

## 9. Development vs Production

### Development Mode (`NODE_ENV=development`)

- **Unlimited routes** for all users (anonymous, free, pro)
- Password reset links logged to console (no email sent)
- Welcome emails logged to console
- Detailed error messages

### Production Mode (`NODE_ENV=production`)

- **Enforced limits**:
  - Anonymous: 2 routes/day
  - Free tier: 10 routes/day
  - Pro tier: Unlimited routes
- Emails sent via PurelyMail SMTP
- Minimal error messages

## 10. Testing

### Manual Testing

```bash
# Check usage (anonymous user)
curl "http://localhost:5000/api/usage/check?anonymousId=test123"

# Create account
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","fullName":"Test User"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Run Tests (Coming Soon)

```bash
npm test                # Run all tests
npm run test:unit       # Unit tests only
npm run test:integration # Integration tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage
```

## 11. Common Issues

### "Missing required environment variables"

- Check your `.env` file exists in `/backend`
- Verify all required variables are set
- Restart server after changing `.env`

### "Stripe not configured"

- Add `STRIPE_SECRET_KEY` to `.env`
- Verify the key starts with `sk_test_` (test mode) or `sk_live_` (production)

### "Google OAuth not configured"

- Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`
- Or disable Google OAuth in frontend

### "Email service not configured"

- Add SMTP credentials to `.env`
- Or use dev mode (password reset links logged to console)

### Webhook signature verification failed

- For local testing: Use Stripe CLI `stripe listen`
- For production: Copy webhook secret from Stripe dashboard
- Verify `STRIPE_WEBHOOK_SECRET` in `.env`

## 12. Deployment

### Heroku Deployment

```bash
# Create Heroku app
heroku create your-app-name

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set SUPABASE_URL=your_url
heroku config:set SUPABASE_SERVICE_ROLE_KEY=your_key
heroku config:set JWT_SECRET=your_secret
# ... set all required env vars

# Deploy
git push heroku main

# Check logs
heroku logs --tail
```

### Environment Variables for Production

Update these for production:
- `NODE_ENV=production`
- `PORT=5000` (Heroku sets this automatically)
- `FRONTEND_URL=https://your-frontend-domain.com`
- `GOOGLE_REDIRECT_URI=https://your-api-domain.com/api/auth/google/callback`
- Use production Stripe keys (`sk_live_`, `whsec_`, `price_`)
- Configure production SMTP credentials

## 13. Security Checklist

- [ ] Never commit `.env` file to git
- [ ] Use strong JWT_SECRET (32+ random characters)
- [ ] Enable HTTPS in production
- [ ] Set secure CORS origins in production
- [ ] Verify Stripe webhook signatures
- [ ] Use Supabase RLS policies
- [ ] Rate limit API endpoints (use middleware)
- [ ] Monitor webhook_events table for errors

## Support

For issues or questions:
- Check `/backend/src/routes/` for route implementations
- Review Supabase logs in dashboard
- Check Stripe webhook logs
- Review server logs: `heroku logs` or local console output
