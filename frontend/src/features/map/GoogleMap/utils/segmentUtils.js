/**
 * Segment utility functions for route management
 */

/**
 * Calculate marker scale based on zoom level
 */
export const getMarkerScale = (zoom) => {
  // Base scale at zoom 13
  const baseZoom = 13;
  const maxScale = 1.2;  // Maximum scale at high zoom
  const minScale = 0.5;  // Minimum scale at low zoom

  // Scale decreases as you zoom out
  const scaleFactor = Math.pow(2, (zoom - baseZoom) * 0.15);
  return Math.max(minScale, Math.min(maxScale, scaleFactor));
};

/**
 * Generate a curved arc path for flight segments
 */
export const generateFlightArc = (origin, destination, numPoints = 100) => {
  const path = [];

  // Convert to LatLng objects if needed
  const startLat = typeof origin.lat === 'function' ? origin.lat() : origin.lat;
  const startLng = typeof origin.lng === 'function' ? origin.lng() : origin.lng;
  const endLat = typeof destination.lat === 'function' ? destination.lat() : destination.lat;
  const endLng = typeof destination.lng === 'function' ? destination.lng() : destination.lng;

  // Calculate distance to determine arc height
  const R = 6371; // Earth's radius in km
  const dLat = (endLat - startLat) * Math.PI / 180;
  const dLng = (endLng - startLng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(startLat * Math.PI / 180) * Math.cos(endLat * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;

  // Subtle arc that scales proportionally with distance
  // Always 2% of the distance for consistent subtle curve at any length
  const arcHeight = distance * 0.02 / 111; // 2% of distance, converted to degrees

  // Generate points along the arc
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;

    // Linear interpolation for base position
    const lat = startLat + (endLat - startLat) * t;
    const lng = startLng + (endLng - startLng) * t;

    // Add arc height using a parabolic curve
    // Maximum height at t=0.5 (middle of path)
    const arcOffset = arcHeight * 4 * t * (1 - t);

    // Apply the arc as a latitude offset (creates upward curve)
    const arcLat = lat + arcOffset;

    path.push(new window.google.maps.LatLng(arcLat, lng));
  }

  return path;
};

/**
 * Calculate distance between two points using Haversine formula
 */
export const calculateDistance = (point1, point2) => {
  const R = 6371000; // Earth's radius in meters
  const lat1 = (typeof point1.lat === 'function' ? point1.lat() : point1.lat) * Math.PI / 180;
  const lat2 = (typeof point2.lat === 'function' ? point2.lat() : point2.lat) * Math.PI / 180;
  const deltaLat = lat2 - lat1;
  const deltaLng = ((typeof point2.lng === 'function' ? point2.lng() : point2.lng) -
                    (typeof point1.lng === 'function' ? point1.lng() : point1.lng)) * Math.PI / 180;

  const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in meters
};

/**
 * Validate if route contains ONLY the required transit mode (ferry or rail)
 * Allows short walking connectors (<300m) to/from terminals/stations
 */
export const validateTransitMode = (result, requiredMode) => {
  if (!result || !result.routes || !result.routes[0]) return false;

  const steps = result.routes[0].legs[0].steps;

  if (requiredMode === 'ferry') {
    // Route must be ONLY ferry + walking connectors
    // No driving, biking, or other transit types allowed
    let hasFerry = false;
    for (const step of steps) {
      const travelMode = step.travel_mode;

      if (travelMode === 'WALKING') {
        // Allow walking connectors (<1km) to/from ferry terminal
        if (step.distance && step.distance.value > 1000) {
          return false; // Walking segment too long
        }
      } else if (travelMode === 'TRANSIT') {
        // Must be a ferry
        if (step.transit?.line?.vehicle?.type === 'FERRY') {
          hasFerry = true;
        } else {
          return false; // Non-ferry transit not allowed
        }
      } else {
        // No driving, biking, etc allowed
        return false;
      }
    }
    return hasFerry; // Must have at least one ferry step
  } else if (requiredMode === 'transit' || requiredMode === 'train') {
    // Route must be ONLY rail-based transit + walking connectors
    // No driving, biking, buses, or ferries allowed
    const railTypes = ['RAIL', 'SUBWAY', 'TRAIN', 'TRAM', 'METRO_RAIL', 'HEAVY_RAIL', 'COMMUTER_TRAIN'];
    let hasRail = false;

    for (const step of steps) {
      const travelMode = step.travel_mode;

      if (travelMode === 'WALKING') {
        // Allow walking connectors (<1km) to/from station
        if (step.distance && step.distance.value > 1000) {
          return false; // Walking segment too long
        }
      } else if (travelMode === 'TRANSIT') {
        // Must be rail-based
        const vehicleType = step.transit?.line?.vehicle?.type;
        if (railTypes.includes(vehicleType)) {
          hasRail = true;
        } else {
          return false; // Non-rail transit (bus/ferry) not allowed
        }
      } else {
        // No driving, biking, etc allowed
        return false;
      }
    }
    return hasRail; // Must have at least one rail step
  }

  return true; // Other modes don't need vehicle validation
};

/**
 * Validate if route starts and ends within 300m of requested points
 */
export const validateRouteProximity = (result, requestedOrigin, requestedDestination) => {
  if (!result || !result.routes || !result.routes[0]) return false;

  const leg = result.routes[0].legs[0];
  const MAX_DISTANCE = 300; // 300m

  const startDistance = calculateDistance(leg.start_location, requestedOrigin);
  const endDistance = calculateDistance(leg.end_location, requestedDestination);

  return startDistance <= MAX_DISTANCE && endDistance <= MAX_DISTANCE;
};

/**
 * Create a straight line route object (fallback when directions API fails)
 * Returns a mock route object that works with DirectionsRenderer
 */
export const createStraightLineRoute = (origin, destination) => {
  const step = {
    distance: { text: '0 m', value: 0 },
    duration: { text: '0 mins', value: 0 },
    end_location: destination,
    start_location: origin,
    travel_mode: 'WALKING',
    path: [origin, destination],
    lat_lngs: [origin, destination],
    instructions: 'Direct path'
  };

  return {
    routes: [{
      bounds: new window.google.maps.LatLngBounds(origin, destination),
      overview_path: [origin, destination],
      overview_polyline: '',
      legs: [{
        start_location: origin,
        end_location: destination,
        start_address: '',
        end_address: '',
        steps: [step],
        distance: { text: '0 m', value: 0 },
        duration: { text: '0 mins', value: 0 },
        via_waypoints: []
      }],
      warnings: ['No route found - showing direct path'],
      waypoint_order: [],
      copyrights: ''
    }],
    request: {
      origin: origin,
      destination: destination,
      travelMode: 'WALKING'
    }
  };
};

/**
 * Clear a single segment (route + markers)
 */
export const clearSegment = (segment) => {
  if (!segment) return;

  // Clear flight polyline if it exists
  if (segment.polyline) {
    segment.polyline.setMap(null);
  }

  // Clear route
  if (segment.routeRenderer) {
    if (segment.routeRenderer._hoverPolyline) {
      segment.routeRenderer._hoverPolyline.setMap(null);
    }
    segment.routeRenderer.setMap(null);
    try {
      segment.routeRenderer.setDirections({ routes: [] });
    } catch (e) {
      // Silently ignore clearing errors
    }
  }

  // Clear markers (stored as object: {start, end, transition, waypoint})
  if (segment.markers && typeof segment.markers === 'object') {
    Object.values(segment.markers).forEach(marker => {
      if (marker && marker.setMap) {
        marker.setMap(null);
      }
    });
  }
};
