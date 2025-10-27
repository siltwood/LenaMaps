// Test script to verify directions cache functionality
import directionsCache from './directionsCache';

// Test cache functionality
function testCache() {
  // Test location points
  const origin1 = { lat: 37.7749, lng: -122.4194 }; // San Francisco
  const dest1 = { lat: 37.3382, lng: -121.8863 }; // San Jose
  const mode1 = 'car';

  const origin2 = { lat: 37.8716, lng: -122.2727 }; // Berkeley
  const dest2 = { lat: 37.4419, lng: -122.1430 }; // Palo Alto
  const mode2 = 'walk';

  // Mock result
  const mockResult1 = { routes: [{ id: 'route1' }] };
  const mockResult2 = { routes: [{ id: 'route2' }] };

  // Test 1: Cache miss
  const miss = directionsCache.get(origin1, dest1, mode1);

  // Test 2: Cache set and get
  directionsCache.set(origin1, dest1, mode1, mockResult1);
  const hit = directionsCache.get(origin1, dest1, mode1);

  // Test 3: Different mode = different cache entry
  const differentMode = directionsCache.get(origin1, dest1, 'walk');

  // Test 4: Different coordinates = different cache entry
  const differentDest = directionsCache.get(origin1, dest2, mode1);

  // Test 5: LRU eviction
  const initialSize = directionsCache.getStats().size;
  // Add multiple entries
  for (let i = 0; i < 10; i++) {
    const origin = { lat: 37.7749 + i * 0.01, lng: -122.4194 };
    const dest = { lat: 37.3382 + i * 0.01, lng: -121.8863 };
    directionsCache.set(origin, dest, 'car', { id: `route${i}` });
  }
  const newSize = directionsCache.getStats().size;

  // Test 6: Clear cache
  directionsCache.clear();
  const clearedSize = directionsCache.getStats().size;
}

// Export for testing
export default testCache;