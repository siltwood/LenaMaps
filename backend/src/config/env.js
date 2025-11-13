/**
 * Environment configuration
 * Centralizes all environment variables with validation
 */

require('dotenv').config();

const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET'
];

// Validate required environment variables
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('Please check your .env file');
  process.exit(1);
}

module.exports = {
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 5001,

  // Frontend URLs (for CORS and password reset links)
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3001',

  // Database
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  // Auth
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5001/api/auth/google/callback',

  // Stripe
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID, // $7/month Pro tier

  // Email (PurelyMail SMTP)
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.purelymail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT) || 587,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM || 'LenaMaps <noreply@lenamaps.com>',

  // Testing
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL
};
