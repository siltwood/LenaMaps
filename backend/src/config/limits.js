/**
 * Rate limits configuration
 *
 * Development mode has unlimited routes for testing
 * Production mode enforces real limits
 */

const LIMITS = {
  development: {
    anonymous: 999999,      // Unlimited for testing
    free: 999999,           // Unlimited for testing
    pro: 999999             // Unlimited for testing
  },
  production: {
    anonymous: 2,           // 2 routes/day for anonymous users
    free: 10,               // 10 routes/day for free accounts
    pro: 999999             // Unlimited for Pro subscribers
  }
};

const ENV = process.env.NODE_ENV || 'development';

module.exports = {
  DAILY_LIMITS: LIMITS[ENV],
  MAX_SAVED_ROUTES: {
    free: 10,              // Max 10 saved routes for free tier
    pro: 999999            // Unlimited saved routes for Pro
  },
  ENVIRONMENT: ENV
};
