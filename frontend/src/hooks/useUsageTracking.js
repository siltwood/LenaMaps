/**
 * Hook for usage tracking and limit enforcement
 */

import { useState, useRef, useCallback } from 'react';
import api from '../services/api';
import { useAnonymousId } from './useAnonymousId';

export const useUsageTracking = () => {
  const anonymousId = useAnonymousId();
  const [usageInfo, setUsageInfo] = useState(null);
  const [limitReached, setLimitReached] = useState(false);
  const trackedRoutes = useRef(new Set()); // Track which routes we've already counted

  /**
   * Check current usage and limits
   */
  const checkUsage = useCallback(async () => {
    if (!anonymousId) return null;

    try {
      const info = await api.usage.check(anonymousId);
      setUsageInfo(info);
      setLimitReached(!info.canCreate);
      return info;
    } catch (err) {
      console.error('Failed to check usage:', err);
      return null;
    }
  }, [anonymousId]);

  /**
   * Track a route (if not already tracked)
   * @param {Array} locations - Array of route locations
   * @param {string} trigger - What triggered the tracking ('calculation' or 'animate')
   * @returns {Object} { success: boolean, limitReached: boolean, usageInfo: object }
   */
  const trackRoute = useCallback(async (locations, trigger = 'calculation') => {
    if (!anonymousId) {
      console.warn('Cannot track route: no anonymous ID yet');
      return { success: false, limitReached: false };
    }

    // Generate hash of locations (only lat/lng, ignore names/modes)
    const hash = locations
      .map(loc => `${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}`)
      .join('|');

    // Check if we already tracked this exact route
    if (trackedRoutes.current.has(hash)) {
      console.log('Route already tracked, skipping');
      return { success: true, limitReached: false, alreadyTracked: true };
    }

    try {
      // Track the route
      const result = await api.usage.track(anonymousId);

      // Mark this route as tracked
      trackedRoutes.current.add(hash);

      // Update usage info
      setUsageInfo({
        canCreate: result.remaining > 0,
        currentCount: result.newCount,
        dailyLimit: result.dailyLimit,
        remaining: result.remaining,
        tier: result.tier
      });

      setLimitReached(result.remaining === 0);

      console.log(`✅ Route tracked (${trigger}): ${result.newCount}/${result.dailyLimit}`);

      return {
        success: true,
        limitReached: result.remaining === 0,
        usageInfo: result
      };
    } catch (err) {
      console.error('Failed to track route:', err);

      // Check if it's a rate limit error
      if (err.message.includes('Daily limit reached')) {
        setLimitReached(true);
        return {
          success: false,
          limitReached: true,
          error: err.message
        };
      }

      return {
        success: false,
        limitReached: false,
        error: err.message
      };
    }
  }, [anonymousId]);

  /**
   * Clear tracked routes (call when user clears all locations)
   */
  const clearTrackedRoutes = useCallback(() => {
    trackedRoutes.current.clear();
    console.log('Cleared tracked routes');
  }, []);

  /**
   * Reset limit reached state (for dismissing modals)
   */
  const dismissLimitWarning = useCallback(() => {
    setLimitReached(false);
  }, []);

  return {
    anonymousId,
    usageInfo,
    limitReached,
    checkUsage,
    trackRoute,
    clearTrackedRoutes,
    dismissLimitWarning
  };
};
