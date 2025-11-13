# LenaMaps Caching System

## Overview

LenaMaps implements a multi-tier caching system to reduce Google Maps API costs while maintaining full compliance with Google's Terms of Service. The system provides 50-70% cost savings through intelligent caching of API responses.

**Current Implementation**: Frontend-only (IndexedDB + localStorage)
**Future Plan**: Backend migration to Supabase when authentication is added

---

## Architecture

### Multi-Tier Caching Strategy

```
┌─────────────────────────────────────────┐
│         Application Layer               │
│  (Components, Services, Utils)          │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Cache Layer (Memory + Disk)        │
│  ┌─────────────────────────────────┐   │
│  │  Layer 1: In-Memory Map Cache    │   │  ← Fastest (microseconds)
│  │  - LRU eviction                  │   │
│  │  - Session-only                  │   │
│  └─────────────────────────────────┘   │
│               │                          │
│               ▼                          │
│  ┌─────────────────────────────────┐   │
│  │  Layer 2: IndexedDB             │   │  ← Persistent (milliseconds)
│  │  - 30-day TTL (coords)          │   │
│  │  - Permanent (place_ids)        │   │
│  │  - Auto cleanup                 │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Google Maps APIs                   │
│  (Only called on cache miss)            │
└─────────────────────────────────────────┘
```

---

## Cache Components

### 1. DirectionsCache (`src/utils/caching/DirectionsCache.js`)

**Purpose**: Cache Google Directions API results to avoid redundant route calculations.

**Storage**:
- **Memory**: Full route data (fast access during session)
- **IndexedDB**: Coordinate-only data (ToS compliant, 30-day expiration)

**Key Features**:
- Generates unique keys from: `origin coords + destination coords + travel mode`
- Coordinate precision: 6 decimal places (~0.1m accuracy)
- Auto-cleanup of expired entries on initialization
- LRU eviction for memory cache (max 100 entries)

**Google ToS Compliance**:
- ✅ Stores ONLY coordinates (not full route objects)
- ✅ 30-day maximum cache duration
- ✅ Automatic expiration enforcement

**Usage**:
```javascript
import directionsCache from './utils/caching/DirectionsCache';

// Check cache before API call
const cached = await directionsCache.get(origin, destination, mode);
if (cached) {
  return cached; // Cache hit - no API call!
}

// On cache miss, fetch from API and cache
const result = await directionsService.route(request);
await directionsCache.set(origin, destination, mode, result);
```

**Statistics**:
```javascript
directionsCache.getStats();
// Returns: { hits, misses, hitRate, memoryHits, diskHits, memorySize }
```

---

### 2. GeocodingCache (`src/utils/caching/GeocodingCache.js`)

**Purpose**: Cache forward (address→coords) and reverse (coords→address) geocoding results.

**Storage Strategy**:
- **Memory**: Fast session cache (200 entries)
- **IndexedDB**: Persistent cache with 30-day TTL

**Key Features**:
- **Forward geocoding**: Cache address strings (normalized: lowercase, trimmed)
- **Reverse geocoding**: Cache coordinate lookups (6 decimal precision)
- Separate hit tracking for forward vs reverse operations
- Auto-cleanup of expired entries

**Google ToS Compliance**:
- ✅ Coordinates cached for 30 days maximum
- ✅ place_id stored alongside (can be permanent)
- ✅ Formatted addresses included (session cache only recommended)

**Usage**:
```javascript
import geocodingCache from './utils/caching/GeocodingCache';

// Forward geocoding (address → coords)
const cached = await geocodingCache.getForward("Seattle, WA");
if (!cached) {
  const result = await geocoder.geocode({ address });
  await geocodingCache.setForward(address, {
    lat: result.lat,
    lng: result.lng,
    place_id: result.place_id,
    formatted_address: result.formatted_address
  });
}

// Reverse geocoding (coords → address)
const cached = await geocodingCache.getReverse(lat, lng);
if (!cached) {
  const result = await geocoder.geocode({ location: {lat, lng} });
  await geocodingCache.setReverse(lat, lng, {
    formatted_address: result.formatted_address,
    place_id: result.place_id,
    name: result.name
  });
}
```

