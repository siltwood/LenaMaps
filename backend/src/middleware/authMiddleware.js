const { supabase } = require('../config/supabaseClient');

/**
 * Middleware to verify Supabase JWT token
 * Adds user info to req.user if authenticated
 */
const authenticateUser = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null; // No auth token, user is anonymous
      return next();
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      req.user = null;
      return next();
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

/**
 * Middleware to require authentication
 * Returns 401 if user is not authenticated
 */
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  next();
};

module.exports = {
  authenticateUser,
  requireAuth
};
