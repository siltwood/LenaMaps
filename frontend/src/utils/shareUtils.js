// Utility functions for sharing trips via URL

// Encode trip data to a compressed URL-safe string
export const encodeTripToURL = (locations, modes, effects = {}) => {
  // Filter out null locations
  const validLocations = locations.filter(loc => loc !== null);

  if (validLocations.length === 0) {
    return null;
  }

  // Create a compact trip object
  const tripData = {
    v: 1, // Version for future compatibility
    l: validLocations.map(loc => ({
      // Use short keys to minimize URL length
      n: loc.name || loc.formatted_address || '',
      lat: Math.round(loc.lat * 100000) / 100000, // 5 decimal places
      lng: Math.round(loc.lng * 100000) / 100000,
      p: loc.place_id || undefined // Optional place_id for better accuracy
    })),
    m: modes || ['walk'], // Transportation modes
    e: effects || {} // Animation effects
  };
  
  // Convert to JSON and compress
  const jsonString = JSON.stringify(tripData);
  
  // Use base64 encoding (URL-safe variant)
  const base64 = btoa(unescape(encodeURIComponent(jsonString)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return base64;
};

// Decode trip data from URL
export const decodeTripFromURL = (encodedString) => {
  if (!encodedString) return null;
  
  try {
    // Restore base64 padding if needed
    const base64 = encodedString
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if necessary
    const paddedBase64 = base64 + '=='.substring(0, (4 - base64.length % 4) % 4);
    
    // Decode from base64
    const jsonString = decodeURIComponent(escape(atob(paddedBase64)));
    const tripData = JSON.parse(jsonString);
    
    // Validate version
    if (tripData.v !== 1) {
    }
    
    // Reconstruct locations
    const locations = tripData.l.map(loc => ({
      name: loc.n,
      formatted_address: loc.n,
      lat: loc.lat,
      lng: loc.lng,
      place_id: loc.p,
      // Add geometry for compatibility with Google Maps
      geometry: {
        location: {
          lat: () => loc.lat,
          lng: () => loc.lng
        }
      }
    }));
    
    const modes = tripData.m || ['walk'];
    const effects = tripData.e || {};

    return { locations, modes, effects };
  } catch (error) {
    return null;
  }
};

// Generate a shareable URL for the current trip
export const generateShareableURL = (locations, modes, effects = {}) => {
  const encodedTrip = encodeTripToURL(locations, modes, effects);

  if (!encodedTrip) {
    return null;
  }

  // Get the base URL without any existing query parameters
  const baseURL = window.location.origin + window.location.pathname;

  // Create the shareable URL
  return `${baseURL}?trip=${encodedTrip}`;
};

// Copy text to clipboard with fallback
export const copyToClipboard = async (text) => {
  try {
    // Modern clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers or non-HTTPS
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      return successful;
    }
  } catch (err) {
    return false;
  }
};

// Check if URL has a shared trip
export const hasSharedTrip = () => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has('trip');
};

// Load shared trip from URL
export const loadSharedTrip = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const encodedTrip = urlParams.get('trip');
  
  if (!encodedTrip) {
    return null;
  }
  
  return decodeTripFromURL(encodedTrip);
};

// Clear shared trip from URL (useful after loading)
export const clearSharedTripFromURL = () => {
  const url = new URL(window.location);
  url.searchParams.delete('trip');
  window.history.replaceState({}, document.title, url.pathname);
};