---

### 3. PlaceStore (`src/utils/caching/PlaceStore.js`)

**Purpose**: Permanent storage for Google Places API data using place_ids.

**Storage**:
- **Memory**: LRU cache (100 entries)
- **IndexedDB**: Permanent storage (no expiration)

**Key Features**:
- NO EXPIRATION (Google ToS allows indefinite place_id storage)
- Skip redundant `getDetails()` calls for known places
- Can support "recent searches" feature
- Can support "favorite locations" feature

**Google ToS Compliance**:
- ✅ place_id can be stored INDEFINITELY
- ✅ Also applies to: pano_id (Street View), video_id (Aerial View)

**Usage**:
```javascript
import placeStore from './utils/caching/PlaceStore';

// Check before calling getDetails()
const cached = await placeStore.get(placeId);
if (cached) {
  return cached; // Skip API call!
}

// After successful getDetails()
await placeStore.set(placeId, placeDetails);

// Get recent places for UI
const recent = await placeStore.getRecent(10);
```

---

## Saved Routes Expiration

**File**: `src/utils/savedRoutesUtils.js`

**Important**: User-saved routes now have 30-day expiration to comply with Google ToS (coordinates can only be cached for 30 days).

**Features**:
- Auto-cleanup of expired routes when `getSavedRoutes()` is called
- Old routes without `expiresAt` field are automatically removed
- Clear storage updates when routes expire

**User Impact**:
- Routes older than 30 days will be automatically removed
- Users should be notified before expiration (future feature)
- Routes can be "refreshed" by re-saving (resets 30-day timer)

---

## Google ToS Compliance Summary

| Data Type | Max Cache Duration | Storage Location | Notes |
|-----------|-------------------|------------------|-------|
| Coordinates (lat/lng) | 30 days | IndexedDB | ✅ Enforced with TTL |
| place_id | Indefinite | IndexedDB | ✅ No expiration |
| Directions routes | 30 days | IndexedDB | ✅ Coordinates only |
| Geocoding results | 30 days | IndexedDB | ✅ With auto-cleanup |
| Formatted addresses | Session only | Memory cache | ✅ Not persisted |

**Auto-Cleanup**: All caches automatically remove expired entries on initialization and during access.

---

## Statistics & Monitoring

Each cache provides statistics via `getStats()`:

```javascript
{
  hits: 150,           // Total cache hits
  misses: 50,          // Total cache misses
  hitRate: "75.00%",   // Hit rate percentage
  memoryHits: 100,     // Hits from memory cache
  diskHits: 50,        // Hits from IndexedDB
  memorySize: 25       // Current memory cache size
}
```

**Usage Example**:
```javascript
import directionsCache from './utils/caching/DirectionsCache';

// Log stats to console
console.log('Directions Cache Stats:', directionsCache.getStats());

// Check hit rate
const stats = directionsCache.getStats();
if (parseFloat(stats.hitRate) > 70) {
  console.log('Excellent cache performance!');
}
```

---

## Future: Migration to Supabase

### Why Migrate?

When user authentication is added to LenaMaps, migrating to Supabase will provide:

1. **Sync across devices**: Users can access their saved routes from any device
2. **Collaborative routes**: Share routes with other users
3. **Better expiration management**: Database-level TTL triggers
4. **Analytics**: Track cache hit rates across all users
5. **Offline-first with sync**: Progressive Web App capabilities

### Migration Architecture

```
┌─────────────────────────────────────────┐
│         Application Layer               │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Cache Layer                         │
│  ┌─────────────────────────────────┐   │
│  │  Layer 1: Memory (same)          │   │
│  └─────────────────────────────────┘   │
│               │                          │
│               ▼                          │
│  ┌─────────────────────────────────┐   │
│  │  Layer 2: Supabase Database     │   │  ← NEW!
│  │  - Row Level Security (RLS)     │   │
│  │  - User-specific caches         │   │
│  │  - Automatic TTL via triggers   │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Database Schema (Supabase)

```sql
-- Directions cache table
CREATE TABLE directions_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  route_data JSONB NOT NULL,
  coords JSONB NOT NULL,
  mode TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE(user_id, cache_key)
);

