import { useEffect, useRef, useState } from 'react';
import { getTransportationColor, createPolylineOptions } from '../utils/mapHelpers';

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
  const clickListenerRef = useRef(null);

  // Get color for the current mode
  const strokeColor = getTransportationColor(mode);

  // Render polyline from points array
  useEffect(() => {
    console.log(`🎨 CustomRouteDrawer segment ${segmentIndex} effect:`, {
      hasMap: !!map,
      isEnabled,
      pointsCount: points.length
    });

    if (!map) {
      // Clean up if no map
      console.log(`🧹 CustomRouteDrawer segment ${segmentIndex}: No map, clearing polyline`);
      if (mainPolylineRef.current) {
        mainPolylineRef.current.setMap(null);
        mainPolylineRef.current = null;
      }
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
      // Get the polyline style options for this mode (handles dotted, waves, railroad tracks, etc)
      const polylineOptions = createPolylineOptions(mode);

      if (!mainPolylineRef.current) {
        mainPolylineRef.current = new window.google.maps.Polyline({
          path: pathPoints,
          geodesic: true,
          ...polylineOptions, // Apply mode-specific styling
          map: map,
          zIndex: 200 // Below animation marker but above other route elements
        });
      } else {
        mainPolylineRef.current.setPath(pathPoints);
        // Update styling in case mode changed
        mainPolylineRef.current.setOptions(polylineOptions);
      }
    } else if (mainPolylineRef.current) {
      mainPolylineRef.current.setMap(null);
      mainPolylineRef.current = null;
    }

    // Joint markers removed - no longer needed

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
