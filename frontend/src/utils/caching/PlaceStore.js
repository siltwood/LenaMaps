import db from './db';

/**
 * PlaceStore - Permanent storage for Google Places data
 *
 * Google ToS Compliance:
 * - place_id can be stored INDEFINITELY (no expiration required)
 * - Also applies to: pano_id (Street View), video_id (Aerial View)
 *
 * Use cases:
 * - Skip redundant getDetails() calls for known places
 * - Store favorite/recent locations by place_id
 * - Build offline-capable place references
 */

class PlaceStore {
  constructor() {
    this.memoryCache = new Map();
    this.maxMemorySize = 100;

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      memoryHits: 0,
      diskHits: 0
    };
  }

  /**
   * Get place details by place_id
   * @param {string} placeId - Google place_id
   * @returns {Promise<Object|null>} Place details or null
   */
  async get(placeId) {
    if (!placeId) return null;

    // Check memory first
    if (this.memoryCache.has(placeId)) {
      this.stats.hits++;
      this.stats.memoryHits++;
      return this.memoryCache.get(placeId);
    }

    // Check IndexedDB
    try {
      const cached = await db.places.get(placeId);

      if (cached) {
        const result = {
          place_id: cached.placeId,
          name: cached.name,
          lat: cached.lat,
          lng: cached.lng,
          formatted_address: cached.formatted_address,
          types: cached.types
        };

        // Promote to memory
        this.memoryCache.set(placeId, result);
        this.enforceLRU();

        this.stats.hits++;
        this.stats.diskHits++;
        return result;
      }
    } catch (error) {
      console.error('[PlaceStore] Error reading place:', error);
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Store place details
   * @param {string} placeId - Google place_id
   * @param {Object} placeDetails - Place details from Places API
   */
  async set(placeId, placeDetails) {
    if (!placeId || !placeDetails) return;

    const result = {
      place_id: placeId,
      name: placeDetails.name,
      lat: placeDetails.geometry?.location?.lat() || placeDetails.lat,
      lng: placeDetails.geometry?.location?.lng() || placeDetails.lng,
      formatted_address: placeDetails.formatted_address,
      types: placeDetails.types
    };

    // Store in memory
    this.memoryCache.set(placeId, result);
    this.enforceLRU();

    // Store in IndexedDB (permanent)
    try {
      await db.places.put({
        placeId: placeId,
        name: placeDetails.name,
        lat: result.lat,
        lng: result.lng,
        formatted_address: placeDetails.formatted_address,
        types: placeDetails.types,
        stored: Date.now()
      });
    } catch (error) {
      console.error('[PlaceStore] Error storing place:', error);
    }
  }

  /**
   * Store multiple places at once
   */
  async setMany(places) {
    for (const place of places) {
      if (place.place_id) {
        await this.set(place.place_id, place);
      }
    }
  }

  /**
   * Check if we have a place stored
   */
  async has(placeId) {
    if (!placeId) return false;

    if (this.memoryCache.has(placeId)) {
      return true;
    }

    try {
      const cached = await db.places.get(placeId);
      return !!cached;
    } catch (error) {
      return false;
    }
  }

  /**
   * Enforce LRU eviction for memory cache
   */
  enforceLRU() {
    if (this.memoryCache.size > this.maxMemorySize) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
  }

  /**
   * Get all stored places (useful for features like "recent searches")
   */
  async getAll() {
    try {
      return await db.places.toArray();
    } catch (error) {
      console.error('[PlaceStore] Error getting all places:', error);
      return [];
    }
  }

  /**
   * Get recently stored places
   */
  async getRecent(limit = 10) {
    try {
      return await db.places
        .orderBy('stored')
        .reverse()
        .limit(limit)
        .toArray();
    } catch (error) {
      console.error('[PlaceStore] Error getting recent places:', error);
      return [];
    }
  }

  /**
   * Clear all stored places (use sparingly - place_ids are valuable!)
   */
  async clear() {
    this.memoryCache.clear();
    try {
      await db.places.clear();
    } catch (error) {
      console.error('[PlaceStore] Error clearing places:', error);
    }

    this.stats = {
      hits: 0,
      misses: 0,
      memoryHits: 0,
      diskHits: 0
    };
  }

  /**
   * Get statistics
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
const placeStore = new PlaceStore();
export default placeStore;
