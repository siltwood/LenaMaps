import Dexie from 'dexie';

/**
 * IndexedDB setup for LenaMaps caching
 *
 * Stores:
 * - routes: Directions API results (coordinates only, 30-day TTL)
 * - geocoding: Forward/reverse geocoding results (30-day TTL)
 * - places: Place ID mappings (permanent storage allowed by Google ToS)
 */

const db = new Dexie('lenamaps');

// Define database schema
db.version(1).stores({
  // Directions cache: key = "lat1,lng1_lat2,lng2_mode"
  routes: 'key, expires, stored',

  // Geocoding cache: key = address string or "lat,lng"
  geocoding: 'key, expires, stored, type',

  // Place store: placeId is the primary key
  places: 'placeId, stored'
});

export default db;
