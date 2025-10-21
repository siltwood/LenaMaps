import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../../../utils/supabaseClient';
import { getFingerprint } from '../../../utils/fingerprint';
import './UsageIndicator.css';

const UsageIndicator = ({ user, onUpgradeClick }) => {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsage();

    // Listen for usage updates (when routes are created)
    const handleUsageUpdate = () => {
      fetchUsage();
    };

    window.addEventListener('usageUpdated', handleUsageUpdate);

    return () => {
      window.removeEventListener('usageUpdated', handleUsageUpdate);
    };
  }, [user]);

  const fetchUsage = async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    try {
      // Build URL with query params for anonymous users
      let url = 'http://localhost:5001/api/usage/check';
      const headers = {};

      if (user) {
        // Authenticated user - use auth header
        const session = await supabase.auth.getSession();
        if (session?.data?.session?.access_token) {
          headers['Authorization'] = `Bearer ${session.data.session.access_token}`;
        }
      } else {
        // Anonymous user - include fingerprint in query
        const anonymousId = await getFingerprint();
        url += `?anonymousId=${anonymousId}`;
      }

      // Fetch usage from backend
      const response = await fetch(url, { headers });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setUsage(data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch usage:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !usage || !isSupabaseConfigured()) {
    return null;
  }

  const percentage = (usage.routesUsedToday / usage.dailyLimit) * 100;
  const isLimitClose = usage.routesRemaining <= 1;
  const isLimitReached = usage.routesRemaining <= 0;

  return (
    <div className={`usage-indicator ${isLimitReached ? 'limit-reached' : isLimitClose ? 'limit-close' : ''}`}>
      <div className="usage-indicator-content">
        <div className="usage-indicator-text">
          <span className="usage-indicator-label">
            {user ? 'Your routes today:' : 'Free routes today:'}
          </span>
          <span className="usage-indicator-count">
            {usage.routesUsedToday} / {usage.dailyLimit}
          </span>
          {usage.routesRemaining > 0 && (
            <span className="usage-indicator-remaining">
              ({usage.routesRemaining} remaining)
            </span>
          )}
        </div>

        {!user && usage.routesRemaining <= 1 && (
          <button
            className="btn btn-upgrade"
            onClick={onUpgradeClick}
          >
            Sign up for {5}x more routes
          </button>
        )}
      </div>

      <div className="usage-indicator-bar">
        <div
          className="usage-indicator-progress"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      {isLimitReached && (
        <div className="usage-indicator-warning">
          {user
            ? "You've reached your daily limit. More routes available tomorrow!"
            : 'Daily limit reached. Sign up to get 5 routes per day!'}
        </div>
      )}
    </div>
  );
};

export default UsageIndicator;
