const { supabase } = require('../config/supabaseClient');

/**
 * Rate limiting middleware
 * Checks if user (authenticated or anonymous) has exceeded daily route limit
 *
 * Rate limits:
 * - Anonymous users: 1 route per day
 * - Authenticated users: 5 routes per day
 */
const checkRateLimit = async (req, res, next) => {
  try {
    const userId = req.user?.id || null;
    const anonymousId = req.body.anonymousId || null;
    const ipAddress = req.ip || req.connection.remoteAddress;

    // Call the Supabase function to check usage limit
    const { data, error } = await supabase.rpc('check_daily_usage_limit', {
      p_user_id: userId,
      p_anonymous_id: anonymousId,
      p_ip_address: ipAddress
    });

    if (error) {
      console.error('Rate limit check error:', error);
      // On error, allow the request but log it
      return next();
    }

    const usageInfo = data[0];

    // Attach usage info to request for tracking
    req.usageInfo = {
      routesUsedToday: usageInfo.routes_used_today,
      dailyLimit: usageInfo.daily_limit,
      canCreateRoute: usageInfo.can_create_route,
      userId: userId,
      anonymousId: anonymousId,
      ipAddress: ipAddress
    };

    // Check if limit exceeded
    if (!usageInfo.can_create_route) {
      return res.status(429).json({
        success: false,
        error: 'Daily route limit exceeded',
        routesUsedToday: usageInfo.routes_used_today,
        dailyLimit: usageInfo.daily_limit,
        message: userId
          ? `You've used all ${usageInfo.daily_limit} routes for today. Authenticated users get ${usageInfo.daily_limit} routes per day.`
          : `You've used your ${usageInfo.daily_limit} free route for today. Sign up for ${5} routes per day!`,
        requiresAuth: !userId // Tell frontend to show sign-up prompt
      });
    }

    next();
  } catch (error) {
    console.error('Rate limit middleware error:', error);
    // On error, allow the request to proceed
    next();
  }
};

/**
 * Track API usage after successful route creation
 * Should be called after route is successfully created
 */
const trackUsage = async (req, res, next) => {
  try {
    const userId = req.user?.id || null;
    const anonymousId = req.body.anonymousId || null;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Insert usage record
    const { error } = await supabase
      .from('usage_tracking')
      .insert({
        user_id: userId,
        anonymous_id: anonymousId,
        api_call_type: 'directions',
        route_count: 1,
        ip_address: ipAddress,
        user_agent: userAgent
      });

    if (error) {
      console.error('Usage tracking error:', error);
      // Don't fail the request if tracking fails
    }

    next();
  } catch (error) {
    console.error('Track usage error:', error);
    // Don't fail the request if tracking fails
    next();
  }
};

module.exports = {
  checkRateLimit,
  trackUsage
};
