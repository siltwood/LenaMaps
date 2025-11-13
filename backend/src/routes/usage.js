/**
 * Usage tracking routes
 *
 * Handles:
 * - Daily route count tracking (anonymous + authenticated users)
 * - Limit checking (dev vs prod)
 * - Usage statistics
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabaseClient');
const { DAILY_LIMITS, ENVIRONMENT } = require('../config/limits');
const { verifyToken, extractToken } = require('../utils/auth');

/**
 * Middleware to optionally extract user from JWT
 * Does NOT require authentication - allows anonymous users
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = extractToken(authHeader);

  if (token) {
    try {
      const decoded = verifyToken(token);
      req.user = decoded;
    } catch (error) {
      // Invalid token - treat as anonymous
      req.user = null;
    }
  } else {
    req.user = null;
  }

  next();
}

/**
 * GET /api/usage/check
 * Check remaining routes for today
 *
 * Query params:
 * - anonymousId: Required if not authenticated
 *
 * Returns:
 * - canCreate: Boolean
 * - currentCount: Routes created today
 * - dailyLimit: Max routes per day
 * - remaining: Routes left today
 * - tier: User's subscription tier
 * - environment: Current environment (dev/prod)
 */
router.get('/check', optionalAuth, async (req, res) => {
  try {
    const { anonymousId } = req.query;
    const userId = req.user?.sub;

    // Validate input
    if (!userId && !anonymousId) {
      return res.status(400).json({ error: 'User ID or anonymous ID required' });
    }

    // Get user's subscription tier
    let tier = 'anonymous';
    if (userId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('subscription_tier')
        .eq('id', userId)
        .single();

      tier = profile?.subscription_tier || 'free';
    }

    // Get daily limit for this tier
    const dailyLimit = DAILY_LIMITS[tier];

    // Get current usage
    let query = supabase
      .from('usage_tracking')
      .select('route_count')
      .eq('date', new Date().toISOString().split('T')[0]); // Today's date (YYYY-MM-DD)

    if (userId) {
      query = query.eq('user_id', userId);
    } else {
      query = query.eq('anonymous_id', anonymousId);
    }

    const { data: usage } = await query.single();

    const currentCount = usage?.route_count || 0;
    const remaining = Math.max(dailyLimit - currentCount, 0);
    const canCreate = currentCount < dailyLimit;

    res.json({
      canCreate,
      currentCount,
      dailyLimit,
      remaining,
      tier,
      environment: ENVIRONMENT,
      isUnlimited: dailyLimit >= 999999
    });
  } catch (error) {
    console.error('Usage check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/usage/track
 * Increment route count for today
 *
 * Body:
 * - anonymousId: Required if not authenticated
 *
 * Returns:
 * - success: Boolean
 * - newCount: Updated route count
 * - remaining: Routes left today
 */
router.post('/track', optionalAuth, async (req, res) => {
  try {
    const { anonymousId } = req.body;
    const userId = req.user?.sub;

    // Validate input
    if (!userId && !anonymousId) {
      return res.status(400).json({ error: 'User ID or anonymous ID required' });
    }

    // Get user's subscription tier
    let tier = 'anonymous';
    if (userId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('subscription_tier')
        .eq('id', userId)
        .single();

      tier = profile?.subscription_tier || 'free';
    }

    // Get daily limit
    const dailyLimit = DAILY_LIMITS[tier];

    // Get or create today's usage record
    const today = new Date().toISOString().split('T')[0];

    let query = supabase
      .from('usage_tracking')
      .select('id, route_count')
      .eq('date', today);

    if (userId) {
      query = query.eq('user_id', userId);
    } else {
      query = query.eq('anonymous_id', anonymousId);
    }

    const { data: existingUsage } = await query.single();

    if (existingUsage) {
      // Check if limit reached
      if (existingUsage.route_count >= dailyLimit) {
        return res.status(429).json({
          error: 'Daily limit reached',
          currentCount: existingUsage.route_count,
          dailyLimit,
          tier
        });
      }

      // Update existing record
      const { data: updated, error: updateError } = await supabase
        .from('usage_tracking')
        .update({ route_count: existingUsage.route_count + 1 })
        .eq('id', existingUsage.id)
        .select()
        .single();

      if (updateError) {
        console.error('Usage update error:', updateError);
        return res.status(500).json({ error: 'Failed to update usage' });
      }

      const remaining = Math.max(dailyLimit - updated.route_count, 0);

      return res.json({
        success: true,
        newCount: updated.route_count,
        remaining,
        dailyLimit,
        tier
      });
    } else {
      // Create new record
      const { data: created, error: createError } = await supabase
        .from('usage_tracking')
        .insert({
          user_id: userId || null,
          anonymous_id: anonymousId || null,
          date: today,
          route_count: 1
        })
        .select()
        .single();

      if (createError) {
        console.error('Usage creation error:', createError);
        return res.status(500).json({ error: 'Failed to track usage' });
      }

      const remaining = Math.max(dailyLimit - 1, 0);

      return res.json({
        success: true,
        newCount: 1,
        remaining,
        dailyLimit,
        tier
      });
    }
  } catch (error) {
    console.error('Usage tracking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/usage/stats
 * Get usage statistics (last 30 days)
 * Requires authentication
 */
router.get('/stats', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.sub;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get last 30 days of usage
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: usage, error } = await supabase
      .from('usage_tracking')
      .select('date, route_count')
      .eq('user_id', userId)
      .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (error) {
      console.error('Usage stats error:', error);
      return res.status(500).json({ error: 'Failed to fetch stats' });
    }

    // Calculate total routes
    const totalRoutes = usage.reduce((sum, day) => sum + day.route_count, 0);

    res.json({
      stats: usage || [],
      totalRoutes,
      daysTracked: usage?.length || 0
    });
  } catch (error) {
    console.error('Usage stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
