# LenaMaps API Reference

Base URL: `http://localhost:5001/api` (development)

## Authentication

All authenticated endpoints require `Authorization: Bearer <token>` header.

---

## Auth Endpoints

### `POST /auth/signup`
Create a new user account.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "John Doe"
}
```

**Response:**
```json
{
  "message": "Account created successfully",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "John Doe",
    "subscriptionTier": "free"
  },
  "token": "jwt_token_here"
}
```

---

### `POST /auth/login`
Login with email and password.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "John Doe",
    "subscriptionTier": "free"
  },
  "token": "jwt_token_here"
}
```

---

### `GET /auth/google`
Initiate Google OAuth flow. Redirects to Google login.

**Response:** Redirect to Google OAuth consent screen

---

### `GET /auth/google/callback`
Google OAuth callback (handled automatically).

**Response:** Redirect to frontend with token

---

### `POST /auth/reset-password`
Request password reset email.

**Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "message": "If an account exists, a reset email has been sent"
}
```

---

### `POST /auth/confirm-reset`
Confirm password reset with token.

**Body:**
```json
{
  "token": "reset_token_from_email",
  "newPassword": "newpassword123"
}
```

**Response:**
```json
{
  "message": "Password reset successful"
}
```

---

### `GET /auth/me`
Get current user profile.

**Auth:** Required

**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "fullName": "John Doe",
  "subscriptionTier": "free",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

---

### `POST /auth/logout`
Logout (client-side token removal).

**Response:**
```json
{
  "message": "Logout successful"
}
```

---

## Usage Tracking Endpoints

### `GET /usage/check`
Check remaining routes for today.

**Auth:** Optional (works for anonymous and authenticated users)

**Query Params:**
- `anonymousId` (required if not authenticated): Unique ID for anonymous user

**Example:**
```
GET /usage/check?anonymousId=abc123
```

**Response:**
```json
{
  "canCreate": true,
  "currentCount": 5,
  "dailyLimit": 10,
  "remaining": 5,
  "tier": "free",
  "environment": "development",
  "isUnlimited": false
}
```

---

### `POST /usage/track`
Increment route counter after creating a route.

**Auth:** Optional (works for anonymous and authenticated users)

**Body:**
```json
{
  "anonymousId": "abc123"  // Required if not authenticated
}
```

**Response (Success):**
```json
{
  "success": true,
  "newCount": 6,
  "remaining": 4,
  "dailyLimit": 10,
  "tier": "free"
}
```

**Response (Limit Reached):**
```json
{
  "error": "Daily limit reached",
  "currentCount": 10,
  "dailyLimit": 10,
  "tier": "free"
}
```
Status: `429 Too Many Requests`

---

### `GET /usage/stats`
Get usage history for last 30 days.

**Auth:** Required

**Response:**
```json
{
  "stats": [
    {
      "date": "2024-01-15",
      "route_count": 8
    },
    {
      "date": "2024-01-14",
      "route_count": 5
    }
  ],
  "totalRoutes": 150,
  "daysTracked": 30
}
```

---

## Stripe Payment Endpoints

### `POST /stripe/create-checkout-session`
Create Stripe checkout session for Pro subscription.

**Auth:** Required

**Response:**
```json
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/pay/cs_test_..."
}
```

---

### `POST /stripe/create-portal-session`
Create customer portal session for managing subscription.

**Auth:** Required

**Response:**
```json
{
  "url": "https://billing.stripe.com/session/..."
}
```

---

### `GET /stripe/subscription`
Get current subscription status.

**Auth:** Required

**Response:**
```json
{
  "subscription": {
    "id": "uuid",
    "stripe_subscription_id": "sub_...",
    "status": "active",
    "current_period_start": "2024-01-01T00:00:00Z",
    "current_period_end": "2024-02-01T00:00:00Z",
    "cancel_at_period_end": false
  },
  "hasSubscription": true
}
```

**Response (No Subscription):**
```json
{
  "subscription": null,
  "hasSubscription": false
}
```

---

### `POST /stripe/webhook`
Stripe webhook endpoint (internal use only).

**Note:** This endpoint is called by Stripe, not your frontend.

---

## Health Check

### `GET /health`
Server health check.

**Response:**
```json
{
  "status": "ok",
  "environment": "development"
}
```

---

## Error Responses

All endpoints may return these error formats:

**400 Bad Request:**
```json
{
  "error": "Email and password are required"
}
```

**401 Unauthorized:**
```json
{
  "error": "Authentication required"
}
```

**404 Not Found:**
```json
{
  "error": "User not found"
}
```

**429 Too Many Requests:**
```json
{
  "error": "Daily limit reached",
  "currentCount": 10,
  "dailyLimit": 10
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal server error"
}
```

---

## Environment-Specific Behavior

### Development Mode
- `NODE_ENV=development`
- Unlimited routes for all users
- Password reset links logged to console
- No actual emails sent (unless SMTP configured)

### Production Mode
- `NODE_ENV=production`
- Enforced rate limits:
  - Anonymous: 2 routes/day
  - Free: 10 routes/day
  - Pro: Unlimited
- Emails sent via PurelyMail SMTP
- Full webhook processing
