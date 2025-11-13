/**
 * Hook to generate and persist anonymous user ID
 * Used for tracking usage before user signs up
 */

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'lenamaps_anonymous_id';

/**
 * Generate a random anonymous ID
 */
const generateAnonymousId = () => {
  return `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Hook to get or create anonymous user ID
 * Persists to localStorage
 */
export const useAnonymousId = () => {
  const [anonymousId, setAnonymousId] = useState(null);

  useEffect(() => {
    // Check if ID already exists
    let id = localStorage.getItem(STORAGE_KEY);

    // If not, generate and save
    if (!id) {
      id = generateAnonymousId();
      localStorage.setItem(STORAGE_KEY, id);
    }

    setAnonymousId(id);
  }, []);

  return anonymousId;
};

/**
 * Clear anonymous ID (call when user signs up)
 */
export const clearAnonymousId = () => {
  localStorage.removeItem(STORAGE_KEY);
};