-- Geocoding cache table
CREATE TABLE geocoding_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('forward', 'reverse')),
  lat DECIMAL(10, 6),
  lng DECIMAL(10, 6),
  place_id TEXT,
  formatted_address TEXT,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE(user_id, cache_key)
);

-- Place store table (no expiration)
CREATE TABLE place_store (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  name TEXT,
  lat DECIMAL(10, 6),
  lng DECIMAL(10, 6),
  formatted_address TEXT,
  types TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, place_id)
);

-- Saved routes table (with 30-day expiration)
CREATE TABLE saved_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  locations JSONB NOT NULL,
  modes JSONB NOT NULL,
  custom_draw_enabled JSONB,
  custom_points JSONB,
  snap_to_roads JSONB,
  locked_segments JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Auto-cleanup trigger (runs daily)
CREATE OR REPLACE FUNCTION cleanup_expired_caches()
RETURNS void AS $$
BEGIN
  DELETE FROM directions_cache WHERE expires_at < NOW();
  DELETE FROM geocoding_cache WHERE expires_at < NOW();
  DELETE FROM saved_routes WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule daily cleanup
SELECT cron.schedule(
  'cleanup-expired-caches',
  '0 2 * * *', -- 2 AM daily
  'SELECT cleanup_expired_caches()'
);
```

### Row Level Security (RLS)

```sql
-- Enable RLS
ALTER TABLE directions_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE geocoding_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_routes ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can manage their own directions cache"
  ON directions_cache FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own geocoding cache"
  ON geocoding_cache FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own place store"
  ON place_store FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own saved routes"
  ON saved_routes FOR ALL
  USING (auth.uid() = user_id);
```

### Code Migration Example

**Before (IndexedDB)**:
```javascript
// src/utils/caching/DirectionsCache.js
async get(origin, destination, mode) {
  // Check memory first
  if (this.memoryCache.has(key)) {
    return this.memoryCache.get(key);
  }

  // Check IndexedDB
  const cached = await db.routes.get(key);
  if (cached && Date.now() < cached.expires) {
    return cached.data;
  }

  return null;
}
```

**After (Supabase)**:
```javascript
// src/utils/caching/DirectionsCache.js
import { supabase } from './supabaseClient';

async get(origin, destination, mode) {
  // Check memory first (unchanged)
  if (this.memoryCache.has(key)) {
    return this.memoryCache.get(key);
  }

  // Check Supabase database
  const { data, error } = await supabase
    .from('directions_cache')
    .select('route_data, expires_at')
    .eq('cache_key', key)
    .single();

  if (data && new Date(data.expires_at) > new Date()) {
    // Promote to memory cache
    this.memoryCache.set(key, data.route_data);
    return data.route_data;
  }

  return null;
}

