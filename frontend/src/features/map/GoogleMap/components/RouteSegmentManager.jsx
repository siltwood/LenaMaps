import { useEffect, useRef, useCallback } from 'react';
import { getTransportationColor, createPolylineOptions, createMarkerContent, clearAdvancedMarker } from '../utils/mapHelpers';
import { TRANSPORT_ICONS } from '../utils/constants';
import {
  getMarkerScale,
  generateFlightArc,
  calculateDistance,
  validateTransitMode,
  validateRouteProximity,
  createStraightLineRoute,
  clearSegment
} from '../utils/segmentUtils';
import directionsCache from '../../../../utils/directionsCache';

const RouteSegmentManager = ({
  map,
  directionsService,
  directionsRoute,
  directionsLocations = [],
  directionsLegModes = [],
  customDrawEnabled = [],
  isMobile = false,
  onModesAutoUpdate = null
}) => {
  const segmentsRef = useRef([]);
  const currentRouteIdRef = useRef(null);
  const cleanupTimeoutRef = useRef(null);
  const zoomListenerRef = useRef(null);
  const currentZoomRef = useRef(13);
  const prevRouteRef = useRef(null); // Store previous route for comparison

  const clearAllSegments = useCallback(() => {
    segmentsRef.current.forEach((segment, index) => {
      if (segment) {
        clearSegment(segment);
      }
    });
    segmentsRef.current = [];
    // Also clear global segments
    window._routeSegments = [];
  }, []);

  // GLOBAL CLEANUP: Force remove ALL markers and polylines from the map
  // This is called on undo to ensure complete cleanup
  const forceCleanupMap = useCallback(() => {
    if (!map) return;


    // Clear all segments first
    clearAllSegments();

    // Nuclear option: Find and remove ALL Google Maps overlays
    // This catches any orphaned markers that React didn't cleanup
    const mapDiv = map.getDiv();
    if (mapDiv) {
      // Google Maps stores markers in internal structures, but we can force remove them
      // by iterating through all map overlays
      try {
        // Clear any remaining polylines
        if (window._customPolylines) {
          window._customPolylines.forEach(polyline => {
            if (polyline) polyline.setMap(null);
          });
          window._customPolylines = [];
        }

        // Clear any remaining markers
        if (window._customMarkers) {
          window._customMarkers.forEach(marker => {
            if (marker) marker.setMap(null);
          });
          window._customMarkers = [];
        }
      } catch (e) {
      }
    }
  }, [map, clearAllSegments]);

  // Expose cleanup function globally so it can be called from undo
  useEffect(() => {
    if (map) {
      window._forceCleanupMap = forceCleanupMap;
    }
    return () => {
      window._forceCleanupMap = null;
    };
  }, [map, forceCleanupMap]);

  // Create a simple circle marker using Polyline symbol (same technique as animated marker)
  const createMarker = useCallback((location, icon, color, title, zIndex = 100, isBusStop = false) => {
    if (!map) {
      return null;
    }

    // Use a polyline with two very close points and a circle symbol
    // This ensures it renders in the same layer as the animated marker
    const circleSymbol = {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: 'transparent',
      strokeWeight: 0
    };

    // Create two points very close together (0.00001 degrees apart)
    const lat = location.lat;
    const lng = location.lng;
    const point1 = new window.google.maps.LatLng(lat, lng);
    const point2 = new window.google.maps.LatLng(lat + 0.00001, lng);

    const marker = new window.google.maps.Polyline({
      path: [point1, point2],
      strokeOpacity: 0,
      icons: [{
        icon: circleSymbol,
        offset: '0%'
      }],
      map: map,
      zIndex: 1, // Low z-index so animated marker (999999) appears above
      clickable: false
    });

    // Store the color for updates
    marker._color = color;
    marker._location = location;

    return marker;
  }, [map]);

  // Create a transition marker (circle with stroke in the next mode's color)
  const createTransitionMarker = (location, fromIcon, fromColor, toIcon, toColor) => {
    // Use a polyline with two very close points and a circle symbol
    // This ensures it renders in the same layer as the animated marker
    const circleSymbol = {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: fromColor,
      fillOpacity: 1,
      strokeColor: toColor,
      strokeWeight: 2
    };

    // Create two points very close together (0.00001 degrees apart)
    const lat = location.lat;
    const lng = location.lng;
    const point1 = new window.google.maps.LatLng(lat, lng);
    const point2 = new window.google.maps.LatLng(lat + 0.00001, lng);

    const marker = new window.google.maps.Polyline({
      path: [point1, point2],
      strokeOpacity: 0,
      icons: [{
        icon: circleSymbol,
        offset: '0%'
      }],
      map: map,
      zIndex: 1, // Low z-index so animated marker (999999) appears above
      clickable: false
    });

    // Store the colors for updates
    marker._fromColor = fromColor;
    marker._toColor = toColor;
    marker._isTransition = true;
    marker._location = location;

    return marker;
  };

  /**
   * Calculate distance between two lat/lng points in meters
   */

  /**
   * CENTRALIZED MARKER PLACEMENT
   * This is the single source of truth for all marker placement logic.
   *
   * Rules:
   * - One marker at the START of each segment (shows current segment's mode)
   * - One marker at the END of the final segment (destination)
   * - Transition markers when mode changes between segments
   * - Markers scale with zoom level
   * - Markers use offsets to avoid overlap
   */
  const placeMarkersForSegments = useCallback((segments, modes) => {
    const markers = {};

    if (!segments || segments.length === 0) return markers;

    // Place markers for each segment
    segments.forEach((segment, i) => {
      const segmentMode = modes[i] || 'walk';
      const modeIcon = TRANSPORT_ICONS[segmentMode] || '🚶';
      const modeColor = getTransportationColor(segmentMode);
      const isLastSegment = i === segments.length - 1;
      const isFirstSegment = i === 0;

      const segmentMarkers = {};

      // RULE 1: First segment gets a START marker
      if (isFirstSegment) {
        segmentMarkers.start = createMarker(
          segment.startLocation,
          modeIcon,
          modeColor,
          'Start',
          5000,
          segmentMode === 'bus'
        );
      }

      // RULE 2: Last segment gets an END marker
      if (isLastSegment) {
        segmentMarkers.end = createMarker(
          segment.endLocation,
          modeIcon,
          modeColor,
          'End',
          5000,
          segmentMode === 'bus'
        );
      }

      // RULE 3: If NOT the last segment, check if mode changes for next segment
      if (!isLastSegment) {
        const nextMode = modes[i + 1] || 'walk';

        if (segmentMode !== nextMode) {
          // Mode changes - create transition marker at segment END
          const nextIcon = TRANSPORT_ICONS[nextMode] || '🚶';
          const nextColor = getTransportationColor(nextMode);

          segmentMarkers.transition = createTransitionMarker(
            segment.endLocation,
            modeIcon,
            modeColor,
            nextIcon,
            nextColor
          );
        } else {
          // Same mode - create regular marker at segment END (which is START of next)
          segmentMarkers.waypoint = createMarker(
            segment.endLocation,
            modeIcon,
            modeColor,
            `Stop ${i + 1}`,
            5000,
            segmentMode === 'bus'
          );
        }
      }

      markers[i] = segmentMarkers;
    });

    return markers;
  }, [createMarker, map]);

  // Update all markers with new scale (no-op for fixed-size circle markers)
  const updateMarkersScale = useCallback(() => {
    // Circle markers are fixed size and don't need to scale with zoom
    if (!map) return;
    const newZoom = map.getZoom();
    currentZoomRef.current = newZoom;
  }, [map]);

  // Function to hide transit labels via DOM manipulation (CSS already injected on mount)
  const hideTransitLabels = () => {
    if (!map) return;
    
    const mapContainer = map.getDiv();
    if (!mapContainer) return;
    
    // Hide any existing transit icons via DOM for browsers that don't support :has()
    const transitIcons = mapContainer.querySelectorAll('img[src*="/transit/"]');
    transitIcons.forEach(icon => {
      icon.style.display = 'none';
      let parent = icon.parentElement;
      if (parent) {
        parent.style.display = 'none';
      }
    });
  };

  // Inject CSS to hide transit labels as early as possible
  useEffect(() => {
    // Add CSS immediately when component mounts (before map is even ready)
    if (!document.getElementById('hide-transit-labels-style')) {
      const style = document.createElement('style');
      style.id = 'hide-transit-labels-style';
      style.textContent = `
        /* Hide all transit icons and their parent containers */
        img[src*="/transit/"] {
          display: none !important;
        }
        /* Hide the parent containers that typically hold transit labels */
        div:has(> img[src*="/transit/"]) {
          display: none !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []); // Run once on mount

  // Set up zoom listener
  useEffect(() => {
    if (!map) return;
    
    // Get initial zoom
    currentZoomRef.current = map.getZoom();
    
    // Listen for zoom changes
    zoomListenerRef.current = map.addListener('zoom_changed', updateMarkersScale);
    
    return () => {
      if (zoomListenerRef.current) {
        window.google.maps.event.removeListener(zoomListenerRef.current);
        zoomListenerRef.current = null;
      }
    };
  }, [map, updateMarkersScale]);

  // Main effect to render route segments with their markers
  useEffect(() => {
    // Clear any pending cleanup
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }

    if (!map || !directionsService) {
      clearAllSegments();
      return;
    }

    // If no directionsRoute, clear all segments (user cleared route or undid to < 2 locations)
    if (!directionsRoute) {
      clearAllSegments();
      return;
    }

    // Handle empty route (used for clearing)
    if (directionsRoute.routeId === 'empty' || !directionsRoute.allLocations || directionsRoute.allLocations.length === 0) {
      clearAllSegments();
      return;
    }

    // Force full rebuild if requested (e.g., during drag-and-drop reorder)
    // This prevents stale segment reuse bugs
    if (directionsRoute.forceRebuild) {
      clearAllSegments();
      // Continue with normal rendering below (don't return)
    }

    const { allLocations, allModes, singleLocationDrawMode } = directionsRoute;

    // Special case: single location in draw mode - just show start marker
    if (singleLocationDrawMode) {
      clearAllSegments();

      // Create just the start marker
      const location = allLocations.find(l => l !== null);
      if (location) {
        const mode = allModes[0] || 'walk';
        const icon = TRANSPORT_ICONS[mode] || TRANSPORT_ICONS.walk;
        const color = getTransportationColor(mode);

        // Use centralized marker creation function
        const startMarker = createMarker(location, icon, color, 'Start', 100, false);

        // Store in segmentsRef as an ARRAY element (not object property!)
        segmentsRef.current = [{
          id: 'single-marker',
          markers: { start: startMarker },
          startLocation: location,
          mode: mode
        }];
      }
      return;
    }
    
    // Additional check: if all locations are null, clear everything
    if (allLocations.every(loc => !loc)) {
      clearAllSegments();
      return;
    }
    
    // Filter out null locations
    const validLocations = allLocations.filter(loc => loc !== null && loc !== undefined);
    // For modes: keep at least 1 mode for single location, or n-1 modes for n locations
    const validModes = allModes.slice(0, Math.max(1, validLocations.length - 1));
    
    // If no valid locations, clear everything
    if (validLocations.length === 0) {
      clearAllSegments();
      return;
    }
    
    // For single location, only clear if we don't already have a single marker
    if (validLocations.length === 1) {
      const alreadyHasSingleMarker = segmentsRef.current.length === 1 &&
                                     segmentsRef.current[0] &&
                                     segmentsRef.current[0].id === 'single-marker';
      if (!alreadyHasSingleMarker) {
        clearAllSegments();
      }
    } else {
      // Special case: transitioning from 1 location to 2 locations
      const wasSingleMarker = segmentsRef.current.length === 1 &&
        segmentsRef.current[0] &&
        segmentsRef.current[0].id === 'single-marker' &&
        validLocations.length === 2;

      if (wasSingleMarker) {
        // DON'T clear - we'll reuse the single marker as segment 0's start marker
        // This prevents flickering when adding the second location
      } else {
        // Check if only modes changed (same locations)
        // Need to check ALL locations, not just start locations
        const prevAllLocations = [];
        segmentsRef.current.forEach((segment, i) => {
          if (segment) {
            if (i === 0 && segment.startLocation) {
              prevAllLocations.push(segment.startLocation);
            }
            if (segment.endLocation) {
              prevAllLocations.push(segment.endLocation);
            }
          }
        });
        const locationsSame = prevAllLocations.length === validLocations.length && 
          JSON.stringify(prevAllLocations) === JSON.stringify(validLocations);
        
        // If only modes changed, we need to recalculate routes
        // because bus/transit routes follow different paths than walking/driving
        if (locationsSame && segmentsRef.current.length > 0) {
          const modesChanged = segmentsRef.current.some((segment, i) => {
            const newMode = validModes[i] || 'walk';
            return segment.mode !== newMode;
          });

          // Check if custom drawing status changed
          const customStatusChanged = segmentsRef.current.some((segment, i) => {
            const newIsCustom = directionsRoute?.segments?.[i]?.isCustom || false;
            const oldIsCustom = segment.isCustom || false;
            return newIsCustom !== oldIsCustom;
          });

          if (modesChanged) {
            // Clear all segments and recalculate with new modes
            clearAllSegments();
            // Continue to the normal route calculation below
          } else if (!customStatusChanged) {
            // No changes needed, return early
            return;
          }
          // If customStatusChanged but !modesChanged, continue to reuse logic below
        } else if (locationsSame) {
          // Same locations and modes, no update needed
          return;
        } else {
          // Locations changed - be selective about what to clear
          // Only clear segments that are beyond the new route length
          const newSegmentCount = Math.max(0, validLocations.length - 1);
          const currentSegmentCount = segmentsRef.current.filter(s => s && s.id !== 'single-marker').length;
          
          if (newSegmentCount < currentSegmentCount) {
            // Route shortened - clear extra segments
            for (let i = currentSegmentCount - 1; i >= newSegmentCount; i--) {
              if (segmentsRef.current[i]) {
                clearSegment(segmentsRef.current[i]);
              }
              segmentsRef.current.splice(i, 1);
            }
          }
          // For route extension, we'll handle it in the rendering section
        }
      }
    }
    
    // Show markers even with just 1 location
    if (!validLocations || validLocations.length < 1) {
      return;
    }
    
    // If only 1 location, just show the marker without a route
    if (validLocations.length === 1) {
      // Check if we already have this exact marker
      const existingMarker = segmentsRef.current.find(s => s.id === 'single-marker');
      if (existingMarker && 
          existingMarker.startLocation.lat === validLocations[0].lat && 
          existingMarker.startLocation.lng === validLocations[0].lng) {
        // Check if mode changed
        const currentMode = validModes[0] || 'walk';
        
        if (existingMarker.mode !== currentMode) {
          // Mode changed, clear the old marker and create new one
          clearSegment(existingMarker);
          segmentsRef.current = [];
        } else {
          // Same marker already exists, don't recreate it
          return;
        }
      }
      
      const location = validLocations[0];
      const mode = validModes[0] || 'walk';
      const modeIcon = TRANSPORT_ICONS[mode] || '🚶';
      const modeColor = getTransportationColor(mode);

      const marker = createMarker(
        location,
        modeIcon,
        modeColor,
        'Start',
        5000,
        mode === 'bus'
      );

      segmentsRef.current = [{
        id: 'single-marker',
        markers: { start: marker },
        startLocation: location,
        mode: mode
      }];
      
      // Don't pan - let user control the viewport
      
      return;
    }

    // Generate a unique ID for this route render
    const routeId = Date.now();
    currentRouteIdRef.current = routeId;

    // Smart segment reuse: Since we removed END markers (which depended on isLastSegment),
    // we can now safely reuse segments without marker duplication bugs.
    // Only clear segments when necessary (modes changed, locations changed, custom status changed).
    // This prevents the map from flickering when adding new locations.
    
    // Render immediately for better UX
    const renderSegments = async () => {
        // Check if this is still the current route
        if (currentRouteIdRef.current !== routeId) {
          return;
        }

        // Start with fresh array
        const newSegments = [];
        
        // Determine which segments need to be rendered
        // Check which segments are in directionsRoute.segments (skip ones that were excluded due to custom drawing)
        const allowedSegmentIndices = new Set();
        if (directionsRoute?.segments) {
          directionsRoute.segments.forEach(seg => {
            allowedSegmentIndices.add(seg.startIndex);
          });
        } else {
          // If no segments specified, allow all
          for (let i = 0; i < validLocations.length - 1; i++) {
            allowedSegmentIndices.add(i);
          }
        }

        const segmentsToRender = [];
        for (let i = 0; i < validLocations.length - 1; i++) {
          // Skip segments not in the allowed list
          if (!allowedSegmentIndices.has(i)) {
            continue;
          }

          // Check if this segment already exists and hasn't changed
          const existingSegment = segmentsRef.current[i];
          const newMode = validModes[i] || 'walk';
          const newIsCustom = directionsRoute?.segments?.find(seg => seg.startIndex === i)?.isCustom || false;

          // Special case: if segment 0 and we have a single-marker, reuse its marker
          if (i === 0 && existingSegment?.id === 'single-marker' &&
              existingSegment.startLocation?.lat === validLocations[i]?.lat &&
              existingSegment.startLocation?.lng === validLocations[i]?.lng &&
              existingSegment.mode === newMode) {
            // We'll reuse the marker but need to create the route
            // Continue to render this segment, but keep the existing marker
          } else if (existingSegment &&
              existingSegment.startLocation?.lat === validLocations[i]?.lat &&
              existingSegment.startLocation?.lng === validLocations[i]?.lng &&
              existingSegment.mode === newMode &&
              (existingSegment.isCustom || false) === newIsCustom &&
              // For regular segments, also check end location
              // For custom segments, skip end location check (drawing changes it)
              (newIsCustom || (
                existingSegment.endLocation?.lat === validLocations[i + 1]?.lat &&
                existingSegment.endLocation?.lng === validLocations[i + 1]?.lng
              ))) {
            // Segment unchanged (core properties) - reuse it
            // For custom segments, the customPoints and endLocation changing doesn't affect the RouteSegmentManager marker
            // CustomRouteDrawer handles point markers separately

            // IMPORTANT: For custom segments, update the straight line path for animation
            if (newIsCustom && validLocations[i] && validLocations[i + 1]) {
              existingSegment.customPath = [validLocations[i], validLocations[i + 1]];
            }

            newSegments[i] = existingSegment;
            continue;
          }

          // Segment needs to be rendered
          segmentsToRender.push(i);
        }
        
        // Track if any modes were auto-changed to flight
        const autoUpdatedModes = [...validModes];
        let modesChanged = false;
        
        // Only render segments that need updating
        for (const i of segmentsToRender) {
          const segmentMode = validModes[i] || 'walk';
          const segmentOrigin = validLocations[i];
          const segmentDestination = validLocations[i + 1];

          // Check if this is a custom segment (skip route calculation, only show markers)
          const isCustomSegment = directionsRoute?.segments?.find(seg => seg.startIndex === i)?.isCustom;

          if (isCustomSegment) {
            // Clear any existing OLD segment at this index before creating new one
            // EXCEPT: Don't clear markers if we can reuse them
            const existingSegment = segmentsRef.current[i];
            const isSingleMarkerToReuse = (i === 0 && existingSegment?.id === 'single-marker');

            // Check if we can reuse the markers even though isCustom changed
            // IMPORTANT: Only reuse if mode AND custom status match
            const canReuseMarkers = existingSegment &&
              existingSegment.startLocation?.lat === segmentOrigin.lat &&
              existingSegment.startLocation?.lng === segmentOrigin.lng &&
              existingSegment.mode === segmentMode &&
              existingSegment.isCustom === true; // Must also be custom

            if (existingSegment && !isSingleMarkerToReuse && !canReuseMarkers) {
              clearSegment(existingSegment);
            } else if (existingSegment && canReuseMarkers) {
              // Only clear the renderer, keep the markers
              if (existingSegment.routeRenderer) {
                if (existingSegment.routeRenderer._hoverPolyline) {
                  existingSegment.routeRenderer._hoverPolyline.setMap(null);
                }
                existingSegment.routeRenderer.setMap(null);
              }
            } else if (isSingleMarkerToReuse) {
            }

            // Custom segment - render markers only (CustomRouteDrawer handles the polyline)
            const markers = {};
            const modeIcon = TRANSPORT_ICONS[segmentMode] || '🚶';
            const modeColor = getTransportationColor(segmentMode);
            const isLastSegment = i === validLocations.length - 2;

            // SIMPLIFIED MARKER LOGIC:
            // - First segment: START marker at origin
            // - All segments: marker at origin (start of this segment)

            // Only create ONE marker at segment START - showing THIS segment's mode
            // Check if we can reuse existing markers
            const existingSingleMarker = (i === 0 && isSingleMarkerToReuse && existingSegment?.markers?.start)
              ? existingSegment.markers.start
              : null;

            const canReuseExistingMarkers = canReuseMarkers && existingSegment?.markers?.start;

            if (i === 0) {
              // First segment gets START marker - reuse if available
              if (existingSingleMarker) {
                markers.start = existingSingleMarker;
              } else if (canReuseExistingMarkers) {
                markers.start = existingSegment.markers.start;
              } else {
                markers.start = createMarker(
                  segmentOrigin,
                  modeIcon,
                  modeColor,
                  'Start',
                  5000,
                  false
                );
              }
            } else {
              // All other segments: marker shows THIS segment's mode (not previous)
              if (canReuseExistingMarkers) {
                markers.start = existingSegment.markers.start;
              } else {
                markers.start = createMarker(
                  segmentOrigin,
                  modeIcon,
                  modeColor,
                  `Stop ${i + 1}`,
                  5000,
                  segmentMode === 'bus'
                );
              }
            }

            // NO END MARKER - markers only at segment START

            // Create segment object (no polyline, just markers)
            const segmentData = directionsRoute?.segments?.find(seg => seg.startIndex === i);
            const segment = {
              mode: segmentMode,
              markers: markers,
              startLocation: segmentOrigin,
              endLocation: segmentDestination,
              isCustom: true,
              // Simple straight line for animation
              customPath: [segmentOrigin, segmentDestination]
            };


            newSegments[i] = segment;
            continue; // Skip route calculation
          }

          // Calculate straight-line distance for smart mode selection
          const R = 6371; // Earth's radius in km
          const lat1 = segmentOrigin.lat * Math.PI / 180;
          const lat2 = segmentDestination.lat * Math.PI / 180;
          const deltaLat = (segmentDestination.lat - segmentOrigin.lat) * Math.PI / 180;
          const deltaLng = (segmentDestination.lng - segmentOrigin.lng) * Math.PI / 180;
          
          const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                    Math.cos(lat1) * Math.cos(lat2) *
                    Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c; // Distance in km
          
          // Removed early detection - let Google Maps API handle route validation
          // This prevents false positives for legitimate routes
          
          // Handle flight mode separately with arc path
          if (segmentMode === 'flight') {
            // Clear any existing segment at this index before creating new one
            const existingSegment = segmentsRef.current[i];
            if (existingSegment) {
              clearSegment(existingSegment);
            }

            // Generate curved arc path for flight
            const flightPath = generateFlightArc(segmentOrigin, segmentDestination);

            // Create a simple polyline for the flight path
            const flightPolyline = new window.google.maps.Polyline({
              path: flightPath,
              geodesic: false,
              strokeColor: getTransportationColor('flight'),
              strokeOpacity: 1.0,
              strokeWeight: 10,
              map: map,
              zIndex: 1000
            });
            
            // Create markers for flight segment
            const markers = {};
            const modeIcon = TRANSPORT_ICONS['flight'];
            const modeColor = getTransportationColor('flight');

            const isLastSegment = i === validLocations.length - 2;

            // Only create ONE marker at segment START - showing THIS segment's mode
            if (i === 0) {
              // First segment gets START marker
              markers.start = createMarker(
                segmentOrigin,
                modeIcon,
                modeColor,
                'Start',
                5000,
                false
              );
            } else {
              // All other segments: marker shows THIS segment's mode
              markers.start = createMarker(
                segmentOrigin,
                modeIcon,
                modeColor,
                `Stop ${i + 1}`,
                5000,
                false
              );
            }

            // NO END MARKER - markers only at segment START
            
            // Don't add transition markers for flights - they're handled by waypoint markers
            
            // Store the flight segment
            const segment = {
              id: `segment-${i}`,
              index: i,
              mode: 'flight',
              startLocation: segmentOrigin,
              endLocation: segmentDestination,
              polyline: flightPolyline,
              markers: markers,
              // Create a fake route object for animation compatibility
              route: {
                routes: [{
                  overview_path: flightPath,
                  legs: [{
                    start_location: segmentOrigin,
                    end_location: segmentDestination,
                    steps: [{
                      path: flightPath
                    }],
                    distance: { text: `${distance.toFixed(0)} km`, value: distance * 1000 },
                    duration: { text: `${Math.round(distance / 800 * 60)} min`, value: Math.round(distance / 800 * 3600) } // Assume 800km/h
                  }]
                }]
              },
              distance: { text: `${distance.toFixed(0)} km`, value: distance * 1000 },
              duration: { text: `${Math.round(distance / 800 * 60)} min`, value: Math.round(distance / 800 * 3600) }
            };
            
            newSegments[i] = segment;
            continue; // Skip the regular routing logic
          }
          
          // Determine travel mode (bus uses DRIVING for reliability)
          let travelMode = window.google.maps.TravelMode.WALKING;
          let actualModeUsed = segmentMode; // Track what we're actually using vs what we display
          
          // For long distances (>30km), secretly use driving mode for walk/bike but keep their colors
          if (distance > 30 && (segmentMode === 'walk' || segmentMode === 'bike')) {
            travelMode = window.google.maps.TravelMode.DRIVING;
            actualModeUsed = 'car'; // Secretly a car ride
          } else {
            switch (segmentMode) {
              case 'bike':
                travelMode = window.google.maps.TravelMode.BICYCLING;
                break;
              case 'car':
                travelMode = window.google.maps.TravelMode.DRIVING;
                break;
              case 'bus': // Bus is always secretly a car
                travelMode = window.google.maps.TravelMode.DRIVING;
                actualModeUsed = 'car';
                break;
              case 'transit': // Use Google's TRANSIT mode for real public transit
                travelMode = window.google.maps.TravelMode.TRANSIT;
                break;
              case 'train': // Rail-based transit only (no ferries or buses)
                travelMode = window.google.maps.TravelMode.TRANSIT;
                break;
              case 'ferry': // Use TRANSIT mode with ferry preference
                travelMode = window.google.maps.TravelMode.TRANSIT;
                break;
              case 'walk':
              default:
                travelMode = window.google.maps.TravelMode.WALKING;
                break;
            }
          }
          
          // Validate locations before making request
          if (!segmentOrigin || !segmentDestination || 
              segmentOrigin.lat == null || segmentOrigin.lng == null ||
              segmentDestination.lat == null || segmentDestination.lng == null) {
            // Invalid segment locations, skip this segment
            continue;
          }
          
          const request = {
            origin: new window.google.maps.LatLng(segmentOrigin.lat, segmentOrigin.lng),
            destination: new window.google.maps.LatLng(segmentDestination.lat, segmentDestination.lng),
            travelMode: travelMode
          };
          
          // Add transit preferences - only rail-based transit (no buses)
          if (segmentMode === 'transit') {
            request.transitOptions = {
              modes: [
                window.google.maps.TransitMode.RAIL,    // All rail
                window.google.maps.TransitMode.SUBWAY,  // Subway
                window.google.maps.TransitMode.TRAIN,   // Inter-city trains
                window.google.maps.TransitMode.TRAM     // Light rail/tram
              ],
              routingPreference: 'FEWER_TRANSFERS'  // Minimize transfers for better experience
            };
          }

          // Add train preferences - STRICTLY rail-based only (no ferries, no buses)
          if (segmentMode === 'train') {
            request.transitOptions = {
              modes: [
                window.google.maps.TransitMode.RAIL,    // All rail
                window.google.maps.TransitMode.SUBWAY,  // Subway
                window.google.maps.TransitMode.TRAIN,   // Inter-city trains
                window.google.maps.TransitMode.TRAM     // Light rail/tram
              ],
              routingPreference: 'FEWER_TRANSFERS'  // Minimize transfers for better experience
            };
          }

          // Add ferry preferences - ferry is NOT a separate transit mode in Google Maps API
          // Ferry routes are part of general TRANSIT, so we just use TRANSIT mode for ferries
          // Google will include ferries in transit results automatically
          if (segmentMode === 'ferry') {
            // Don't set transitOptions - let it use default TRANSIT which includes ferries
            // We'll style it with wave pattern regardless
          }
          
          // Create polyline options (will be updated later if ferry fallback)
          let polylineOptions = createPolylineOptions(segmentMode);
          
          let result;
          let routeFound = false;
          
          try {

            // Check cache first
            const cachedResult = directionsCache.get(segmentOrigin, segmentDestination, actualModeUsed);
            if (cachedResult) {
              result = cachedResult;
              routeFound = true;
            } else {
              // First try the requested mode
              try {
                result = await new Promise((resolve, reject) => {
                  // Extra safety check for travelMode
                  if (!request || !request.travelMode) {
                    reject('Invalid request: missing travelMode');
                    return;
                  }

                  directionsService.route(request, (result, status) => {
                    if (status === window.google.maps.DirectionsStatus.OK) {
                      resolve(result);
                    } else {
                      reject(status);
                    }
                  });
                });

                routeFound = true;
                // Cache the successful result
                directionsCache.set(segmentOrigin, segmentDestination, actualModeUsed, result);
            } catch (err) {
              // No mode-specific fallbacks - will use general straight line fallback below
              // (removed all special fallbacks: transit→curved arc, bike→walk/car, walk→car)
            }
            }

            if (!routeFound) {
              // No route found - use straight line fallback for all modes except flight
              if (segmentMode === 'flight') {
                // Flight mode errors (shouldn't happen)
                const origin = validLocations[i];
                const dest = validLocations[i + 1];
                const originName = origin?.name || `Location ${String.fromCharCode(65 + i)}`;
                const destName = dest?.name || `Location ${String.fromCharCode(65 + i + 1)}`;

                const errorEvent = new CustomEvent('routeCalculationError', {
                  detail: {
                    message: `No ${segmentMode} route available from ${originName} to ${destName}`,
                    mode: segmentMode,
                    origin: originName,
                    destination: destName,
                    shouldClearSecondLocation: true
                  }
                });
                window.dispatchEvent(errorEvent);
                clearAllSegments();
                return;
              } else {
                // For all other modes: use straight line fallback
                result = createStraightLineRoute(request.origin, request.destination);
                routeFound = true;
              }
            }

            // Validate route (for all modes except flight)
            if (routeFound && segmentMode !== 'flight') {
              const proximityValid = validateRouteProximity(result, request.origin, request.destination);
              const modeValid = validateTransitMode(result, segmentMode);

              if (!proximityValid || !modeValid) {
                // Route failed validation - use straight line fallback
                result = createStraightLineRoute(request.origin, request.destination);
                // Cache the straight line to avoid repeated API calls for impossible routes
                directionsCache.set(segmentOrigin, segmentDestination, actualModeUsed, result);
              }
            }
            
            // Check if this is still the current route after async operation
            if (currentRouteIdRef.current !== routeId) {
              return;
            }

            // Clear any existing OLD segment at this index before creating new one
            // EXCEPT: Don't clear if it's a single-marker we're about to reuse
            const existingSegment = segmentsRef.current[i];
            const isSingleMarkerToReuse = (i === 0 && existingSegment?.id === 'single-marker');

            if (existingSegment && !isSingleMarkerToReuse) {
              clearSegment(existingSegment);
            } else if (isSingleMarkerToReuse) {
            }

            // Create the route renderer
            const rendererOptions = {
              suppressMarkers: true,
              polylineOptions: polylineOptions,
              draggable: false, // Dragging disabled
              preserveViewport: true,
              suppressInfoWindows: true,
              suppressBicyclingLayer: true
            };

            // For bus routes, suppress transit layer to avoid label conflicts
            if (segmentMode === 'bus') {
              rendererOptions.suppressPolylines = false;
              rendererOptions.markerOptions = {
                visible: false
              };
            }

            // Only create DirectionsRenderer if we have a valid result
            if (!result || !result.routes || !result.routes[0]) {
              throw new Error('Invalid directions result');
            }

            // Hide transit labels once before rendering
            hideTransitLabels();

            const segmentRenderer = new window.google.maps.DirectionsRenderer(rendererOptions);
            segmentRenderer.setMap(map);
            segmentRenderer.setDirections(result);

            // Create markers for this segment
            const markers = {};
            const modeIcon = TRANSPORT_ICONS[segmentMode] || '🚶';
            const modeColor = getTransportationColor(segmentMode);

            // Only create ONE marker at segment START - showing THIS segment's mode
            const isLastSegment = i === validLocations.length - 2;


            // Check if we can reuse an existing single-marker for segment 0
            const existingSingleMarker = (i === 0 && segmentsRef.current[0]?.id === 'single-marker')
              ? segmentsRef.current[0].markers?.start
              : null;

            if (i === 0) {
              // First segment gets START marker
              if (existingSingleMarker) {
                markers.start = existingSingleMarker;
              } else {
                markers.start = createMarker(
                  segmentOrigin,
                  modeIcon,
                  modeColor,
                  'Start',
                  5000,
                  segmentMode === 'bus'
                );
              }
            } else {
              // All other segments: marker shows THIS segment's mode
              markers.start = createMarker(
                segmentOrigin,
                modeIcon,
                modeColor,
                `Stop ${i + 1}`,
                5000,
                segmentMode === 'bus'
              );
            }

            // NO END MARKER - markers only at segment START
            
            // Create hover polyline for better interaction
            const hoverPolyline = new window.google.maps.Polyline({
              path: result.routes[0].overview_path,
              strokeColor: 'transparent',
              strokeOpacity: 0,
              strokeWeight: 20,
              zIndex: 1000,
              map: map
            });
            
            // Add hover listeners
            hoverPolyline.addListener('mouseover', () => {
              segmentRenderer.setOptions({
                polylineOptions: {
                  ...polylineOptions,
                  strokeWeight: 7,
                  strokeOpacity: 1,
                  zIndex: 1001
                }
              });
              map.setOptions({ draggableCursor: 'grab' });
            });
            
            hoverPolyline.addListener('mouseout', () => {
              segmentRenderer.setOptions({
                polylineOptions: polylineOptions
              });
              map.setOptions({ draggableCursor: null });
            });
            
            // Store reference to hover polyline
            segmentRenderer._hoverPolyline = hoverPolyline;
            
            
            // Store the complete segment WITH THE ROUTE DATA
            const segment = {
              id: `segment-${i}`,
              index: i,
              mode: segmentMode,
              startLocation: segmentOrigin,
              endLocation: segmentDestination,
              routeRenderer: segmentRenderer,
              markers: markers,
              // Store the actual route data for animation
              route: result,
              distance: result.routes[0].legs[0].distance,
              duration: result.routes[0].legs[0].duration
            };
            
            // Insert at the correct index to maintain order
            newSegments[i] = segment;
            
          } catch (error) {
            // If we found a route in try block but got an error during setup,
            // the segment was already stored with markers - don't create duplicates
            if (routeFound) {
              continue;
            }

            // Handle fallback for all modes (except flight) - use straight line
            if (segmentMode !== 'flight') {

              // Use straight line fallback for any routing error
              const fallbackResult = createStraightLineRoute(request.origin, request.destination);

              // Check if this is still the current route after async operation
              if (currentRouteIdRef.current !== routeId) {
                return;
              }

              // Create the route renderer with original mode styling
              const segmentRenderer = new window.google.maps.DirectionsRenderer({
                suppressMarkers: true,
                polylineOptions: polylineOptions, // Use original mode colors
                draggable: false,
                preserveViewport: true,
                suppressInfoWindows: true,
                suppressBicyclingLayer: true
              });

              segmentRenderer.setMap(map);
              segmentRenderer.setDirections(fallbackResult);

              // Create markers for this segment
              const markers = {};
              const modeIcon = TRANSPORT_ICONS[segmentMode] || '🚶';
              const modeColor = getTransportationColor(segmentMode);

              const isLastSegment = i === validLocations.length - 2;

              // Only create ONE marker at segment START - showing THIS segment's mode
              if (i === 0) {
                // First segment gets START marker
                markers.start = createMarker(
                  segmentOrigin,
                  modeIcon,
                  modeColor,
                  'Start',
                  5000,
                  segmentMode === 'bus'
                );
              } else {
                // All other segments: marker shows THIS segment's mode
                markers.start = createMarker(
                  segmentOrigin,
                  modeIcon,
                  modeColor,
                  `Stop ${i + 1}`,
                  5000,
                  segmentMode === 'bus'
                );
              }

              // NO END MARKER - markers only at segment START

              // Store the complete segment WITH ROUTE DATA
              const segment = {
                id: `segment-${i}`,
                index: i,
                mode: segmentMode,
                startLocation: segmentOrigin,
                endLocation: segmentDestination,
                routeRenderer: segmentRenderer,
                markers: markers,
                isFallback: true, // Mark as fallback route
                // Store the actual route data for animation
                route: fallbackResult,
                distance: fallbackResult.routes[0].legs[0].distance,
                duration: fallbackResult.routes[0].legs[0].duration
              };

              // Insert at the correct index to maintain order
              newSegments[i] = segment;
              continue; // Skip to next segment
            }
          }
        }
        
        // Only update if this is still the current route
        if (currentRouteIdRef.current === routeId) {
          segmentsRef.current = newSegments;

          // IMPORTANT: Store segments globally so RouteAnimator can access them
          // This ensures animation follows the EXACT displayed route
          // Include both regular segments (with route) AND custom segments (with customPath)
          window._routeSegments = newSegments.filter(s => s && (s.route || s.isCustom));
          
          // If modes were automatically changed to flight, notify parent
          if (modesChanged && onModesAutoUpdate) {
            onModesAutoUpdate(autoUpdatedModes);
          }
        }
    };
    
    renderSegments();

    
    // Cleanup function
    return () => {
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
        cleanupTimeoutRef.current = null;
      }
    };
  }, [map, directionsRoute, directionsService, clearAllSegments]);

  // Handle showing markers for individual locations (before route is calculated)
  useEffect(() => {
    
    if (!map) {
      return;
    }
    
    if (!directionsLocations) {
      return;
    }
    
    // Filter out null locations FIRST to check if we have any real locations
    const validLocations = directionsLocations.filter(loc => loc !== null);


    // Skip if we have 2+ locations - the main route effect will handle markers
    if (validLocations.length >= 2) {
      return;
    }

    // Show marker for single location (point A)
    if (validLocations.length === 1) {
      const location = validLocations[0];
      const mode = directionsLegModes[0] || 'walk';
      
      // Check if we already have this exact marker
      const existingMarker = segmentsRef.current.find(s => s.id === 'single-marker');
      
      if (existingMarker && 
          existingMarker.startLocation.lat === location.lat && 
          existingMarker.startLocation.lng === location.lng &&
          existingMarker.mode === mode) {
        return; // Same marker already exists
      }
      
      // Clear any existing markers if location or mode changed
      if (existingMarker) {
        clearAllSegments();
      }
      
      const modeIcon = TRANSPORT_ICONS[mode] || '🚶';
      const modeColor = getTransportationColor(mode);


      try {
        const marker = createMarker(
          location,
          modeIcon,
          modeColor,
          'Point A',
          5000,
          mode === 'bus'
        );


        segmentsRef.current = [{
          id: 'single-marker',
          markers: { start: marker },
          startLocation: location,
          mode: mode
        }];

      } catch (error) {
      }
    } else if (validLocations.length === 0) {
      // Clear markers if no locations
      clearAllSegments();
    } else {
    }
    
  }, [map, directionsLocations, directionsLegModes, directionsRoute, createMarker, clearAllSegments]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
      }
      clearAllSegments();
    };
  }, [clearAllSegments]);

  return null;
};

export default RouteSegmentManager;
