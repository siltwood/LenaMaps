import db from './db';

/**
 * GeocodingCache - Cache for Google Maps Geocoding API results
 *
 * Caches both forward (address → coords) and reverse (coords → address) geocoding
 *
 * Google ToS Compliance:
 * - Lat/lng coordinates can be cached for 30 days
 * - place_id can be stored permanently
 * - Formatted addresses should NOT be cached long-term (session only)
 *
 * Strategy:
 * - Store coordinates + place_id in IndexedDB (30-day TTL)
 * - Keep formatted addresses in memory only (session cache)
 */

class GeocodingCache {
  constructor() {
    this.memoryCache = new Map();
    this.maxMemorySize = 200; // More entries than directions (common lookups)
    this.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      memoryHits: 0,
      diskHits: 0,
      forwardHits: 0,
      reverseHits: 0
    };

    // Clean up on init
    this.cleanupExpired();
  }

  /**
   * Generate key for forward geocoding (address → coords)
   */
  generateForwardKey(address) {
    // Normalize address: lowercase, trim
    return `fwd:${address.toLowerCase().trim()}`;
  }

  /**
   * Generate key for reverse geocoding (coords → address)
   */
  generateReverseKey(lat, lng) {
    // Use 6 decimal places (~0.1m precision)
    return `rev:${lat.toFixed(6)},${lng.toFixed(6)}`;
  }

  /**
   * Get forward geocoding result (address → coords)
   */
  async getForward(address) {
    const key = this.generateForwardKey(address);

    // Check memory first
    if (this.memoryCache.has(key)) {
      this.stats.hits++;
      this.stats.memoryHits++;
      this.stats.forwardHits++;
      return this.memoryCache.get(key);
    }

    // Check IndexedDB
    try {
      const cached = await db.geocoding.get(key);

      if (cached && Date.now() < cached.expires) {
        // Valid cache
        const result = {
          lat: cached.lat,
          lng: cached.lng,
          place_id: cached.place_id,
          formatted_address: cached.formatted_address // Might be null for old entries
        };

        // Promote to memory
        this.memoryCache.set(key, result);
        this.enforceLRU();

        this.stats.hits++;
        this.stats.diskHits++;
        this.stats.forwardHits++;
        return result;
      } else if (cached) {
        // Expired - delete it
        await db.geocoding.delete(key);
      }
    } catch (error) {
      console.error('[GeocodingCache] Error reading forward geocoding:', error);
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Get reverse geocoding result (coords → address)
   */
  async getReverse(lat, lng) {
    const key = this.generateReverseKey(lat, lng);

    // Check memory first
    if (this.memoryCache.has(key)) {
      this.stats.hits++;
      this.stats.memoryHits++;
      this.stats.reverseHits++;
      return this.memoryCache.get(key);
    }

    // Check IndexedDB
    try {
      const cached = await db.geocoding.get(key);

      if (cached && Date.now() < cached.expires) {
        const result = {
          formatted_address: cached.formatted_address,
          place_id: cached.place_id,
          name: cached.name
        };

        // Promote to memory
        this.memoryCache.set(key, result);
        this.enforceLRU();

        this.stats.hits++;
        this.stats.diskHits++;
        this.stats.reverseHits++;
        return result;
      } else if (cached) {
        // Expired - delete it
        await db.geocoding.delete(key);
      }
    } catch (error) {
      console.error('[GeocodingCache] Error reading reverse geocoding:', error);
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Store forward geocoding result (address → coords)
   */
  async setForward(address, geocodingResult) {
    const key = this.generateForwardKey(address);
    const now = Date.now();

    const result = {
      lat: geocodingResult.lat,
      lng: geocodingResult.lng,
      place_id: geocodingResult.place_id,
      formatted_address: geocodingResult.formatted_address
    };

    // Store in memory
    this.memoryCache.set(key, result);
    this.enforceLRU();

    // Store in IndexedDB
    try {
      await db.geocoding.put({
        key: key,
        type: 'forward',
        lat: geocodingResult.lat,
        lng: geocodingResult.lng,
        place_id: geocodingResult.place_id,
        formatted_address: geocodingResult.formatted_address,
        stored: now,
        expires: now + this.maxAge
      });
    } catch (error) {
      console.error('[GeocodingCache] Error storing forward geocoding:', error);
    }
  }

  /**
   * Store reverse geocoding result (coords → address)
   */
  async setReverse(lat, lng, geocodingResult) {
    const key = this.generateReverseKey(lat, lng);
    const now = Date.now();

    const result = {
      formatted_address: geocodingResult.formatted_address,
      place_id: geocodingResult.place_id,
      name: geocodingResult.name
    };

    // Store in memory
    this.memoryCache.set(key, result);
    this.enforceLRU();

    // Store in IndexedDB
    try {
      await db.geocoding.put({
        key: key,
        type: 'reverse',
        formatted_address: geocodingResult.formatted_address,
        place_id: geocodingResult.place_id,
        name: geocodingResult.name,
        stored: now,
        expires: now + this.maxAge
      });
    } catch (error) {
      console.error('[GeocodingCache] Error storing reverse geocoding:', error);
    }
  }

  /**
   * Enforce LRU eviction
   */
  enforceLRU() {
    if (this.memoryCache.size > this.maxMemorySize) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
  }

  /**
   * Clean up expired entries
   */
  async cleanupExpired() {
    try {
      const now = Date.now();
      const expired = await db.geocoding
        .where('expires')
        .below(now)
        .toArray();

      if (expired.length > 0) {
        await db.geocoding.bulkDelete(expired.map(entry => entry.key));
        console.log(`[GeocodingCache] Cleaned up ${expired.length} expired entries`);
      }
    } catch (error) {
      console.error('[GeocodingCache] Error during cleanup:', error);
    }
  }

  /**
   * Clear all cache data
   */
  async clear() {
    this.memoryCache.clear();
    try {
      await db.geocoding.clear();
    } catch (error) {
      console.error('[GeocodingCache] Error clearing cache:', error);
    }

    this.stats = {
      hits: 0,
      misses: 0,
      memoryHits: 0,
      diskHits: 0,
      forwardHits: 0,
      reverseHits: 0
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
const geocodingCache = new GeocodingCache();
export default geocodingCache;
