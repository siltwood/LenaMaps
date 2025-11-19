import { useCallback, useEffect, useRef } from 'react';
import { ANIMATION_ZOOM, ANIMATION_PADDING } from '../../../../constants/animationConstants';
import { centerMapOnLocation } from '../../../../utils/mapCenteringUtils';

/**
 * useZoomManager - Manages map zoom and camera positioning for route animation
 *
 * Handles:
 * - Bounds calculation from route data
 * - Follow mode vs whole route view switching
 * - Initial route fitting on mount
 * - Dynamic zoom based on route distance
 *
 * @param {google.maps.Map} map - Google Maps instance
 * @param {Object} directionsRoute - Route data with locations and segments
 * @param {boolean} isAnimating - Whether animation is currently running
 * @param {boolean} isMinimized - Whether panel is minimized
 * @param {React.RefObject} totalDistanceRef - Ref containing total route distance in km
 * @param {React.RefObject} zoomLevelRef - Ref for zoom level ('follow' or 'whole')
 * @param {React.RefObject} forceCenterOnNextFrameRef - Ref to trigger centering in animation loop
 * @param {React.RefObject} polylineRef - Ref to the animated polyline
 * @param {boolean} isMobile - Whether device is mobile
 * @returns {Object} Zoom management utilities
 */
