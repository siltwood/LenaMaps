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

  // Get color for the current mode
  const strokeColor = getTransportationColor(mode);

  // Clean up markers
  const clearPointMarkers = () => {
    pointMarkersRef.current.forEach(marker => {
      if (marker) marker.setMap(null);
    });
    pointMarkersRef.current = [];
  };

  // Render polyline and point markers from points array
  useEffect(() => {
    if (!map || !isEnabled) {
      // Clean up
      if (mainPolylineRef.current) {
        mainPolylineRef.current.setMap(null);
        mainPolylineRef.current = null;
      }
      clearPointMarkers();
      return;
    }

    // Build path - start with previousLocation if this is a continuation (B→C)
    const pathPoints = [];
    if (previousLocation && segmentIndex > 0) {
      pathPoints.push({ lat: previousLocation.lat, lng: previousLocation.lng });
    }
    pathPoints.push(...points);

    // Update or create polyline
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

    // Clear old markers
    clearPointMarkers();

    // Add point markers for each clicked point (not previousLocation)
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
    });

    return () => {
      if (mainPolylineRef.current) {
        mainPolylineRef.current.setMap(null);
        mainPolylineRef.current = null;
      }
      clearPointMarkers();
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
      console.error('Error snapping to road:', error);
      return { lat: latLng.lat(), lng: latLng.lng() };
    }
  };

  // Handle map click - add a new point
  const handleClick = async (e) => {
    if (!isEnabled || !map) return;

    console.log('CUSTOM ROUTE DRAWER CLICK:');
    console.log('  Segment index:', segmentIndex);
    console.log('  isEnabled:', isEnabled);
    console.log('  Current points count:', points.length);

    const latLng = e.latLng;

    // Optionally snap to road
    const point = await snapPointToRoad(latLng);
    console.log('  Adding point:', point);

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
      console.log('  AUTO-SET LOCATIONS logic:');
      console.log('    allPoints length:', allPoints.length);
      console.log('    segmentIndex:', segmentIndex);

      if (segmentIndex === 0) {
        // First segment (A→B): set both start and end from clicks
        if (allPoints.length === 1) {
          // First click - set both A and B to this point for now
          console.log('    First click - setting both A and B to same point');
          onSetLocations(segmentIndex, point, point);
        } else {
          // Subsequent clicks - update B, keep A
          console.log('    Subsequent click - updating only B');
          onSetLocations(segmentIndex, null, point);
        }
      } else {
        // Later segments (B→C, C→D, etc.): only update the end point
        // Start point already exists from previous segment
        console.log('    Later segment - updating only end point');
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
