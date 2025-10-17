import FingerprintJS from '@fingerprintjs/fingerprintjs';

let fpPromise = null;

// Initialize fingerprinting (call once on app load)
export const initFingerprint = async () => {
  if (!fpPromise) {
    fpPromise = FingerprintJS.load();
  }
  return fpPromise;
};

// Get unique fingerprint for anonymous user tracking
export const getFingerprint = async () => {
  try {
    const fp = await initFingerprint();
    const result = await fp.get();
    return result.visitorId;
  } catch (error) {
    console.error('Error getting fingerprint:', error);
    // Fallback to localStorage random ID if fingerprinting fails
    let fallbackId = localStorage.getItem('anonymous_id');
    if (!fallbackId) {
      fallbackId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('anonymous_id', fallbackId);
    }
    return fallbackId;
  }
};
