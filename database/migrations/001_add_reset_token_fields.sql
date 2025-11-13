-- Migration: Add password reset token fields to user_profiles
-- Run this after schema-v2.sql

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS reset_token TEXT,
ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

-- Create index for faster reset token lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_reset_token ON user_profiles(reset_token);

-- Add comment
COMMENT ON COLUMN user_profiles.reset_token IS 'Password reset token (expires in 1 hour)';
COMMENT ON COLUMN user_profiles.reset_token_expires IS 'Reset token expiration timestamp';
