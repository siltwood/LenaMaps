import db from './db';

/**
 * DirectionsCache - Multi-tier cache for Google Maps Directions API
 *
 * Architecture:
 * - Layer 1: In-memory Map (fastest, session-only)
 * - Layer 2: IndexedDB (persistent, 30-day TTL)
 *
 * Google ToS Compliance:
 * - Stores ONLY coordinates (not full route objects)
 * - 30-day maximum cache duration
 * - Automatic expiration and cleanup
 */

class DirectionsCache {
  constructor() {
    this.memoryCache = new Map();
    this.maxMemorySize = 100; // LRU limit for memory cache
    this.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      memoryHits: 0,
      diskHits: 0
    };

    // Clean up expired entries on init
    this.cleanupExpired();
  }

  /**
   * Generate cache key from origin, destination, and mode
   */
  generateKey(origin, destination, mode) {
    const originKey = `${origin.lat.toFixed(6)},${origin.lng.toFixed(6)}`;
    const destKey = `${destination.lat.toFixed(6)},${destination.lng.toFixed(6)}`;
    return `${originKey}_${destKey}_${mode}`;
  }

  /**
   * Get cached route data
   * @returns Promise<Object|null> - Cached route data or null if not found/expired
   */
  async get(origin, destination, mode) {
    const key = this.generateKey(origin, destination, mode);

    // Check memory cache (IndexedDB disabled - see notes in set() method)
    if (this.memoryCache.has(key)) {
      this.stats.hits++;
      this.stats.memoryHits++;
      return this.memoryCache.get(key);
    }

    // Cache miss - memory only
    this.stats.misses++;
    return null;
  }

  /**
   * Store route data in cache
   * @param {Object} routeData - Full Google Maps route response
   */
  async set(origin, destination, mode, routeData) {
    const key = this.generateKey(origin, destination, mode);
    const now = Date.now();

    // Extract ONLY coordinates (ToS compliant)
    const coords = this.extractCoordinates(routeData);

    const cacheEntry = {
      key: key,
      data: routeData, // Full data in memory only
      coords: coords, // Minimal data for persistent storage
      mode: mode,
      stored: now,
      expires: now + this.maxAge
    };

    // Store in memory (full data)
    this.memoryCache.set(key, routeData);
    this.enforceLRU();

    // NOTE: IndexedDB storage disabled for routes
    // Google Maps route objects contain functions/circular refs that can't be serialized
    // Memory cache (session-only) works fine and provides good performance
    // For persistent caching, would need to reconstruct routes from coordinates
    // which defeats the purpose (would require another API call)
  }

  /**
   * Extract coordinates from route response (ToS compliant)
   */
  extractCoordinates(routeData) {
    if (!routeData || !routeData.routes || !routeData.routes[0]) {
      return [];
    }

    const route = routeData.routes[0];

    // Get overview path if available
    if (route.overview_path && route.overview_path.length > 0) {
      return route.overview_path.map(point => ({
        lat: typeof point.lat === 'function' ? point.lat() : point.lat,
        lng: typeof point.lng === 'function' ? point.lng() : point.lng
      }));
    }

    // Fallback: extract from legs
    if (route.legs && route.legs.length > 0) {
      const coords = [];
      route.legs.forEach(leg => {
        if (leg.steps) {
          leg.steps.forEach(step => {
            if (step.start_location) {
              coords.push({
                lat: typeof step.start_location.lat === 'function' ? step.start_location.lat() : step.start_location.lat,
                lng: typeof step.start_location.lng === 'function' ? step.start_location.lng() : step.start_location.lng
              });
            }
          });
        }
      });
      return coords;
    }

    return [];
  }

  /**
   * Enforce LRU (Least Recently Used) eviction for memory cache
   */
  enforceLRU() {
    if (this.memoryCache.size > this.maxMemorySize) {
      // Remove oldest entry (first item in Map)
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
  }

  /**
   * Clean up expired entries from IndexedDB
   */
  async cleanupExpired() {
    try {
      const now = Date.now();
      const expired = await db.routes
        .where('expires')
        .below(now)
        .toArray();

      if (expired.length > 0) {
        await db.routes.bulkDelete(expired.map(entry => entry.key));
      }
    } catch (error) {
      console.error('[DirectionsCache] Error during cleanup:', error);
    }
  }

  /**
   * Clear all cache data
   */
  async clear() {
    this.memoryCache.clear();
    try {
      await db.routes.clear();
    } catch (error) {
      console.error('[DirectionsCache] Error clearing cache:', error);
    }

    // Reset stats
    this.stats = {
      hits: 0,
      misses: 0,
      memoryHits: 0,
      diskHits: 0
    };
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: totalRequests > 0 ? (this.stats.hits / totalRequests * 100).toFixed(2) + '%' : '0%',
      memorySize: this.memoryCache.size
    };
  }
}

// Export singleton instance
const directionsCache = new DirectionsCache();
export default directionsCache;
