import { useEffect, useRef } from 'react';
import { createPolylineOptions } from '../utils/mapHelpers';

/**
 * CustomRouteDrawer - Simplified to draw straight lines only
 * No waypoints, no clicking - just a geodesic line between start and end
 */
const CustomRouteDrawer = ({
  map,
  startLocation,
  endLocation,
  mode = 'walk',
  isEnabled
}) => {
  const polylineRef = useRef(null);

  // Draw straight line between start and end
  useEffect(() => {
    // Clean up previous polyline
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    // Only draw if enabled and both locations exist
    if (!map || !isEnabled || !startLocation || !endLocation) {
      return;
    }

    // Create geodesic polyline (straight line on globe)
    const polyline = new google.maps.Polyline({
      path: [startLocation, endLocation],
      geodesic: true, // Straight line on globe surface
      ...createPolylineOptions(mode), // Pass mode, it gets color automatically
      map
    });

    polylineRef.current = polyline;

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
      }
    };
  }, [map, startLocation, endLocation, mode, isEnabled]);

  return null;
};

export default CustomRouteDrawer;
