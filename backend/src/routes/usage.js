const express = require('express');
const { supabase } = require('../config/supabaseClient');
const { authenticateUser } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * GET /api/usage/check
 * Check current usage and limits for user (authenticated or anonymous)
 */
router.get('/check', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const anonymousId = req.query.anonymousId || null;
    const ipAddress = req.ip || req.connection.remoteAddress;

    // Call Supabase function to check usage
    const { data, error } = await supabase.rpc('check_daily_usage_limit', {
      p_user_id: userId,
      p_anonymous_id: anonymousId,
      p_ip_address: ipAddress
    });

    if (error) {
      console.error('Usage check error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to check usage'
      });
    }

    const usageInfo = data[0];

    res.json({
      success: true,
      routesUsedToday: usageInfo.routes_used_today,
      dailyLimit: usageInfo.daily_limit,
      routesRemaining: usageInfo.daily_limit - usageInfo.routes_used_today,
      canCreateRoute: usageInfo.can_create_route,
      isAuthenticated: !!userId,
      upgradeMessage: !userId
        ? `Sign up to get ${5} routes per day instead of ${1}!`
        : null
    });
  } catch (error) {
    console.error('Usage check error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/usage/track
 * Track API usage (called after successful route creation)
 */
router.post('/track', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const anonymousId = req.body.anonymousId || null;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const apiCallType = req.body.apiCallType || 'directions';
    const routeCount = req.body.routeCount || 1;

    // Insert usage record
    const { error } = await supabase
      .from('usage_tracking')
      .insert({
        user_id: userId,
        anonymous_id: anonymousId,
        api_call_type: apiCallType,
        route_count: routeCount,
        ip_address: ipAddress,
        user_agent: userAgent
      });

    if (error) {
      console.error('Usage tracking insert error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to track usage'
      });
    }

    // Get updated usage info
    const { data, error: checkError } = await supabase.rpc('check_daily_usage_limit', {
      p_user_id: userId,
      p_anonymous_id: anonymousId,
      p_ip_address: ipAddress
    });

    if (checkError) {
      // Still return success even if check fails
      return res.json({
        success: true,
        message: 'Usage tracked successfully'
      });
    }

    const usageInfo = data[0];

    res.json({
      success: true,
      message: 'Usage tracked successfully',
      routesUsedToday: usageInfo.routes_used_today,
      dailyLimit: usageInfo.daily_limit,
      routesRemaining: usageInfo.daily_limit - usageInfo.routes_used_today,
      canCreateRoute: usageInfo.can_create_route
    });
  } catch (error) {
    console.error('Track usage error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/usage/history
 * Get usage history for authenticated user
 */
router.get('/history', authenticateUser, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const limit = parseInt(req.query.limit) || 30;
    const offset = parseInt(req.query.offset) || 0;

    // Get usage history
    const { data, error } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Usage history error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch usage history'
      });
    }

    res.json({
      success: true,
      history: data,
      count: data.length
    });
  } catch (error) {
    console.error('Usage history error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;
