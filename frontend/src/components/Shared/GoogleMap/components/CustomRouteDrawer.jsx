import { useEffect, useRef, useState } from 'react';
import { getTransportationColor } from '../utils/mapHelpers';

/**
 * CustomRouteDrawer component handles drawing custom routes on the map
 * Features:
 * - Mouse and touch drawing support
 * - Stroke-based undo (each mouse/touch session = 1 stroke)
 * - Optional snap-to-roads
 * - Color based on selected transportation mode
 */
const CustomRouteDrawer = ({
  map,
  segmentIndex,
  isEnabled,
  snapToRoads,
  mode = 'walk',
  onStrokeComplete,
  onSetLocations, // NEW: Callback to auto-set Point A and Point B
  previousLocation, // NEW: The previous point (e.g., Point B when drawing B→C)
  existingStrokes = []
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const mainPolylineRef = useRef(null); // One continuous polyline for the entire path
  const allPointsRef = useRef([]); // All points in the continuous path
  const lastEndpointRef = useRef(null); // Last point where drawing ended
  const currentStrokeStartIndex = useRef(0); // Index where current stroke started
  const drawingListenersRef = useRef([]);

  // Get color for the current mode
  const strokeColor = getTransportationColor(mode);

  // Initialize or rebuild the continuous path from existing strokes
  useEffect(() => {
    if (!map || !isEnabled) {
      // Clean up
      if (mainPolylineRef.current) {
        mainPolylineRef.current.setMap(null);
        mainPolylineRef.current = null;
      }
      allPointsRef.current = [];
      lastEndpointRef.current = null;
      return;
    }

    // Rebuild the continuous path from existing strokes (for undo/clear support)
    if (existingStrokes && existingStrokes.length > 0) {
      // Build one continuous path from all strokes
      const continuousPath = [];

      // Start with previousLocation if this is a continuation segment
      if (previousLocation && segmentIndex > 0) {
        continuousPath.push({ lat: previousLocation.lat, lng: previousLocation.lng });
      }

      // Add all points from all strokes
      existingStrokes.forEach(stroke => {
        if (stroke && stroke.points) {
          continuousPath.push(...stroke.points);
        }
      });

      allPointsRef.current = continuousPath;

      if (continuousPath.length > 0) {
        lastEndpointRef.current = continuousPath[continuousPath.length - 1];

        // Create or update the polyline
        if (!mainPolylineRef.current) {
          mainPolylineRef.current = new window.google.maps.Polyline({
            path: continuousPath,
            geodesic: true,
            strokeColor: strokeColor,
            strokeOpacity: 1.0,
            strokeWeight: 4,
            map: map,
            zIndex: 2000
          });
        } else {
          mainPolylineRef.current.setPath(continuousPath);
        }
      }
    } else {
      // No existing strokes - initialize with previousLocation if needed
      if (previousLocation && allPointsRef.current.length === 0) {
        allPointsRef.current = [{ lat: previousLocation.lat, lng: previousLocation.lng }];
        lastEndpointRef.current = { lat: previousLocation.lat, lng: previousLocation.lng };
      }
    }

    return () => {
      if (mainPolylineRef.current) {
        mainPolylineRef.current.setMap(null);
        mainPolylineRef.current = null;
      }
    };
  }, [map, isEnabled, previousLocation, existingStrokes, strokeColor, segmentIndex]);

  // Snap a point to roads using Google Roads API
  const snapPointToRoad = async (latLng) => {
    if (!snapToRoads) return latLng;

    try {
      // Use Google Roads API to snap to nearest road
      // Note: This requires a separate API key and setup
      // For now, we'll return the original point
      // TODO: Implement actual Roads API call
      return latLng;
    } catch (error) {
      console.error('Error snapping to road:', error);
      return latLng;
    }
  };

  // Handle drawing start (mouse down or touch start)
  const handleDrawStart = (e) => {
    if (!isEnabled || !map) return;

    setIsDrawing(true);
    const latLng = e.latLng;
    const point = { lat: latLng.lat(), lng: latLng.lng() };

    // Remember where this stroke starts (for tracking new points only)
    currentStrokeStartIndex.current = allPointsRef.current.length;

    // If we have a last endpoint (from previous stroke), connect to it
    if (lastEndpointRef.current) {
      allPointsRef.current.push(lastEndpointRef.current);
      allPointsRef.current.push(point);
    } else {
      // First stroke ever
      allPointsRef.current.push(point);
    }

    // Create or update the main polyline
    if (!mainPolylineRef.current) {
      mainPolylineRef.current = new window.google.maps.Polyline({
        path: allPointsRef.current,
        geodesic: true,
        strokeColor: strokeColor,
        strokeOpacity: 1.0,
        strokeWeight: 4,
        map: map,
        zIndex: 2000
      });
    } else {
      mainPolylineRef.current.setPath(allPointsRef.current);
    }
  };

  // Handle drawing move (mouse move or touch move)
  const handleDrawMove = async (e) => {
    if (!isDrawing || !map) return;

    const latLng = e.latLng;
    let point = { lat: latLng.lat(), lng: latLng.lng() };

    // Optionally snap to road
    if (snapToRoads) {
      point = await snapPointToRoad(latLng);
    }

    // Add point to the continuous path
    allPointsRef.current.push(point);

    // Update the main polyline
    if (mainPolylineRef.current) {
      mainPolylineRef.current.setPath(allPointsRef.current);
    }
  };

  // Handle drawing end (mouse up or touch end)
  const handleDrawEnd = () => {
    if (!isDrawing || !map) return;

    setIsDrawing(false);

    // Save the last point as the endpoint for the next stroke to connect to
    if (allPointsRef.current.length > 0) {
      lastEndpointRef.current = allPointsRef.current[allPointsRef.current.length - 1];

      // Extract only the NEW points from this stroke
      const newStrokePoints = allPointsRef.current.slice(currentStrokeStartIndex.current);

      // AUTO-SET LOCATIONS: First point = A, Last point = B
      if (onSetLocations && segmentIndex === 0) {
        const startPoint = allPointsRef.current[0];
        const endPoint = lastEndpointRef.current;

        // Only update Point A on the very first stroke
        if (currentStrokeStartIndex.current === 0) {
          onSetLocations(startPoint, endPoint);
        } else {
          // Keep Point A, update Point B
          onSetLocations(null, endPoint);
        }
      }

      // Notify about stroke completion (only the NEW points)
      if (onStrokeComplete && newStrokePoints.length > 0) {
        onStrokeComplete({
          segmentIndex,
          points: newStrokePoints,
          snapped: snapToRoads,
          mode: mode
        });
      }
    }
  };

  // Set cursor - simple pen that gets slightly larger when drawing
  useEffect(() => {
    if (!map || !isEnabled) return;

    // Pen cursor - slightly larger when actively drawing
    const size = isDrawing ? 24 : 20;
    const penCursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><path d="M${size-4} 2l2 2-${size-8} ${size-8}-4 1 1-4z" fill="%23000" stroke="%23fff" stroke-width="1"/></svg>') 2 ${size-2}, auto`;

    map.setOptions({
      draggableCursor: penCursor,
      draggingCursor: penCursor
    });
  }, [map, isEnabled, isDrawing]);

  // Set up drawing event listeners
  useEffect(() => {
    if (!map || !isEnabled) {
      // Clean up listeners if disabled
      drawingListenersRef.current.forEach(listener => {
        if (listener) window.google.maps.event.removeListener(listener);
      });
      drawingListenersRef.current = [];

      // Re-enable map dragging and reset cursor
      if (map) {
        map.setOptions({
          draggable: true,
          draggableCursor: null,
          draggingCursor: null
        });
      }

      return;
    }

    // Disable map dragging when draw mode is enabled
    map.setOptions({ draggable: false });

    // Add event listeners for drawing
    const listeners = [
      window.google.maps.event.addDomListener(map.getDiv(), 'mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const bounds = map.getBounds();
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const projection = map.getProjection();

        if (!projection) return;

        const topRight = projection.fromLatLngToPoint(ne);
        const bottomLeft = projection.fromLatLngToPoint(sw);
        const scale = Math.pow(2, map.getZoom());

        const worldPoint = new window.google.maps.Point(
          e.offsetX / scale + bottomLeft.x,
          e.offsetY / scale + topRight.y
        );

        const latLng = projection.fromPointToLatLng(worldPoint);

        handleDrawStart({ latLng });
      }),

      window.google.maps.event.addDomListener(map.getDiv(), 'mousemove', (e) => {
        if (!isDrawing) return;

        e.preventDefault();
        e.stopPropagation();
        const bounds = map.getBounds();
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const projection = map.getProjection();

        if (!projection) return;

        const topRight = projection.fromLatLngToPoint(ne);
        const bottomLeft = projection.fromLatLngToPoint(sw);
        const scale = Math.pow(2, map.getZoom());

        const worldPoint = new window.google.maps.Point(
          e.offsetX / scale + bottomLeft.x,
          e.offsetY / scale + topRight.y
        );

        const latLng = projection.fromPointToLatLng(worldPoint);

        handleDrawMove({ latLng });
      }),

      window.google.maps.event.addDomListener(map.getDiv(), 'mouseup', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDrawEnd();
      }),

      // Touch events
      window.google.maps.event.addDomListener(map.getDiv(), 'touchstart', (e) => {
        if (e.touches && e.touches.length === 1) {
          e.preventDefault();
          e.stopPropagation();
          const touch = e.touches[0];
          const rect = map.getDiv().getBoundingClientRect();
          const offsetX = touch.clientX - rect.left;
          const offsetY = touch.clientY - rect.top;

          const bounds = map.getBounds();
          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          const projection = map.getProjection();

          if (!projection) return;

          const topRight = projection.fromLatLngToPoint(ne);
          const bottomLeft = projection.fromLatLngToPoint(sw);
          const scale = Math.pow(2, map.getZoom());

          const worldPoint = new window.google.maps.Point(
            offsetX / scale + bottomLeft.x,
            offsetY / scale + topRight.y
          );

          const latLng = projection.fromPointToLatLng(worldPoint);

          handleDrawStart({ latLng });
        }
      }),

      window.google.maps.event.addDomListener(map.getDiv(), 'touchmove', (e) => {
        if (!isDrawing || !e.touches || e.touches.length !== 1) return;

        e.preventDefault();
        e.stopPropagation();
        const touch = e.touches[0];
        const rect = map.getDiv().getBoundingClientRect();
        const offsetX = touch.clientX - rect.left;
        const offsetY = touch.clientY - rect.top;

        const bounds = map.getBounds();
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const projection = map.getProjection();

        if (!projection) return;

        const topRight = projection.fromLatLngToPoint(ne);
        const bottomLeft = projection.fromLatLngToPoint(sw);
        const scale = Math.pow(2, map.getZoom());

        const worldPoint = new window.google.maps.Point(
          offsetX / scale + bottomLeft.x,
          offsetY / scale + topRight.y
        );

        const latLng = projection.fromPointToLatLng(worldPoint);

        handleDrawMove({ latLng });
      }),

      window.google.maps.event.addDomListener(map.getDiv(), 'touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDrawEnd();
      })
    ];

    drawingListenersRef.current = listeners;

    // Cleanup on unmount or when disabled
    return () => {
      listeners.forEach(listener => {
        if (listener) window.google.maps.event.removeListener(listener);
      });
      drawingListenersRef.current = [];

      // Re-enable map dragging and reset cursor
      map.setOptions({
        draggable: true,
        draggableCursor: null,
        draggingCursor: null
      });
    };
  }, [map, isEnabled, snapToRoads, mode, segmentIndex, isDrawing]);

  // This component doesn't render anything to the DOM
  return null;
};

export default CustomRouteDrawer;