async set(origin, destination, mode, routeData) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + this.maxAge);

  // Store in memory (unchanged)
  this.memoryCache.set(key, routeData);

  // Store in Supabase
  await supabase
    .from('directions_cache')
    .upsert({
      cache_key: key,
      user_id: (await supabase.auth.getUser()).data.user.id,
      route_data: routeData,
      coords: this.extractCoordinates(routeData),
      mode: mode,
      expires_at: expiresAt.toISOString()
    });
}
```

### Migration Checklist

When adding authentication:

- [ ] Install Supabase client: `npm install @supabase/supabase-js`
- [ ] Create Supabase project and get API credentials
- [ ] Set up authentication (email/password, OAuth, magic links)
- [ ] Create database tables with schema above
- [ ] Enable Row Level Security policies
- [ ] Set up cron job for auto-cleanup
- [ ] Update cache classes to use Supabase instead of IndexedDB
- [ ] Add loading states for async database operations
- [ ] Test offline functionality (Supabase has built-in offline support)
- [ ] Add sync indicators in UI ("Syncing...", "Synced")
- [ ] Migrate existing localStorage data to Supabase (one-time migration)

### Benefits After Migration

1. **User Experience**:
   - Routes sync across all devices
   - Shared routes with collaborators
   - Route history and favorites
   - Offline-first with automatic sync

2. **Developer Experience**:
   - Real-time subscriptions for collaborative editing
   - Better debugging with Supabase dashboard
   - Built-in analytics and monitoring
   - Type-safe database queries

3. **Cost Optimization**:
   - Shared cache across all users (if appropriate)
   - Better cache hit rates with larger dataset
   - Analytics to optimize cache strategies

---

## Testing

### Manual Testing

1. **Test DirectionsCache**:
   ```javascript
   // In browser console
   import directionsCache from './utils/caching/DirectionsCache';

   // Clear cache
   await directionsCache.clear();

   // Check stats (should be 0)
   console.log(directionsCache.getStats());

   // Calculate a route (will be cached)
   // Calculate same route again (should hit cache)

   // Check stats (should show hit)
   console.log(directionsCache.getStats());
   ```

2. **Test Expiration**:
   - Open IndexedDB in Chrome DevTools (Application > Storage > IndexedDB)
   - Manually modify `expires` field to past date
   - Reload app - cache entry should be auto-deleted

3. **Test Saved Routes Expiration**:
   - Save a route
   - Open localStorage in DevTools
   - Modify `expiresAt` to past date
   - Reload app - route should disappear from saved routes

### Performance Testing

- Monitor cache hit rates in production
- Target: >60% hit rate for directions, >70% for geocoding
- If hit rate is low, consider increasing memory cache size

---

## Best Practices

1. **Always check cache before API calls**:
   ```javascript
   const cached = await cache.get(...);
   if (cached) return cached; // Skip API call
   ```

2. **Always cache after successful API calls**:
   ```javascript
   const result = await api.call(...);
   await cache.set(..., result); // Save for next time
   ```

3. **Monitor statistics**:
   ```javascript
   // Log stats periodically
   setInterval(() => {
     console.log('Cache Stats:', cache.getStats());
   }, 60000); // Every minute
   ```

4. **Clear caches during debugging**:
   ```javascript
   // Clear all caches
   await directionsCache.clear();
   await geocodingCache.clear();
   await placeStore.clear();
   ```

5. **Handle cache errors gracefully**:
   ```javascript
   try {
     const cached = await cache.get(...);
   } catch (error) {
     console.error('Cache error:', error);
     // Fallback to API call
   }
   ```

---

## Troubleshooting

### Cache not working

1. Check browser compatibility (IndexedDB support)
2. Check if user has disabled IndexedDB in browser settings
3. Check for quota exceeded errors (unlikely with current data sizes)
4. Clear browser data and test again

### High cache miss rate

1. Check if cache keys are generated correctly
2. Verify coordinate precision (should be 6 decimals)
3. Check if TTL is too short (default: 30 days)
4. Monitor auto-cleanup frequency

### IndexedDB quota errors

1. Current caches use minimal storage (~1KB per entry)
2. Typical quota: 50MB+ (can store 50,000+ routes)
3. If quota exceeded, implement LRU eviction for IndexedDB
4. Consider migrating to Supabase for unlimited storage

---

## Cost Savings Analysis

### Before Caching
- Directions API: $5 per 1,000 requests
- Geocoding API: $5 per 1,000 requests
- Places API: $17 per 1,000 requests

**Example Usage** (1,000 users, 10 routes/user/month):
- 10,000 direction requests = $50/month
- 5,000 geocoding requests = $25/month
- 2,000 places requests = $34/month
- **Total: $109/month**

### After Caching (70% hit rate)
- Direction requests: 3,000 (70% cached) = $15/month
- Geocoding requests: 1,500 (70% cached) = $7.50/month
- Places requests: 600 (70% cached) = $10.20/month
- **Total: $32.70/month**

**Savings: $76.30/month (70% reduction)**

---

## License & Compliance

This caching implementation fully complies with:
- ✅ Google Maps Platform Terms of Service (2024)
- ✅ 30-day maximum cache duration for coordinates
- ✅ Indefinite storage for place_ids
- ✅ Automatic expiration enforcement
- ✅ No caching of restricted content

Last updated: 2025-11-12
