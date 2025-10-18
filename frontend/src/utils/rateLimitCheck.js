import { getFingerprint } from './fingerprint';
import { supabase } from './supabaseClient';

const BACKEND_URL = 'http://localhost:5000';

/**
 * Check if user can create a new route based on their daily limit
 * @param {Object} user - Current authenticated user (null for anonymous)
 * @returns {Promise<{canCreate: boolean, usageData: Object}>}
 */
export const checkCanCreateRoute = async (user) => {
  try {
    let url = `${BACKEND_URL}/api/usage/check`;
    const headers = {};

    if (user) {
      // Authenticated user - include auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } else {
      // Anonymous user - include fingerprint
      const anonymousId = await getFingerprint();
      url += `?anonymousId=${anonymousId}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    return {
      canCreate: data.can_create_route,
      usageData: data
    };
  } catch (error) {
    console.error('Error checking rate limit:', error);
    // On error, allow creation but log the issue
    return {
      canCreate: true,
      usageData: null
    };
  }
};

/**
 * Track a new route creation (increment usage counter)
 * @param {Object} user - Current authenticated user (null for anonymous)
 * @returns {Promise<boolean>} - Success status
 */
export const trackRouteCreation = async (user) => {
  try {
    const headers = {
      'Content-Type': 'application/json'
    };

    const body = {};

    if (user) {
      // Authenticated user - include auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } else {
      // Anonymous user - include fingerprint
      const anonymousId = await getFingerprint();
      body.anonymousId = anonymousId;
    }

    const response = await fetch(`${BACKEND_URL}/api/usage/track`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Error tracking route creation:', error);
    return false;
  }
};