export const useZoomManager = (
  map,
  directionsRoute,
  isAnimating,
  isMinimized,
  totalDistanceRef,
  zoomLevelRef,
  forceCenterOnNextFrameRef,
  polylineRef,
  isMobile
) => {
  /**
   * Calculate zoom level and center for given bounds
   * Uses Google Maps zoom calculation formula
   */
  const calculateBoundsZoomLevel = useCallback((bounds, map) => {
    if (!bounds || !map) return null;

    const WORLD_DIM = { height: 256, width: 256 };
    const ZOOM_MAX = 21;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    const latFraction = (Math.abs(ne.lat() - sw.lat()) / 180);
    const lngDiff = ne.lng() - sw.lng();
    const lngFraction = ((lngDiff < 0 ? lngDiff + 360 : lngDiff) / 360);

    const mapDiv = map.getDiv();
    const latZoom = Math.floor(Math.log(mapDiv.offsetHeight / WORLD_DIM.height / latFraction) / Math.LN2);
    const lngZoom = Math.floor(Math.log(mapDiv.offsetWidth / WORLD_DIM.width / lngFraction) / Math.LN2);

    return {
      center: bounds.getCenter(),
      zoom: Math.min(latZoom, lngZoom, ZOOM_MAX)
    };
  }, []);

  /**
   * Get appropriate zoom level for follow mode based on route distance
   */
  const getFollowModeZoom = useCallback(() => {
    // Use total distance if available
    const routeDistanceKm = totalDistanceRef.current;

    if (routeDistanceKm > 500) {
      // Long routes need less zoom
      return ANIMATION_ZOOM.FOLLOW_MODE_LONG;
    } else if (routeDistanceKm > 50) {
      // Medium routes
      return ANIMATION_ZOOM.FOLLOW_MODE_MEDIUM;
    } else {
      // Short routes can handle more zoom
      return ANIMATION_ZOOM.FOLLOW_MODE_SHORT;
    }
  }, [totalDistanceRef]);

  /**
   * Helper to fit entire route in view
   */
  const fitWholeRoute = useCallback(() => {
    if (!map || !directionsRoute || !directionsRoute.allLocations || directionsRoute.allLocations.length < 2) {
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();

    // Include all route locations
    directionsRoute.allLocations.forEach(loc => {
      if (loc && loc.lat && loc.lng) {
        bounds.extend(new window.google.maps.LatLng(loc.lat, loc.lng));
      }
    });

    // Include segment paths if available for more accurate bounds
    if (directionsRoute.segments && directionsRoute.segments.length > 0) {
      directionsRoute.segments.forEach(segment => {
        if (segment.route && segment.route.overview_path) {
          // Sample points from segments
          const step = Math.max(1, Math.floor(segment.route.overview_path.length / 20));
          for (let i = 0; i < segment.route.overview_path.length; i += step) {
            bounds.extend(segment.route.overview_path[i]);
          }
        }
      });
    }

    // Set map view to fit bounds
    const padding = ANIMATION_PADDING.WHOLE_ROUTE;
    const centerAndZoom = calculateBoundsZoomLevel(bounds, map);
    if (centerAndZoom) {
      map.setCenter(centerAndZoom.center);
      map.setZoom(centerAndZoom.zoom - 1); // Subtract 1 for padding effect
    }
  }, [map, directionsRoute, calculateBoundsZoomLevel]);

  /**
   * Initialize by showing the whole route when component mounts
   * Skip on mobile to preserve mobile-specific centering
   */
  useEffect(() => {
    if (map && directionsRoute && directionsRoute.allLocations && directionsRoute.allLocations.length >= 2 && !isMobile) {
      fitWholeRoute();
    }
  }, [map, directionsRoute, fitWholeRoute, isMobile]);

  /**
   * Handle zoom level changes (follow vs whole mode)
   */
  useEffect(() => {
    const zoomLevel = zoomLevelRef.current;

    if (!map || isMinimized) return;

    // When switching to follow mode (whether animating or not)
    if (zoomLevel === 'follow') {
      // During animation, just set the flag and let the animation loop handle it
      if (isAnimating) {
        // Set flag for animation loop to handle centering and zooming
        forceCenterOnNextFrameRef.current = true;
      } else {
        // Not animating, so immediately center on first marker and zoom
        if (directionsRoute && directionsRoute.allLocations && directionsRoute.allLocations.length > 0) {
          const firstLoc = directionsRoute.allLocations[0];
          if (firstLoc && firstLoc.lat && firstLoc.lng) {
            centerMapOnLocation(map, firstLoc, isMobile, true);
            map.setZoom(getFollowModeZoom());
          }
        }
      }
    }
    // When switching to whole mode (not animating), show the entire route
    else if (zoomLevel === 'whole' && !isAnimating) {
      fitWholeRoute();
    }

    // Only adjust zoom if animation is playing
    // In "whole" mode, don't zoom until play is pressed
    if (isAnimating && zoomLevel === 'whole') {
      fitWholeRoute();
    }
  }, [zoomLevelRef.current, map, directionsRoute, isMinimized, isAnimating, getFollowModeZoom, fitWholeRoute, forceCenterOnNextFrameRef]);

  /**
   * Update bounds when animated polyline changes (for whole route view)
   */
  useEffect(() => {
    // When animating with a polyline, include it in the bounds for whole view
    if (map && !isMinimized && isAnimating && zoomLevelRef.current === 'whole' && polylineRef.current) {
      const bounds = new window.google.maps.LatLngBounds();

      // Include all route locations
      if (directionsRoute && directionsRoute.allLocations) {
        directionsRoute.allLocations.forEach(loc => {
          if (loc && loc.lat && loc.lng) {
            bounds.extend(new window.google.maps.LatLng(loc.lat, loc.lng));
          }
        });
      }

      // Include the animated polyline path
      const path = polylineRef.current.getPath();
      const step = Math.max(1, Math.floor(path.getLength() / 50));
      for (let i = 0; i < path.getLength(); i += step) {
        bounds.extend(path.getAt(i));
      }

      // Use immediate zoom transition
      const padding = ANIMATION_PADDING.WHOLE_ROUTE;
      const centerAndZoom = calculateBoundsZoomLevel(bounds, map);
      if (centerAndZoom) {
        map.setCenter(centerAndZoom.center);
        map.setZoom(centerAndZoom.zoom - 1); // Subtract 1 for padding effect
      }
    }
  }, [map, isMinimized, isAnimating, zoomLevelRef.current, directionsRoute, polylineRef, calculateBoundsZoomLevel]);

  return {
    calculateBoundsZoomLevel,
    getFollowModeZoom,
    fitWholeRoute
  };
};

export default useZoomManager;
