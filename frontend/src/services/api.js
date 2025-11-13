/**
 * API Service
 *
 * Centralized API calls for LenaMaps backend.
 * All endpoints are proxied through Vite dev server (/api -> http://localhost:5001/api)
 */

const API_BASE = '/api';

/**
 * Helper to get auth token from localStorage
 */
const getAuthToken = () => {
  return localStorage.getItem('authToken');
};

/**
 * Helper to make authenticated requests
 */
const authFetch = async (url, options = {}) => {
  const token = getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
};

// ============================================
// Auth API
// ============================================

export const authAPI = {
  /**
   * Sign up with email and password
   */
  signup: async (email, password, fullName) => {
    const response = await authFetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName }),
    });

    // Save token to localStorage
    if (response.token) {
      localStorage.setItem('authToken', response.token);
    }

    return response;
  },

  /**
   * Login with email and password
   */
  login: async (email, password) => {
    const response = await authFetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    // Save token to localStorage
    if (response.token) {
      localStorage.setItem('authToken', response.token);
    }

    return response;
  },

  /**
   * Logout (clear token)
   */
  logout: async () => {
    localStorage.removeItem('authToken');
    await authFetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
    });
  },

  /**
   * Get current user
   */
  getCurrentUser: async () => {
    return authFetch(`${API_BASE}/auth/me`);
  },

  /**
   * Request password reset email
   */
  requestPasswordReset: async (email) => {
    return authFetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  /**
   * Confirm password reset with token
   */
  confirmPasswordReset: async (token, newPassword) => {
    return authFetch(`${API_BASE}/auth/confirm-reset`, {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated: () => {
    return !!getAuthToken();
  },

  /**
   * Get Google OAuth URL
   */
  getGoogleAuthUrl: () => {
    return `${API_BASE}/auth/google`;
  },
};

// ============================================
// Usage Tracking API
// ============================================

export const usageAPI = {
  /**
   * Check remaining routes for today
   * @param {string} anonymousId - Required if not authenticated
   */
  check: async (anonymousId) => {
    const params = new URLSearchParams();

    if (!authAPI.isAuthenticated() && anonymousId) {
      params.append('anonymousId', anonymousId);
    }

    return authFetch(`${API_BASE}/usage/check?${params.toString()}`);
  },

  /**
   * Track route creation
   * @param {string} anonymousId - Required if not authenticated
   */
  track: async (anonymousId) => {
    const body = {};

    if (!authAPI.isAuthenticated() && anonymousId) {
      body.anonymousId = anonymousId;
    }

    return authFetch(`${API_BASE}/usage/track`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  /**
   * Get usage stats (last 30 days)
   * Requires authentication
   */
  getStats: async () => {
    return authFetch(`${API_BASE}/usage/stats`);
  },
};

// ============================================
// Stripe Payment API
// ============================================

export const stripeAPI = {
  /**
   * Create checkout session and redirect to Stripe
   */
  createCheckoutSession: async () => {
    const response = await authFetch(`${API_BASE}/stripe/create-checkout-session`, {
      method: 'POST',
    });

    // Redirect to Stripe checkout
    if (response.url) {
      window.location.href = response.url;
    }

    return response;
  },

  /**
   * Create customer portal session and redirect
   */
  createPortalSession: async () => {
    const response = await authFetch(`${API_BASE}/stripe/create-portal-session`, {
      method: 'POST',
    });

    // Redirect to Stripe portal
    if (response.url) {
      window.location.href = response.url;
    }

    return response;
  },

  /**
   * Get current subscription status
   */
  getSubscription: async () => {
    return authFetch(`${API_BASE}/stripe/subscription`);
  },
};

// ============================================
// Health Check
// ============================================

export const healthAPI = {
  /**
   * Check server health
   */
  check: async () => {
    return authFetch('/health');
  },
};

// Default export with all APIs
export default {
  auth: authAPI,
  usage: usageAPI,
  stripe: stripeAPI,
  health: healthAPI,
};
