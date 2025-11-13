/**
 * Authentication routes V2
 *
 * Handles:
 * - Email/password signup and login
 * - Google OAuth
 * - Password reset via PurelyMail SMTP
 * - Token refresh
 */

const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const { supabase } = require('../config/supabaseClient');
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, FRONTEND_URL } = require('../config/env');
const {
  generateToken,
  isValidEmail,
  validatePassword,
  generateResetToken
} = require('../utils/auth');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../utils/email');

// Google OAuth client
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
) : null;

/**
 * POST /api/auth/signup
 * Create new account with email/password
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || ''
        }
      }
    });

    if (authError) {
      console.error('Signup error:', authError);

      if (authError.message.includes('already registered')) {
        return res.status(409).json({ error: 'Email already exists' });
      }

      return res.status(400).json({ error: authError.message });
    }

    if (!authData.user) {
      return res.status(500).json({ error: 'Failed to create user' });
    }

    // Get user profile (created by database trigger)
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
    }

    // Generate JWT token
    const token = generateToken({
      id: authData.user.id,
      email: authData.user.email,
      subscription_tier: profile?.subscription_tier || 'free'
    });

    // Send welcome email (non-blocking)
    if (fullName) {
      sendWelcomeEmail(email, fullName).catch(err => {
        console.error('Welcome email error:', err);
      });
    }

    res.status(201).json({
      message: 'Account created successfully',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        fullName: fullName || '',
        subscriptionTier: profile?.subscription_tier || 'free'
      },
      token
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * Login with email/password
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      console.error('Login error:', authError);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!authData.user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
    }

    // Generate JWT token
    const token = generateToken({
      id: authData.user.id,
      email: authData.user.email,
      subscription_tier: profile?.subscription_tier || 'free'
    });

    res.json({
      message: 'Login successful',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        fullName: profile?.full_name || '',
        subscriptionTier: profile?.subscription_tier || 'free'
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/google
 * Initiate Google OAuth flow
 */
router.get('/google', (req, res) => {
  if (!googleClient) {
    return res.status(503).json({ error: 'Google OAuth not configured' });
  }

  const authUrl = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email']
  });

  res.redirect(authUrl);
});

/**
 * GET /api/auth/google/callback
 * Handle Google OAuth callback
 */
router.get('/google/callback', async (req, res) => {
  try {
    if (!googleClient) {
      return res.redirect(`${FRONTEND_URL}?error=oauth_not_configured`);
    }

    const { code } = req.query;

    if (!code) {
      return res.redirect(`${FRONTEND_URL}?error=no_code`);
    }

    // Exchange code for tokens
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    // Verify ID token and get user info
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { email, name, sub: googleId } = payload;

    // Check if user exists
    let { data: existingUser } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('email', email)
      .single();

    let userId;

    if (existingUser) {
      // User exists - login
      userId = existingUser.id;
    } else {
      // New user - create account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: require('crypto').randomBytes(32).toString('hex'), // Random password
        options: {
          data: {
            full_name: name,
            oauth_provider: 'google',
            oauth_id: googleId
          }
        }
      });

      if (authError) {
        console.error('Google signup error:', authError);
        return res.redirect(`${FRONTEND_URL}?error=signup_failed`);
      }

      userId = authData.user.id;

      // Send welcome email (non-blocking)
      sendWelcomeEmail(email, name).catch(err => {
        console.error('Welcome email error:', err);
      });
    }

    // Get fresh profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    // Generate JWT token
    const token = generateToken({
      id: userId,
      email: email,
      subscription_tier: profile?.subscription_tier || 'free'
    });

    // Redirect to frontend with token
    res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.redirect(`${FRONTEND_URL}?error=oauth_failed`);
  }
});

/**
 * POST /api/auth/logout
 * Logout user (optional - JWT is stateless)
 */
router.post('/logout', (req, res) => {
  // With JWT, logout is handled client-side by removing the token
  // This endpoint is optional and can be used for logging/analytics
  res.json({ message: 'Logout successful' });
});

/**
 * POST /api/auth/reset-password
 * Request password reset email
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // Check if user exists
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .single();

    // Always return success even if user doesn't exist (security best practice)
    if (!profile) {
      return res.json({ message: 'If an account exists, a reset email has been sent' });
    }

    // Generate reset token
    const resetToken = generateResetToken();

    // Store reset token in database (expires in 1 hour)
    // Note: This requires adding reset_token and reset_token_expires columns to user_profiles
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        reset_token: resetToken,
        reset_token_expires: new Date(Date.now() + 3600000).toISOString() // 1 hour
      })
      .eq('id', profile.id);

    if (updateError) {
      console.error('Reset token storage error:', updateError);
      return res.status(500).json({ error: 'Failed to process reset request' });
    }

    // Send reset email
    await sendPasswordResetEmail(email, resetToken);

    res.json({ message: 'If an account exists, a reset email has been sent' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/confirm-reset
 * Confirm password reset with token
 */
router.post('/confirm-reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
    }

    // Find user with valid reset token
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, email, reset_token_expires')
      .eq('reset_token', token)
      .single();

    if (profileError || !profile) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Check if token is expired
    if (new Date(profile.reset_token_expires) < new Date()) {
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    // Update password in Supabase Auth
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      profile.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error('Password update error:', updateError);
      return res.status(500).json({ error: 'Failed to update password' });
    }

    // Clear reset token
    await supabase
      .from('user_profiles')
      .update({
        reset_token: null,
        reset_token_expires: null
      })
      .eq('id', profile.id);

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Confirm reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info (requires auth middleware)
 */
router.get('/me', async (req, res) => {
  try {
    // This will be protected by auth middleware
    const userId = req.user?.sub;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      subscriptionTier: profile.subscription_tier,
      createdAt: profile.created_at
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
