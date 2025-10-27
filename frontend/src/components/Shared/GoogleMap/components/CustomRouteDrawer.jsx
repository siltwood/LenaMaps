import { useEffect, useRef, useState } from 'react';
import { getTransportationColor } from '../utils/mapHelpers';

/**
 * CustomRouteDrawer component handles click-to-segment route creation
 * Features:
 * - Click to add points, creating straight-line segments
 * - Optional snap-to-roads on each click
 * - Point markers at each clicked location
 * - Undo removes last clicked point
 * - Color based on selected transportation mode
 */
const CustomRouteDrawer = ({
  map,
  segmentIndex,
  isEnabled,
  snapToRoads,
  mode = 'walk',
  onPointAdded,
  onSetLocations,
  previousLocation,
  points = [] // Array of clicked points
}) => {
  const mainPolylineRef = useRef(null); // One continuous polyline for the entire path
  const pointMarkersRef = useRef([]); // Markers for each clicked point
  const clickListenerRef = useRef(null);

  // Keep a persistent array of ALL markers ever created for this instance
  // This ensures cleanup works even if React timing issues occur
  const allMarkersEverCreatedRef = useRef([]);

  // Get color for the current mode
  const strokeColor = getTransportationColor(mode);

  // Clean up markers
  const clearPointMarkers = () => {
    const totalMarkers = pointMarkersRef.current.length;
    console.log(`🧹 CustomRouteDrawer: Clearing ${totalMarkers} point markers for segment ${segmentIndex}`);

    // Clear from both refs to ensure thorough cleanup
    pointMarkersRef.current.forEach(marker => {
      if (marker) marker.setMap(null);
    });
    pointMarkersRef.current = [];
  };

  // Complete cleanup of ALL markers ever created (for unmount)
  const clearAllMarkers = () => {
    const total = allMarkersEverCreatedRef.current.length;
    console.log(`🧹🧹 CustomRouteDrawer: COMPLETE CLEANUP of ${total} markers for segment ${segmentIndex}`);

    allMarkersEverCreatedRef.current.forEach(marker => {
      if (marker) {
        try {
          marker.setMap(null);
        } catch (e) {
          // Marker might already be removed
        }
      }
    });
    allMarkersEverCreatedRef.current = [];
    pointMarkersRef.current = [];
  };

  // Render polyline and point markers from points array
  useEffect(() => {
    console.log(`🎨 CustomRouteDrawer segment ${segmentIndex} effect:`, {
      hasMap: !!map,
      isEnabled,
      pointsCount: points.length,
      currentMarkers: pointMarkersRef.current.length
    });

    if (!map) {
      // Clean up if no map
      console.log(`🧹 CustomRouteDrawer segment ${segmentIndex}: No map, clearing ALL`);
      if (mainPolylineRef.current) {
        mainPolylineRef.current.setMap(null);
        mainPolylineRef.current = null;
      }
      clearAllMarkers();
      return;
    }

    // Build path - start with previousLocation if this is a continuation (B→C)
    const pathPoints = [];
    if (previousLocation && segmentIndex > 0) {
      pathPoints.push({ lat: previousLocation.lat, lng: previousLocation.lng });
    }
    pathPoints.push(...points);

    // Update or create polyline (render even when locked/disabled)
    if (pathPoints.length >= 2) {
      if (!mainPolylineRef.current) {
        mainPolylineRef.current = new window.google.maps.Polyline({
          path: pathPoints,
          geodesic: true,
          strokeColor: strokeColor,
          strokeOpacity: 1.0,
          strokeWeight: 4,
          map: map,
          zIndex: 5000 // Higher zIndex to stay above animation polyline
        });
      } else {
        mainPolylineRef.current.setPath(pathPoints);
      }
    } else if (mainPolylineRef.current) {
      mainPolylineRef.current.setMap(null);
      mainPolylineRef.current = null;
    }

    // Clear old markers ALWAYS (even if disabled) to ensure cleanup on undo
    console.log(`🧹 CustomRouteDrawer segment ${segmentIndex}: Clearing old markers before redraw`);
    clearPointMarkers();

    // Add point markers for each clicked point (not previousLocation)
    // Only show point markers when NOT locked (when isEnabled is true)
    console.log(`🎨 CustomRouteDrawer segment ${segmentIndex}: isEnabled=${isEnabled}, will create ${points.length} markers`);
    if (isEnabled && points.length > 0) {
      points.forEach((point, idx) => {
        const marker = new window.google.maps.Marker({
          position: point,
          map: map,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: strokeColor,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          },
          zIndex: 3000 + idx,
          draggable: false
        });
        pointMarkersRef.current.push(marker);
        allMarkersEverCreatedRef.current.push(marker); // Track for cleanup

        // Store globally for force cleanup
        if (!window._customMarkers) window._customMarkers = [];
        window._customMarkers.push(marker);
      });
    }

    // Store polyline globally for force cleanup
    if (mainPolylineRef.current) {
      if (!window._customPolylines) window._customPolylines = [];
      if (!window._customPolylines.includes(mainPolylineRef.current)) {
        window._customPolylines.push(mainPolylineRef.current);
      }
    }

    return () => {
      console.log(`🧹 CustomRouteDrawer segment ${segmentIndex}: CLEANUP on unmount/re-render`);
      if (mainPolylineRef.current) {
        mainPolylineRef.current.setMap(null);
        mainPolylineRef.current = null;
      }
      clearAllMarkers(); // Use complete cleanup to ensure all markers removed
    };
  }, [map, isEnabled, points, previousLocation, strokeColor, segmentIndex]);

  // Snap a point to roads using Google Roads API
  const snapPointToRoad = async (latLng) => {
    if (!snapToRoads) return { lat: latLng.lat(), lng: latLng.lng() };

    try {
      // Use Google Roads API to snap to nearest road
      // Note: This requires a separate API key and setup
      // For now, we'll return the original point
      // TODO: Implement actual Roads API call
      return { lat: latLng.lat(), lng: latLng.lng() };
    } catch (error) {
      return { lat: latLng.lat(), lng: latLng.lng() };
    }
  };

  // Handle map click - add a new point
  const handleClick = async (e) => {
    if (!isEnabled || !map) return;

    const latLng = e.latLng;

    // Optionally snap to road
    const point = await snapPointToRoad(latLng);


    // Notify parent to add this point
    if (onPointAdded) {
      onPointAdded({
        segmentIndex,
        point,
        snapped: snapToRoads
      });
    }

    // AUTO-SET LOCATIONS: First point = start, Last point = end
    if (onSetLocations) {
      const allPoints = [...points, point];

      if (segmentIndex === 0) {
        // First segment (A→B): set start on first click, end on subsequent clicks
        if (allPoints.length === 1) {
          // First click - set only A (don't set B yet, no markers needed)
          onSetLocations(segmentIndex, point, null);
        } else {
          // Second+ clicks - update B, keep A
          onSetLocations(segmentIndex, null, point);
        }
      } else {
        // Later segments (B→C, C→D, etc.): only update the end point
        // Start point already exists from previous segment
        onSetLocations(segmentIndex, null, point);
      }
    }
  };

  // Set up cursor and click listener
  useEffect(() => {
    if (!map || !isEnabled) {
      // Clean up
      if (clickListenerRef.current) {
        window.google.maps.event.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }

      // Reset cursor
      if (map) {
        map.setOptions({
          draggableCursor: null,
          draggingCursor: null
        });
      }

      return;
    }

    // Set crosshair cursor for click-to-add mode, grabbing cursor when dragging
    map.setOptions({
      draggableCursor: 'crosshair',  // Cursor when hovering (ready to click)
      draggingCursor: 'grabbing'      // Cursor when dragging the map
    });

    // Add click listener
    clickListenerRef.current = map.addListener('click', handleClick);

    // Cleanup
    return () => {
      if (clickListenerRef.current) {
        window.google.maps.event.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }

      // Reset cursor
      map.setOptions({
        draggableCursor: null,
        draggingCursor: null
      });
    };
  }, [map, isEnabled, snapToRoads, points, segmentIndex]);

  // This component doesn't render anything to the DOM
  return null;
};

export default CustomRouteDrawer;
