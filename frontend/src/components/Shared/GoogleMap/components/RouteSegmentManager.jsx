import { useEffect, useRef, useCallback } from 'react';
import { getTransportationColor, createPolylineOptions, createMarkerContent, clearAdvancedMarker } from '../utils/mapHelpers';
import { TRANSPORT_ICONS } from '../utils/constants';
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

  // Calculate marker scale based on zoom level
  const getMarkerScale = (zoom) => {
    // Base scale at zoom 13
    const baseZoom = 13;
    const maxScale = 1.2;  // Maximum scale at high zoom
    const minScale = 0.5;  // Minimum scale at low zoom
    
    // Scale decreases as you zoom out
    const scaleFactor = Math.pow(2, (zoom - baseZoom) * 0.15);
    return Math.max(minScale, Math.min(maxScale, scaleFactor));
  };

  // Generate a curved arc path for flights
  const generateFlightArc = (origin, destination, numPoints = 100) => {
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

  // Helper function to clear a single segment (route + markers)
  const clearSegment = (segment) => {
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
    
    // Clear markers
    if (segment.markers) {
      if (segment.markers.start) clearAdvancedMarker(segment.markers.start);
      if (segment.markers.end) clearAdvancedMarker(segment.markers.end);
      if (segment.markers.transition) clearAdvancedMarker(segment.markers.transition);
      if (segment.markers.waypoint) clearAdvancedMarker(segment.markers.waypoint);
    }
  };

  // Helper function to clear all segments
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

  // Create a marker
  const createMarker = useCallback((location, icon, color, title, zIndex = 5000, isBusStop = false) => {
    
    if (!map) {
      return null;
    }
    
    if (!window.google?.maps?.marker?.AdvancedMarkerElement) {
      return null;
    }
    
    const { AdvancedMarkerElement } = window.google.maps.marker;
    const scale = getMarkerScale(currentZoomRef.current);
    const markerContent = createMarkerContent(icon, color, false, null, null, scale);
    
    // Add intelligent offset to avoid Google's transit markers and labels
    let offsetLat = 0.00015; // Default offset
    let offsetLng = 0.00015;
    
    // For bus stops, use a larger offset to avoid route number labels
    if (isBusStop || icon === '🚌') {
      offsetLat = 0.0004; // Larger offset for bus stops
      offsetLng = 0.0002; // Larger horizontal offset
    }
    
    // Vary offset based on marker index to avoid overlapping our own markers
    const markerIndex = title === 'Start' ? 0 : title === 'End' ? 2 : 1;
    offsetLat += markerIndex * 0.00005;
    offsetLng -= markerIndex * 0.00005;
    
    const offsetLocation = {
      lat: location.lat + offsetLat,
      lng: location.lng + offsetLng
    };
    
    const marker = new AdvancedMarkerElement({
      position: offsetLocation,
      map: map,
      title: title,
      content: markerContent,
      zIndex: zIndex,
      collisionBehavior: window.google.maps.CollisionBehavior.REQUIRED_AND_HIDES_OPTIONAL
    });
    
    
    // Store the base icon and color for updates
    marker._icon = icon;
    marker._color = color;
    
    return marker;
  }, [map]);

  // Create a transition marker (two icons)
  const createTransitionMarker = (location, fromIcon, fromColor, toIcon, toColor) => {
    const { AdvancedMarkerElement } = window.google.maps.marker;
    const scale = getMarkerScale(currentZoomRef.current);
    const transitionContent = createMarkerContent(fromIcon, fromColor, true, toIcon, toColor, scale);

    // Add intelligent offset to avoid Google's transit markers and labels
    let offsetLat = 0.0002; // Larger default for transitions
    let offsetLng = 0.0002;

    // If either mode is bus, use larger offset
    if (fromIcon === '🚌' || toIcon === '🚌') {
      offsetLat = 0.0005; // Much larger offset for bus transitions
      offsetLng = 0.0003; // Larger horizontal offset
    }

    const offsetLocation = {
      lat: location.lat + offsetLat,
      lng: location.lng + offsetLng
    };

    const marker = new AdvancedMarkerElement({
      position: offsetLocation,
      map: map,
      title: `Transfer`,
      content: transitionContent,
      zIndex: 5100, // Higher than regular markers
      collisionBehavior: window.google.maps.CollisionBehavior.REQUIRED_AND_HIDES_OPTIONAL
    });

    // Store the icons and colors for updates
    marker._fromIcon = fromIcon;
    marker._fromColor = fromColor;
    marker._toIcon = toIcon;
    marker._toColor = toColor;
    marker._isTransition = true;

    return marker;
  };

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

  // Update all markers with new scale
  const updateMarkersScale = useCallback(() => {
    if (!map) return;
    
    const newZoom = map.getZoom();
    currentZoomRef.current = newZoom;
    const scale = getMarkerScale(newZoom);
    
    segmentsRef.current.forEach(segment => {
      if (segment && segment.markers) {
        // Update start marker
        if (segment.markers.start && segment.markers.start._icon) {
          const newContent = createMarkerContent(
            segment.markers.start._icon,
            segment.markers.start._color,
            false,
            null,
            null,
            scale
          );
          segment.markers.start.content = newContent;
        }
        
        // Update end marker
        if (segment.markers.end && segment.markers.end._icon) {
          const newContent = createMarkerContent(
            segment.markers.end._icon,
            segment.markers.end._color,
            false,
            null,
            null,
            scale
          );
          segment.markers.end.content = newContent;
        }
        
        // Update transition marker
        if (segment.markers.transition && segment.markers.transition._isTransition) {
          const newContent = createMarkerContent(
            segment.markers.transition._fromIcon,
            segment.markers.transition._fromColor,
            true,
            segment.markers.transition._toIcon,
            segment.markers.transition._toColor,
            scale
          );
          segment.markers.transition.content = newContent;
        }
        
        // Update waypoint marker
        if (segment.markers.waypoint && segment.markers.waypoint._icon) {
          const newContent = createMarkerContent(
            segment.markers.waypoint._icon,
            segment.markers.waypoint._color,
            false,
            null,
            null,
            scale
          );
          segment.markers.waypoint.content = newContent;
        }
      }
    });
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
      hasMap: !!map,
      hasDirectionsService: !!directionsService,
      hasDirectionsRoute: !!directionsRoute,
      routeId: directionsRoute?.routeId,
      segments: directionsRoute?.segments
    });

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

    const { allLocations, allModes, singleLocationDrawMode } = directionsRoute;
      allLocations: allLocations.length,
      allModes: allModes.length,
      segments: directionsRoute.segments?.map(s => `[${s.startIndex}→${s.endIndex}] isCustom=${s.isCustom}`),
      singleLocationDrawMode
    });

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
        const startMarker = createMarker(location, icon, color, 'Start', 5000, false);

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
        // Keep the single marker - it will become the start marker of the route
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

            locationsSame,
            modesChanged,
            customStatusChanged
          });

          if (modesChanged || customStatusChanged) {
            // Clear all segments and recalculate with new modes or custom status
            clearAllSegments();
            // Continue to the normal route calculation below
          } else {
            // No changes needed, return early
            return;
          }
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
    
    // Check if we can reuse any existing segments
    let canReuseSegments = false;
    let segmentsToReuse = [];
    
    if (prevRouteRef.current && segmentsRef.current.length > 0) {
      const prevLocations = prevRouteRef.current.locations;
      const prevModes = prevRouteRef.current.modes;
      
      // Check if only modes changed for existing segments
      if (prevLocations && prevModes) {
        canReuseSegments = true;
        
        // Compare each segment to see what changed
        for (let i = 0; i < Math.min(validLocations.length - 1, prevLocations.length - 1); i++) {
          const locationsSame = 
            validLocations[i] && prevLocations[i] &&
            validLocations[i].lat === prevLocations[i].lat &&
            validLocations[i].lng === prevLocations[i].lng &&
            validLocations[i + 1] && prevLocations[i + 1] &&
            validLocations[i + 1].lat === prevLocations[i + 1].lat &&
            validLocations[i + 1].lng === prevLocations[i + 1].lng;
          
          const modeSame = validModes[i] === prevModes[i];
          
          if (locationsSame && modeSame && segmentsRef.current[i]) {
            // This segment is unchanged - reuse it
            segmentsToReuse[i] = segmentsRef.current[i];
          } else {
            // Segment changed - will need to recalculate
            segmentsToReuse[i] = null;
          }
        }
      }
    }
    
    // Store current route for next comparison
    prevRouteRef.current = {
      locations: [...validLocations],
      modes: [...validModes]
    };
    
    if (!canReuseSegments) {
      // Clear ALL existing segments when route changes significantly
      clearAllSegments();
    } else {
      // Only clear segments that changed
      segmentsRef.current.forEach((segment, i) => {
        if (segment && !segmentsToReuse[i]) {
          clearSegment(segment);
        }
      });
    }
    
    // Render immediately for better UX
    const renderSegments = async () => {
        // Check if this is still the current route
        if (currentRouteIdRef.current !== routeId) {
          return;
        }
        
        // Start with reused segments or fresh array
        const newSegments = canReuseSegments ? [...segmentsToReuse] : [];
        
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
          if (!newSegments[i]) {
            // This segment needs to be rendered
            segmentsToRender.push(i);
          }
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

            // If there's an existing non-custom segment at this index, clear it first
            if (segmentsRef.current[i] && !segmentsRef.current[i].isCustom) {
              clearSegment(segmentsRef.current[i]);
            }

            // Custom segment - render markers only (CustomRouteDrawer handles the polyline)
            const markers = {};
            const modeIcon = TRANSPORT_ICONS[segmentMode] || '🚶';
            const modeColor = getTransportationColor(segmentMode);
            const isLastSegment = i === validLocations.length - 2;

            // SIMPLIFIED MARKER LOGIC:
            // - First segment: START marker at origin
            // - All segments: marker at origin (start of this segment)
            // - Last segment: END marker at destination

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
              // Middle segments: check if mode changed from previous
              const prevMode = validModes[i - 1] || 'walk';
              if (prevMode !== segmentMode) {
                // Mode changed - create transition marker
                const prevIcon = TRANSPORT_ICONS[prevMode] || '🚶';
                const prevColor = getTransportationColor(prevMode);
                markers.transition = createTransitionMarker(
                  segmentOrigin,
                  prevIcon,
                  prevColor,
                  modeIcon,
                  modeColor
                );
              } else {
                // Same mode - create regular marker
                markers.start = createMarker(
                  segmentOrigin,
                  modeIcon,
                  modeColor,
                  `Stop ${i + 1}`,
                  5000,
                  false
                );
              }
            }

            // Last segment gets END marker
            if (isLastSegment) {
              markers.end = createMarker(
                segmentDestination,
                modeIcon,
                modeColor,
                'End',
                5001,
                false
              );
            }

            // Create segment object (no polyline, just markers)
            const segment = {
              mode: segmentMode,
              markers: markers,
              startLocation: segmentOrigin,
              endLocation: segmentDestination,
              isCustom: true,
              // Include custom path from directionsRoute for animation
              customPath: directionsRoute?.segments?.[i]?.customPath || null
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
            // Generate curved arc path for flight
            const flightPath = generateFlightArc(segmentOrigin, segmentDestination);
            
            // Create a simple polyline for the flight path
            const flightPolyline = new window.google.maps.Polyline({
              path: flightPath,
              geodesic: false,
              strokeColor: getTransportationColor('flight'),
              strokeOpacity: 1.0,
              strokeWeight: 4,
              map: map,
              zIndex: 1000
            });
            
            // Create markers for flight segment
            const markers = {};
            const modeIcon = TRANSPORT_ICONS['flight'];
            const modeColor = getTransportationColor('flight');
            
            // Add start marker (only for first segment)
            // For non-first segments, don't create markers at the origin
            // because the previous segment's end/transition marker already covers it
            if (i === 0) {
              markers.start = createMarker(
                segmentOrigin,
                modeIcon,
                modeColor,
                'Start',
                5000,
                false
              );
            }
            // Note: For i > 0, we DON'T create a waypoint marker at the origin
            // because the previous segment already created a transition/end marker there
            
            // Add end marker (only for last segment)
            if (i === validLocations.length - 2) {
              markers.end = createMarker(
                segmentDestination,
                modeIcon,
                modeColor,
                'End',
                5001,
                false
              );
            }
            
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
          
          // Create polyline options
          const polylineOptions = createPolylineOptions(segmentMode);
          
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
              // If transit fails, fall back to flight path with train styling
              if (segmentMode === 'transit') {
                // Generate curved arc path like a flight, but keep train colors
                const flightPath = generateFlightArc(segmentOrigin, segmentDestination);

                // Create a polyline with TRAIN colors but FLIGHT path
                const transitPolyline = new window.google.maps.Polyline({
                  path: flightPath,
                  geodesic: false,
                  strokeColor: getTransportationColor('transit'), // Train color
                  strokeOpacity: 1.0,
                  strokeWeight: 4,
                  map: map,
                  zIndex: 1000
                });

                // Create markers with TRAIN icon
                const markers = {};
                const modeIcon = TRANSPORT_ICONS['transit']; // Train emoji
                const modeColor = getTransportationColor('transit');

                // Add markers
                if (i === 0) {
                  markers.start = createMarker(segmentOrigin, modeIcon, modeColor, 'Start', 5000, false);
                } else {
                  markers.waypoint = createMarker(segmentOrigin, modeIcon, modeColor, `Stop ${i}`, 5000, false);
                }

                if (i === validLocations.length - 2) {
                  markers.end = createMarker(segmentDestination, modeIcon, modeColor, 'End', 5001, false);
                }

                // Store the segment with fake route data
                const segment = {
                  id: `segment-${i}`,
                  index: i,
                  mode: 'transit', // Keep as transit for styling
                  startLocation: segmentOrigin,
                  endLocation: segmentDestination,
                  polyline: transitPolyline,
                  markers: markers,
                  route: {
                    routes: [{
                      overview_path: flightPath,
                      legs: [{
                        start_location: segmentOrigin,
                        end_location: segmentDestination,
                        steps: [{ path: flightPath }],
                        distance: { text: `${distance.toFixed(0)} km`, value: distance * 1000 },
                        duration: { text: `${Math.round(distance / 200 * 60)} min`, value: Math.round(distance / 200 * 3600) } // Assume 200km/h train speed
                      }]
                    }]
                  }
                };

                newSegments.push(segment);
                routeFound = true;

                // Dispatch info event
                const infoEvent = new CustomEvent('routeInfo', {
                  detail: {
                    message: 'No rail route found - showing straight line with train styling',
                    type: 'info'
                  }
                });
                window.dispatchEvent(infoEvent);
                continue; // Skip normal route processing
              }
              // If bike mode fails, try walking or driving as fallback
              else if (segmentMode === 'bike') {
                const fallbackMode = distance > 30 ? 'car' : 'walk';
                const cachedFallback = directionsCache.get(segmentOrigin, segmentDestination, fallbackMode);
                if (cachedFallback) {
                  result = cachedFallback;
                  routeFound = true;
                } else {
                  try {
                    // For short distances try walking, for long distances try driving
                    const altRequest = {
                      origin: request.origin,
                      destination: request.destination,
                      travelMode: distance > 30 ? 
                        window.google.maps.TravelMode.DRIVING : 
                        window.google.maps.TravelMode.WALKING
                    };
                    
                    result = await new Promise((resolve, reject) => {
                      directionsService.route(altRequest, (result, status) => {
                        if (status === window.google.maps.DirectionsStatus.OK) {
                          resolve(result);
                        } else {
                          reject(status);
                        }
                      });
                    });
                    
                    routeFound = true;
                    // Cache the fallback result
                    directionsCache.set(segmentOrigin, segmentDestination, fallbackMode, result);
                  } catch (altErr) {
                  }
                }
              } else if (segmentMode === 'walk' && distance > 30) {
                // For long walking routes, try driving
                const cachedFallback = directionsCache.get(segmentOrigin, segmentDestination, 'car');
                if (cachedFallback) {
                  result = cachedFallback;
                  routeFound = true;
                } else {
                  try {
                    const altRequest = {
                      origin: request.origin,
                      destination: request.destination,
                      travelMode: window.google.maps.TravelMode.DRIVING
                    };
                    
                    result = await new Promise((resolve, reject) => {
                      directionsService.route(altRequest, (result, status) => {
                        if (status === window.google.maps.DirectionsStatus.OK) {
                          resolve(result);
                        } else {
                          reject(status);
                        }
                      });
                    });
                    
                    routeFound = true;
                    // Cache the fallback result
                    directionsCache.set(segmentOrigin, segmentDestination, 'car', result);
                  } catch (altErr) {
                  }
                }
              }
            }
            }
            
            if (!routeFound) {
              // Show user-friendly error message
              const origin = validLocations[i];
              const dest = validLocations[i + 1];
              const originName = origin?.name || `Location ${String.fromCharCode(65 + i)}`;
              const destName = dest?.name || `Location ${String.fromCharCode(65 + i + 1)}`;
              
              // Create and dispatch a custom event that the app can listen to
              const errorEvent = new CustomEvent('routeCalculationError', {
                detail: {
                  message: `No ${segmentMode} route available from ${originName} to ${destName}`,
                  mode: segmentMode,
                  origin: originName,
                  destination: destName,
                  shouldClearSecondLocation: true  // Tell the UI to clear the second location
                }
              });
              window.dispatchEvent(errorEvent);
              
              // Clear all routes and markers when a route fails
              clearAllSegments();
              
              // Don't show any markers or process any segments - route calculation failed
              return;
            }
            
            // Check if this is still the current route after async operation
            if (currentRouteIdRef.current !== routeId) {
              return;
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

            // SIMPLIFIED MARKER LOGIC (matches custom segment logic):
            // - First segment: START marker at origin
            // - All segments: marker at origin (start of this segment)
            // - Last segment: END marker at destination

            const isLastSegment = i === validLocations.length - 2;

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
              // Middle segments: check if mode changed from previous
              const prevMode = validModes[i - 1] || 'walk';
              if (prevMode !== segmentMode) {
                // Mode changed - create transition marker at START of this segment
                const prevIcon = TRANSPORT_ICONS[prevMode] || '🚶';
                const prevColor = getTransportationColor(prevMode);
                markers.transition = createTransitionMarker(
                  segmentOrigin,
                  prevIcon,
                  prevColor,
                  modeIcon,
                  modeColor
                );
              } else {
                // Same mode - create regular marker at START of this segment
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

            // Last segment gets END marker
            if (isLastSegment) {
              markers.end = createMarker(
                segmentDestination,
                modeIcon,
                modeColor,
                'End',
                5000,
                segmentMode === 'bus'
              );
            }
            
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
            
            // If still no route, skip this segment
            if (!routeFound) {
              continue;
            }
            
            // Handle transit/bus fallback
            if ((segmentMode === 'bus' || segmentMode === 'transit') && 
                (error === window.google.maps.DirectionsStatus.ZERO_RESULTS || 
                 error === 'TRANSIT_UNAVAILABLE')) {
              
              let fallbackResult;
              
              // Check cache for fallback route first
              const cachedFallback = directionsCache.get(segmentOrigin, segmentDestination, 'car');
              if (cachedFallback) {
                fallbackResult = cachedFallback;
              } else {
                const fallbackRequest = {
                  origin: request.origin,
                  destination: request.destination,
                  travelMode: window.google.maps.TravelMode.DRIVING
                };
                
                try {
                  fallbackResult = await new Promise((resolve, reject) => {
                    directionsService.route(fallbackRequest, (result, status) => {
                      if (status === window.google.maps.DirectionsStatus.OK) {
                        // Cache the successful fallback
                        directionsCache.set(segmentOrigin, segmentDestination, 'car', result);
                        resolve(result);
                      } else {
                      // Even fallback failed, use straight line
                      const straightLineRoute = {
                        routes: [{
                          overview_path: [
                            request.origin,
                            request.destination
                          ],
                          legs: [{
                            start_location: request.origin,
                            end_location: request.destination,
                            steps: [],
                            distance: { text: 'Direct path', value: 0 },
                            duration: { text: '', value: 0 }
                          }],
                          warnings: ['No transit/road found - showing direct path']
                        }]
                      };
                      resolve(straightLineRoute);
                    }
                  });
                });
                } catch (fallbackError) {
                  // Fallback driving route also failed, fallbackResult will be undefined
                }
              }
              
              if (fallbackResult) {
                // Check if this is still the current route after async operation
                if (currentRouteIdRef.current !== routeId) {
                  return;
                }
                
                // Create the route renderer with bus styling but driving route
                const segmentRenderer = new window.google.maps.DirectionsRenderer({
                  suppressMarkers: true,
                  polylineOptions: polylineOptions, // Still use bus colors
                  draggable: false, // Dragging disabled
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
                
                // Add start marker (only for first segment)
                if (i === 0) {
                  markers.start = createMarker(
                    segmentOrigin,
                    modeIcon,
                    modeColor,
                    'Start'
                  );
                }
                
                // Check if this is the last segment
                const isLastSegment = i === validLocations.length - 2;
                
                // Add transition marker if mode changes to next segment
                if (!isLastSegment && i < validModes.length - 1 && validModes[i] !== validModes[i + 1]) {
                  const nextMode = validModes[i + 1];
                  const nextIcon = TRANSPORT_ICONS[nextMode] || '🚶';
                  const nextColor = getTransportationColor(nextMode);
                  
                  markers.transition = createTransitionMarker(
                    segmentDestination,
                    modeIcon,
                    modeColor,
                    nextIcon,
                    nextColor
                  );
                }
                
                // Add end marker for last segment
                if (isLastSegment) {
                  markers.end = createMarker(
                    segmentDestination,
                    modeIcon,
                    modeColor,
                    'End',
                    5000,
                    segmentMode === 'bus'
                  );
                }
                
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
              }
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
    
    // Skip only if we have a real route (2+ locations with calculated segments) 
    // AND the route matches our current locations
    if (directionsRoute && directionsRoute.allLocations && 
        directionsRoute.allLocations.filter(l => l).length >= 2 &&
        validLocations.length >= 2) {
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
