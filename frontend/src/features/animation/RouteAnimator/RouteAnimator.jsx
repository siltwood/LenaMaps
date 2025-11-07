import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faPause, faStop } from '@fortawesome/free-solid-svg-icons';
import { TRANSPORT_ICONS, TRANSPORTATION_COLORS } from '../../../constants/transportationModes';
import {
  ANIMATION_ZOOM,
  ANIMATION_PADDING,
  ANIMATION_SPEEDS,
  DISTANCE_THRESHOLDS,
  PLAYBACK_MULTIPLIERS,
  ANIMATION_TIMING,
  MARKER_SCALE
} from '../../../constants/animationConstants';
import DragHandle from '../../../components/common/DragHandle';
import Modal from './Modal';
import PlaybackControls from './components/PlaybackControls';
import SpeedControl from './components/SpeedControl';
import ZoomControl from './components/ZoomControl';
import { useMarkerAnimation } from './hooks/useMarkerAnimation';
import { useZoomManager } from './hooks/useZoomManager';
import { isMobileDevice } from '../../../utils/deviceDetection';
import '../../../styles/unified-icons.css';
import './RouteAnimator.css';

const RouteAnimator = ({ map, directionsRoute, onAnimationStateChange, onAnimationStart, isMobile = false, forceShow = false, onClose, embeddedInModal = false, onMinimize }) => {
  
  // Start expanded on desktop and when forceShow is true on mobile
  const [isMinimized, setIsMinimized] = useState(() => {
    // Desktop starts expanded, mobile with forceShow starts expanded too
    return false; // Always start expanded when shown
  });
  const [isAnimating, setIsAnimatingState] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [modalState, setModalState] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [position, setPosition] = useState(isMobile ? { x: 10, y: 60 } : { x: Math.max(10, window.innerWidth - 480), y: window.innerHeight - 250 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const panelRef = useRef(null);
  
  // Store position before minimizing
  const savedPositionRef = useRef(null);
  const mapRef = useRef(map);
  
  // Update map ref when prop changes
  useEffect(() => {
    mapRef.current = map;
  }, [map]);


  
  // Helper to show modal
  const showModal = (message, title = '', type = 'info') => {
    setModalState({ isOpen: true, title, message, type });
  }
  
  // Wrapper to notify parent when animation state changes
  const setIsAnimating = (value) => {
    setIsAnimatingState(value);
    if (onAnimationStateChange) {
      onAnimationStateChange(value);
    }
  }
  const [zoomLevel, setZoomLevel] = useState('whole'); // 'follow', 'whole'
  const [playbackSpeed, setPlaybackSpeed] = useState('medium'); // 'slow', 'medium', 'fast'
  const [animationProgress, setAnimationProgress] = useState(0); // 0-100 for timeline
  const [currentSegmentMode, setCurrentSegmentMode] = useState(null); // Track current segment mode for animated marker box

  // Refs - declare before hooks that need them
  const animationRef = useRef(null);
  const pathRef = useRef(null);
  const segmentPathsRef = useRef(null);
  const isAnimatingRef = useRef(false);
  const isPausedRef = useRef(false);
  const prevRouteRef = useRef(null);
  const animateRef = useRef(null);
  const distanceTraveledRef = useRef(0);
  const lastTimestampRef = useRef(null);
  const cameraUpdateIntervalRef = useRef(null);
  const polylineRef = useRef(null);
  const offsetRef = useRef(0);
  const lastCameraPositionRef = useRef(null);
  const cameraVelocityRef = useRef(null);
  const lastMapUpdateTimeRef = useRef(0);
  const mapUpdateThrottleMs = 16; // Update roughly at 60fps for smooth following
  const currentZoomRef = useRef(ANIMATION_ZOOM.DEFAULT);
  const lastSymbolUpdateRef = useRef(0);
  const countRef = useRef(0); // Add ref to persist animation count
  const totalDistanceRef = useRef(0); // Store total route distance in km
  const zoomLevelRef = useRef(zoomLevel); // Track zoom level in animation
  const visualOffsetRef = useRef(0); // Track the actual visual position of the icon
  const playbackSpeedRef = useRef(playbackSpeed); // Track playback speed in animation
  const forceCenterOnNextFrameRef = useRef(false); // Force center on next animation frame

  // Use marker animation hook
  const {
    markerRef,
    createMarker,
    updateMarkerScale,
    updateMarkerMode,
    clearMarker
  } = useMarkerAnimation(map, isAnimating);

  // Use zoom manager hook
  const {
    calculateBoundsZoomLevel,
    getFollowModeZoom,
    fitWholeRoute
  } = useZoomManager(
    map,
    directionsRoute,
    isAnimating,
    isMinimized,
    totalDistanceRef,
    zoomLevelRef,
    forceCenterOnNextFrameRef,
    polylineRef
  );

  // Zoom management now handled by useZoomManager hook
  // calculateBoundsZoomLevel, getFollowModeZoom, fitWholeRoute provided by hook
  // Initial route fitting and zoom level changes handled in hook effects

  // Update the ref for animation loop access
  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);
  
  // Update playbackSpeed ref when state changes
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  // markerRef managed by useMarkerAnimation hook
  // getMarkerScale and updateMarkerScale now handled by useMarkerAnimation hook
  // getFollowModeZoom now handled by useZoomManager hook

  // Define stopAnimation early so it can be used in effects
  const stopAnimation = useCallback(() => {
    setIsAnimating(false);
    setIsPaused(false);
    isAnimatingRef.current = false;
    isPausedRef.current = false;
    distanceTraveledRef.current = 0;
    lastTimestampRef.current = null;
    // Position tracking removed - handled by Symbol API
    setAnimationProgress(0); // Reset progress bar
    setCurrentSegmentMode(null); // Reset animated marker box

    // Dispatch event to hide AnimatedMarkerBox
    window.dispatchEvent(new CustomEvent('routeAnimationUpdate', {
      detail: {
        isAnimating: false,
        currentModeIcon: null
      }
    }));

    // Expand the modal when animation stops
    setIsMinimized(false);
    
    // Re-enable map interactions
    if (map) {
      map.setOptions({
        draggable: true,
        scrollwheel: true,
        disableDoubleClickZoom: false,
        gestureHandling: 'auto'
      });
    }
    
    // Clear camera update interval
    if (cameraUpdateIntervalRef.current) {
      clearInterval(cameraUpdateIntervalRef.current);
      cameraUpdateIntervalRef.current = null;
    }

    // Don't remove the polyline - just hide the animated symbol
    if (polylineRef.current) {
      // Reset the symbol to the start position
      const icons = polylineRef.current.get('icons');
      if (icons && icons.length > 0) {
        icons[0].offset = '0%';
        polylineRef.current.set('icons', icons);
      }
      // Hide the polyline that shows the animated symbol
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    // Clear marker using hook
    clearMarker();
    
    offsetRef.current = 0;
    countRef.current = 0; // Reset count when stopping
    visualOffsetRef.current = 0; // Reset visual position
    lastCameraPositionRef.current = null;
    cameraVelocityRef.current = null;
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, [map, setIsAnimating]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);
  
  // Handle escape key to stop animation and unminimize
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isAnimatingRef.current) {
        stopAnimation();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [stopAnimation]);

  // Handle route changes (from undo/redo or other updates)
  useEffect(() => {
    // Check if the route actually changed
    const routeChanged = JSON.stringify(prevRouteRef.current) !== JSON.stringify(directionsRoute);

    if (routeChanged && isAnimating) {
      // Stop current animation when route changes
      stopAnimation();
    }

    // Update the previous route reference
    prevRouteRef.current = directionsRoute;
  }, [directionsRoute, isAnimating, stopAnimation]);

  // Zoom listener setup now handled by useMarkerAnimation hook

  // Clean up animation when component unmounts or is hidden on mobile
  useEffect(() => {
    return () => {
      // When component unmounts, ensure animation is stopped
      if (isAnimatingRef.current) {
        // Clean up animation
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }

        // Clean up polyline
        if (polylineRef.current) {
          polylineRef.current.setMap(null);
          polylineRef.current = null;
        }

        // Marker cleanup now handled by useMarkerAnimation hook

        // Reset state
        isAnimatingRef.current = false;
        isPausedRef.current = false;
      }
    };
  }, []);

  // Densify path by adding intermediate points for smoother animation
  const densifyPath = (originalPath) => {
    const densifiedPath = [];
    
    // Calculate total route distance to determine appropriate segment length
    let totalDistance = 0;
    for (let i = 0; i < originalPath.length - 1; i++) {
      totalDistance += window.google.maps.geometry.spherical.computeDistanceBetween(
        originalPath[i],
        originalPath[i + 1]
      );
    }
    
    // More aggressive optimization for long routes
    const totalDistanceKm = totalDistance / 1000;
    let maxSegmentLength;
    let maxPointsPerSegment;
    
    if (totalDistanceKm > 2000) {
      // Cross-country route (>2000km): Extremely sparse points
      maxSegmentLength = 50000; // 50km segments
      maxPointsPerSegment = 1; // Max 1 intermediate point
    } else if (totalDistanceKm > 1000) {
      // Very long route (>1000km): Very sparse points
      maxSegmentLength = 20000; // 20km segments
      maxPointsPerSegment = 2; // Max 2 intermediate points
    } else if (totalDistanceKm > 100) {
      // Long route (100-1000km): Sparse points
      maxSegmentLength = 5000; // 5km segments  
      maxPointsPerSegment = 3; // Max 3 intermediate points
    } else if (totalDistanceKm > 10) {
      // Medium route (10-100km): Moderate density
      maxSegmentLength = 500; // 500m segments
      maxPointsPerSegment = 10; // Max 10 intermediate points
    } else {
      // Short route (<10km): High density for smooth animation
      maxSegmentLength = 100; // 100m segments
      maxPointsPerSegment = 20; // Max 20 intermediate points
    }
    
    // Much stricter limit for very long routes
    let maxTotalPoints;
    if (totalDistanceKm > 2000) {
      maxTotalPoints = 200; // Only 200 points for cross-country
    } else if (totalDistanceKm > 1000) {
      maxTotalPoints = 500; // 500 points for very long routes
    } else if (totalDistanceKm > 100) {
      maxTotalPoints = 1000; // 1000 points for long routes
    } else {
      maxTotalPoints = Math.min(5000, Math.max(100, totalDistanceKm * 50));
    }
    let currentPointCount = 0;
    
    for (let i = 0; i < originalPath.length - 1; i++) {
      densifiedPath.push(originalPath[i]);
      currentPointCount++;
      
      // Stop adding points if we hit the limit
      if (currentPointCount >= maxTotalPoints) {
        break;
      }
      
      const segmentDistance = window.google.maps.geometry.spherical.computeDistanceBetween(
        originalPath[i],
        originalPath[i + 1]
      );
      
      // If segment is longer than max, add intermediate points
      if (segmentDistance > maxSegmentLength) {
        const numIntermediatePoints = Math.min(maxPointsPerSegment, 
          Math.ceil(segmentDistance / maxSegmentLength));
        
        // Check if adding these points would exceed our limit
        const pointsToAdd = Math.min(numIntermediatePoints, 
          maxTotalPoints - currentPointCount);
        
        for (let j = 1; j <= pointsToAdd; j++) {
          const fraction = j / (numIntermediatePoints + 1);
          const intermediatePoint = window.google.maps.geometry.spherical.interpolate(
            originalPath[i],
            originalPath[i + 1],
            fraction
          );
          densifiedPath.push(intermediatePoint);
          currentPointCount++;
        }
      }
    }
    
    // Add the last point only if we haven't hit the limit
    if (currentPointCount < maxTotalPoints && 
        densifiedPath[densifiedPath.length - 1] !== originalPath[originalPath.length - 1]) {
      densifiedPath.push(originalPath[originalPath.length - 1]);
    }
    
    return densifiedPath;
  }

  // Get the interpolated position along the route
  const getInterpolatedPosition = (path, distance) => {
    let accumulatedDistance = 0;
    
    for (let i = 0; i < path.length - 1; i++) {
      const segmentDistance = window.google.maps.geometry.spherical.computeDistanceBetween(
        path[i], 
        path[i + 1]
      );
      
      if (accumulatedDistance + segmentDistance >= distance) {
        // We're on this segment
        const segmentProgress = (distance - accumulatedDistance) / segmentDistance;
        return window.google.maps.geometry.spherical.interpolate(
          path[i],
          path[i + 1],
          segmentProgress
        );
      }
      
      accumulatedDistance += segmentDistance;
    }
    
    // Return last position if we've exceeded the path
    return path[path.length - 1];
  }

  const startAnimation = async () => {
    if (!directionsRoute || !directionsRoute.allLocations || directionsRoute.allLocations.length < 2) {
      showModal('Please create a route with at least two locations before starting the animation.', 'No Route Available', 'warning');
      return;
    }

    // Check if all locations are the same (no actual route to animate)
    const locations = directionsRoute.allLocations.filter(loc => loc !== null);
    if (locations.length >= 2) {
      const firstLoc = locations[0];
      const allSame = locations.every(loc =>
        loc.lat === firstLoc.lat && loc.lng === firstLoc.lng
      );

      if (allSame) {
        showModal('Cannot animate a route where all locations are the same point.', 'Same Location', 'info');
        return;
      }
    }

    // Check rate limit before starting animation
    if (onAnimationStart) {
      const canAnimate = await onAnimationStart();
      if (!canAnimate) {
        return; // Rate limit exceeded, don't start animation
      }
    }

    setIsAnimating(true);
    setIsPaused(false);
    isAnimatingRef.current = true;
    isPausedRef.current = false;
    
    // Save current position and minimize the panel when animation starts
    savedPositionRef.current = { ...position };
    if (!embeddedInModal) {
      setIsMinimized(true);
    }
    
    // IMPORTANT: Center on first marker immediately when starting animation (especially for mobile)
    if (directionsRoute.allLocations && directionsRoute.allLocations.length > 0) {
      const firstLocation = directionsRoute.allLocations[0];
      if (firstLocation && firstLocation.lat && firstLocation.lng) {
        map.panTo(new window.google.maps.LatLng(firstLocation.lat, firstLocation.lng));
        // Set appropriate zoom level based on mode
        if (zoomLevel === 'follow') {
          map.setZoom(getFollowModeZoom());
        }
        // For whole mode, zoom will be handled by the existing fitBounds logic
      }
    }
    
    // Disable map interactions during animation to prevent user from panning away
    map.setOptions({
      draggable: false,
      scrollwheel: false,
      disableDoubleClickZoom: true,
      gestureHandling: 'none'
    });

    // Use the EXISTING route data from directionsRoute instead of fetching new
    const allLocations = directionsRoute.allLocations;
    const allModes = directionsRoute.allModes || [];
    
    let fullPath = [];
    let segmentInfo = [];
    
    try {
      // IMPORTANT: We need to get the ACTUAL route that's displayed on the map
      // The blue line is drawn by DirectionsRenderer objects that have the route data
      
      // First check if we have stored route segments with actual route data
      if (window._routeSegments && window._routeSegments.length > 0) {
        for (let i = 0; i < window._routeSegments.length; i++) {
          const segment = window._routeSegments[i];
          const mode = segment.mode || allModes[i] || 'walk';

          // Check if this is a custom drawn segment
          if (segment.isCustom && segment.customPath) {
            // Use the custom drawn path from the segment
            const customPath = segment.customPath.map(p =>
              new window.google.maps.LatLng(p.lat, p.lng)
            );

            // Interpolate between custom points for smooth geodesic animation
            const interpolatedCustomPath = [];
            for (let j = 0; j < customPath.length - 1; j++) {
              const start = customPath[j];
              const end = customPath[j + 1];
              const distance = window.google.maps.geometry.spherical.computeDistanceBetween(start, end);
              const steps = Math.min(100, Math.max(10, Math.floor(distance / 1000))); // 1 point per km, max 100

              // Add start point
              interpolatedCustomPath.push(start);

              // Add interpolated points
              for (let k = 1; k < steps; k++) {
                const fraction = k / steps;
                interpolatedCustomPath.push(
                  window.google.maps.geometry.spherical.interpolate(start, end, fraction)
                );
              }
            }
            // Add final point
            interpolatedCustomPath.push(customPath[customPath.length - 1]);

            const segmentStartIndex = fullPath.length;
            fullPath = fullPath.concat(interpolatedCustomPath);

            segmentInfo.push({
              startIndex: segmentStartIndex,
              endIndex: fullPath.length - 1, // -1 because endIndex should be the last valid index, not past it
              mode: mode,
              locationIndex: i,
              isCustom: true
            });
          } else if (segment.route && segment.route.routes && segment.route.routes[0]) {
            const route = segment.route.routes[0];
            let segmentPath = [];

            // Always try to get detailed path first
            if (route.legs) {
              // Get detailed path from steps for accuracy
              route.legs.forEach(leg => {
                if (leg.steps) {
                  leg.steps.forEach(step => {
                    if (step.path) {
                      segmentPath = segmentPath.concat(step.path);
                    } else if (step.lat_lngs) {
                      segmentPath = segmentPath.concat(step.lat_lngs);
                    }
                  });
                }
              });
            }

            // Fallback to overview_path if no steps
            if (segmentPath.length === 0) {
              segmentPath = route.overview_path || [];
            }

            // IMPORTANT: If segment path is too sparse (straight-line fallback), interpolate it
            // This commonly happens with ferry/train routes or when no road route is available
            if (segmentPath.length <= 3) {
              const start = segmentPath[0];
              const end = segmentPath[segmentPath.length - 1];
              const interpolatedPath = [];
              const distance = window.google.maps.geometry.spherical.computeDistanceBetween(start, end);
              // More points for smoother animation
              const steps = Math.min(200, Math.max(20, Math.floor(distance / 500))); // 1 point per 500m, max 200

              for (let j = 0; j <= steps; j++) {
                const fraction = j / steps;
                interpolatedPath.push(window.google.maps.geometry.spherical.interpolate(start, end, fraction));
              }

              segmentPath = interpolatedPath;
            }

            // Store segment info
            const segmentStartIndex = fullPath.length;
            fullPath = fullPath.concat(segmentPath);

            segmentInfo.push({
              startIndex: segmentStartIndex,
              endIndex: fullPath.length - 1, // -1 because endIndex should be the last valid index, not past it
              mode: mode,
              locationIndex: i
            });
          }
        }

      }
      
      // Fallback: If no segments or incomplete path, create simple straight lines
      if (fullPath.length === 0 && allLocations.length >= 2) {
        
        for (let i = 0; i < allLocations.length - 1; i++) {
          const start = new window.google.maps.LatLng(allLocations[i].lat, allLocations[i].lng);
          const end = new window.google.maps.LatLng(allLocations[i + 1].lat, allLocations[i + 1].lng);
          const mode = allModes[i] || 'walk';
          
          // Create interpolated path for smooth animation
          const interpolatedPath = [];
          const distance = window.google.maps.geometry.spherical.computeDistanceBetween(start, end);
          const steps = Math.min(100, Math.max(10, Math.floor(distance / 1000))); // 1 point per km, max 100
          
          for (let j = 0; j <= steps; j++) {
            const fraction = j / steps;
            interpolatedPath.push(window.google.maps.geometry.spherical.interpolate(start, end, fraction));
          }
          
          const segmentStartIndex = fullPath.length;
          fullPath = fullPath.concat(interpolatedPath);

          segmentInfo.push({
            startIndex: segmentStartIndex,
            endIndex: fullPath.length - 1, // -1 because endIndex should be the last valid index, not past it
            mode: mode,
            locationIndex: i
          });
        }
      }

      if (fullPath.length === 0) {
        throw new Error('No path generated');
      }

      // Calculate total distance first
      let routeDistance = 0;
      for (let i = 0; i < fullPath.length - 1; i++) {
        routeDistance += window.google.maps.geometry.spherical.computeDistanceBetween(
          fullPath[i],
          fullPath[i + 1]
        );
      }
      const routeDistanceKm = routeDistance / 1000;
      
      
      // Use full path for accuracy, but optimize densification for performance
      let densifiedPath;
      
      // IMPORTANT: Use exact route from Google Maps when available
      // This ensures the animation follows the actual road path
      if (window._routeSegments && window._routeSegments.length > 0 && fullPath.length > 0) {
        
        // For very long routes, we may need to sample points to avoid performance issues
        if (fullPath.length > 10000) {
          densifiedPath = [];
          const sampleRate = Math.ceil(fullPath.length / 5000); // Keep max 5000 points
          for (let i = 0; i < fullPath.length; i += sampleRate) {
            densifiedPath.push(fullPath[i]);
          }
          // Always include the last point
          if (densifiedPath[densifiedPath.length - 1] !== fullPath[fullPath.length - 1]) {
            densifiedPath.push(fullPath[fullPath.length - 1]);
          }
        } else {
          densifiedPath = fullPath; // Use exact path if not too many points
        }
      } else if (routeDistanceKm > 100) {
        // Long routes without exact path - still use as-is
        densifiedPath = fullPath;
      } else {
        // Only for very short routes (<100km), add minimal smoothing
        densifiedPath = [];
        for (let i = 0; i < fullPath.length - 1; i++) {
          densifiedPath.push(fullPath[i]);
          
          const segmentDistance = window.google.maps.geometry.spherical.computeDistanceBetween(
            fullPath[i],
            fullPath[i + 1]
          );
          
          // Add ONE intermediate point only for gaps 1-3km
          if (segmentDistance > 1000 && segmentDistance < 3000) {
            const midPoint = window.google.maps.geometry.spherical.interpolate(
              fullPath[i],
              fullPath[i + 1],
              0.5
            );
            densifiedPath.push(midPoint);
          }
        }
        densifiedPath.push(fullPath[fullPath.length - 1]);
      }
      
      
      // Validate that we have a valid path
      if (!densifiedPath || densifiedPath.length < 2) {
        throw new Error('Invalid path: not enough points for animation');
      }
      
      // Update segment info indices to match densified path
      const densifiedSegmentInfo = [];

      if (densifiedPath === fullPath) {
        // No densification occurred - use segment info as-is
        densifiedSegmentInfo.push(...segmentInfo);
      } else {
        // Densification occurred - need to map indices
        let densifiedIndex = 0;

        for (const segment of segmentInfo) {
          const startIdx = densifiedIndex;

          // Count how many densified points belong to this segment
          const fullPathIdx = fullPath.indexOf(densifiedPath[densifiedIndex]);
          if (fullPathIdx !== -1) {
            while (densifiedIndex < densifiedPath.length &&
                   fullPath.indexOf(densifiedPath[densifiedIndex]) <= segment.endIndex - 1) {
              densifiedIndex++;
            }
          } else {
            // Fallback: distribute points proportionally
            const segmentFraction = (segment.endIndex - segment.startIndex) / fullPath.length;
            const segmentPoints = Math.max(1, Math.floor(segmentFraction * densifiedPath.length));
            densifiedIndex = Math.min(densifiedPath.length, densifiedIndex + segmentPoints);
          }

          densifiedSegmentInfo.push({
            ...segment,
            startIndex: startIdx,
            endIndex: densifiedIndex
          });
        }
      }
      
      pathRef.current = densifiedPath;
      segmentPathsRef.current = densifiedSegmentInfo;
      
      // Calculate total route distance for speed adjustment
      let totalDistance = 0;
      for (let i = 0; i < densifiedPath.length - 1; i++) {
        totalDistance += window.google.maps.geometry.spherical.computeDistanceBetween(
          densifiedPath[i],
          densifiedPath[i + 1]
        );
      }
      
      // Store total distance for speed calculation
      const totalDistanceKm = totalDistance / 1000;
      totalDistanceRef.current = totalDistanceKm;
      
      // Create polyline with animated symbol
      const initialMode = allModes[0] || 'walk';
      
      // Define larger circular symbols for each mode
      const transportSymbols = {
        walk: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 20,
          fillColor: '#000000',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3
        },
        bike: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 20,
          fillColor: '#000000',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3
        },
        car: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 20,
          fillColor: '#000000',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3
        },
        bus: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 20,
          fillColor: '#000000',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3
        },
        flight: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 20,
          fillColor: '#000000',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3
        }
      };
      
      const initialSymbol = transportSymbols[initialMode] || transportSymbols.walk;
      
      // Create polyline with animated symbol EXACTLY like Google's example
      const lineSymbol = {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#000000',
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 3
      };
      
      polylineRef.current = new window.google.maps.Polyline({
        path: densifiedPath,
        geodesic: false, // Use the exact path points from the directions
        strokeColor: 'transparent', // Make the line itself invisible
        strokeOpacity: 0,
        strokeWeight: 20, // Keep it wide for click detection
        icons: [{
          icon: lineSymbol,
          offset: '0%'
        }],
        map: map,
        clickable: true,
        zIndex: 999999  // Maximum z-index to ensure animation marker appears above everything including draw mode joint markers
      });
      
      // Add click listener to jump to position
      polylineRef.current.addListener('click', (e) => {
        if (isPausedRef.current || !isAnimatingRef.current) {
          // Find closest point on path
          let closestDistance = Infinity;
          let closestIndex = 0;
          
          for (let i = 0; i < densifiedPath.length; i++) {
            const distance = window.google.maps.geometry.spherical.computeDistanceBetween(
              e.latLng,
              densifiedPath[i]
            );
            if (distance < closestDistance) {
              closestDistance = distance;
              closestIndex = i;
            }
          }
          
          // Set animation position to this point
          const progress = (closestIndex / (densifiedPath.length - 1)) * 100;
          countRef.current = progress * 2; // Convert to count (0-200 range)
          offsetRef.current = progress;
          visualOffsetRef.current = progress; // Update visual position immediately
          setAnimationProgress(progress); // Update UI state
          
          // Update visual position immediately - recreate icon to ensure visibility
          const icons = polylineRef.current.get('icons');
          if (icons && icons.length > 0) {
            // Recreate the icon to force visibility
            const currentIcon = icons[0].icon;
            polylineRef.current.set('icons', [{
              icon: currentIcon,
              offset: progress + '%'
            }]);
          }
          
          // Pan to the clicked location
          map.panTo(e.latLng);
          
          // If paused, stay paused but at new position
          // If stopped, start from this position
          if (!isAnimatingRef.current) {
            // Restart animation from this position
            setIsAnimating(true);
            setIsPaused(false);
            isAnimatingRef.current = true;
            isPausedRef.current = false;
            animateAlongRoute(true);
          }
        }
      });
      
      // Set zoom based on selected level
      if (zoomLevel === 'follow') {
        // Start with a smooth pan to the beginning of the route
        const startPos = densifiedPath[0];
        if (startPos) {
          // Handle both LatLng objects and plain objects
          const lat = typeof startPos.lat === 'function' ? startPos.lat() : startPos.lat;
          const lng = typeof startPos.lng === 'function' ? startPos.lng() : startPos.lng;
          if (lat && lng) {
            map.panTo(new window.google.maps.LatLng(lat, lng));
          }
        }
        // Don't auto-zoom - let user control zoom
      } else if (zoomLevel === 'whole') {
        // Fit the entire route in view with extra padding
        const bounds = new window.google.maps.LatLngBounds();
        densifiedPath.forEach(point => bounds.extend(point));
        // Use larger padding to show full route
        const padding = ANIMATION_PADDING.WHOLE_ROUTE;
        map.fitBounds(bounds, padding);
        // Don't pan to start or zoom out further - keep the fitted bounds view
      }
      
      // Clear any existing camera update interval
      if (cameraUpdateIntervalRef.current) {
        clearInterval(cameraUpdateIntervalRef.current);
      }
      
      // Camera centering is handled in the animation loop
      
      // Start animation immediately
      setTimeout(() => {
        animateAlongRoute();
        // Auto-minimize on mobile when animation actually starts
        if (embeddedInModal && onMinimize) {
          onMinimize();
        }
      }, 100);
      
    } catch (error) {
      showModal('Failed to start the animation. Please try again.', 'Animation Error', 'error');
      setIsAnimating(false);
    }
  }

  // Removed auto-start on mobile - let user control it

  // Removed createAnimationMarker - using Symbol Animation API

  const animateAlongRoute = (isResuming = false) => {
    // Don't capture zoom level - use the current state value directly
    // Initialize count only if starting fresh (not resuming from pause)
    if (!isResuming) {
      // Starting fresh - reset to beginning
      countRef.current = 0;
      visualOffsetRef.current = 0; // Initialize visual position to start
      // Reset frame counter for visual updates
      if (animateRef.current) {
        animateRef.current.frameCount = 0;
      }
    }
    // If resuming from pause, countRef.current already has the correct value
    
    // Calculate total route distance ONCE at the start
    let totalRouteDistance = 0;
    if (pathRef.current && pathRef.current.length > 1) {
      for (let i = 0; i < pathRef.current.length - 1; i++) {
        totalRouteDistance += window.google.maps.geometry.spherical.computeDistanceBetween(
          pathRef.current[i],
          pathRef.current[i + 1]
        );
      }
    }
    
    let lastTimestamp = performance.now();
    
    const animate = (timestamp) => {
      if (!isAnimatingRef.current || isPausedRef.current || !polylineRef.current) {
        return;
      }

      // Calculate delta time for frame-independent animation
      const deltaTime = timestamp - lastTimestamp;
      lastTimestamp = timestamp;
      
      // Use a fixed timestep for consistent movement (16.67ms = 60fps)
      // This prevents jitter from variable frame times
      const fixedTimestep = 16.67;
      
      // Skip frame if deltaTime is too large (tab was in background)
      if (deltaTime > 200) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      
      // Use fixed timestep for calculations to ensure smooth movement
      const clampedDeltaTime = fixedTimestep;
      
      // CONSTANT SPEED IN METERS PER SECOND
      // Move at the same speed on the map regardless of trip length
      
      if (!totalRouteDistance || totalRouteDistance === 0) return;
      
      // Set speed in meters per second based on animation speed setting
      let baseSpeed;
      const routeDistanceKm = totalRouteDistance / 1000;
      
      // Check current zoom level for speed calculation
      if (zoomLevelRef.current === 'whole') {
        // Adaptive base speed based on route length ONLY in Whole Route mode
        // Significantly faster speeds for longer trips
        if (routeDistanceKm > 2000) {
          // Cross-continental routes: Very fast animation
          baseSpeed = 20000; // 20km/s for cross-continental routes
        } else if (routeDistanceKm > 1000) {
          // Very long routes: Much faster animation
          baseSpeed = 10000; // 10km/s for cross-country
        } else if (routeDistanceKm > 500) {
          // Long interstate routes: Fast animation
          baseSpeed = 5000; // 5km/s for long routes
        } else if (routeDistanceKm > 100) {
          // Regional routes: Faster animation
          baseSpeed = 2000; // 2km/s for regional routes
        } else if (routeDistanceKm > 50) {
          // Medium routes: Moderate speed
          baseSpeed = 800; // 800m/s for medium routes
        } else if (routeDistanceKm > 10) {
          // Short routes: Moderate speed
          baseSpeed = 400; // 400m/s for short routes
        } else if (routeDistanceKm > 1) {
          // Short routes: Slower for detail
          baseSpeed = 100; // 100m/s for short routes (1-10km)
        } else {
          // Very short routes (< 1km): Much slower for detail (custom draw segments)
          baseSpeed = 30; // 30m/s for very short routes like custom draw
        }
      } else {
        // Follow Marker mode - progressive speed based on route length
        // Even in follow mode, longer trips should be faster
        if (routeDistanceKm > 1000) {
          baseSpeed = 500; // 500m/s for very long routes in follow mode
        } else if (routeDistanceKm > 100) {
          baseSpeed = 200; // 200m/s for long routes in follow mode
        } else if (routeDistanceKm > 10) {
          baseSpeed = 100; // 100m/s for medium routes in follow mode
        } else {
          baseSpeed = 60; // 60m/s for short routes in follow mode
        }
      }
      
      // No more user speed controls - zoom handles everything!
      
      // Apply zoom-based speed adjustment
      // Get current map zoom level (typically 1-20)
      const currentZoom = map.getZoom();
      let zoomSpeedMultiplier;
      
      // Smooth exponential scaling based on zoom
      // At zoom 18: 0.3x speed (very slow for detail)
      // At zoom 15: 1.0x speed (normal)
      // At zoom 10: 3.0x speed (fast for overview)
      // At zoom 5:  8.0x speed (very fast for continent view)
      
      // Use exponential function for smooth scaling
      // Formula: multiplier = base^(15-zoom)/divisor
      const zoomDiff = 15 - currentZoom; // Negative when zoomed in, positive when zoomed out
      zoomSpeedMultiplier = Math.pow(1.15, zoomDiff);
      
      // Clamp to reasonable range
      zoomSpeedMultiplier = Math.max(0.3, Math.min(5.0, zoomSpeedMultiplier));
      
      // Log significant speed changes (optional, remove in production)
      if (Math.abs(zoomDiff) > 3) {
      }
      
      // Apply playback speed multiplier - use ref for real-time updates
      // More aggressive multipliers for better control
      let playbackMultiplier = 1; // Default for medium
      if (playbackSpeedRef.current === 'slow') {
        playbackMultiplier = 0.5; // Half speed for slow
      } else if (playbackSpeedRef.current === 'fast') {
        playbackMultiplier = 2; // Double speed for fast
      }
      // 'medium' uses 1x multiplier (normal speed)
      
      // Apply zoom multiplier and playback speed to base speed
      let metersPerSecond = baseSpeed * zoomSpeedMultiplier * playbackMultiplier;
      
      // Calculate how much of the total route to cover in this frame
      const metersThisFrame = metersPerSecond * (clampedDeltaTime / 1000);
      const percentageThisFrame = (metersThisFrame / totalRouteDistance) * 100;
      
      // Increment position by the calculated percentage
      countRef.current = countRef.current + (percentageThisFrame * 2); // *2 because count is 0-200
      if (countRef.current >= 200) countRef.current = 200;
      
      // Update visual position every frame for smooth movement
      const visualUpdateFrequency = 1; // Always update for smoothness
      
      // Update symbol position (less frequently for long routes)
      // Use frame counter instead of progress for modulo check
      if (!animateRef.current) animateRef.current = { frameCount: 0 };
      animateRef.current.frameCount++;
      
      const visualOffset = (countRef.current / 2);
      
      // Update visual icon position every few frames for performance
      if (animateRef.current.frameCount % visualUpdateFrequency === 0 || countRef.current >= 198) {
        const icons = polylineRef.current.get('icons');
        if (icons && icons.length > 0) {
          icons[0].offset = visualOffset + '%';
          polylineRef.current.set('icons', icons);
        }
      }
      
      // ALWAYS update the visual position ref every frame for accurate camera tracking
      visualOffsetRef.current = visualOffset;
      
      // Track progress and update UI
      offsetRef.current = countRef.current / 2;
      // Always update progress for smooth UI
      const newProgress = countRef.current / 2;
      setAnimationProgress(newProgress);

      // Determine current segment for animated marker box
      // IMPORTANT: Use DISTANCE-based calculation to match the actual marker position
      if (segmentPathsRef.current && segmentPathsRef.current.length > 0) {
        const path = pathRef.current;
        if (path && path.length > 0) {
          // Calculate the actual distance-based position (same method used for marker positioning)
          let totalDistance = 0;
          const distances = [];
          for (let i = 0; i < path.length - 1; i++) {
            const dist = window.google.maps.geometry.spherical.computeDistanceBetween(
              path[i],
              path[i + 1]
            );
            distances.push(dist);
            totalDistance += dist;
          }

          // Find the target distance along the path
          const targetDistance = totalDistance * (newProgress / 100);
          let accumulatedDistance = 0;
          let currentPathIndex = 0;

          // Find which path point index we're at based on distance
          for (let i = 0; i < distances.length; i++) {
            if (accumulatedDistance + distances[i] >= targetDistance) {
              currentPathIndex = i;
              break;
            }
            accumulatedDistance += distances[i];
          }

          // Now find which segment contains this path index
          let foundSegment = null;
          for (const seg of segmentPathsRef.current) {
            // Use <= for endIndex to include the last point
            if (currentPathIndex >= seg.startIndex && currentPathIndex <= seg.endIndex) {
              foundSegment = seg;
              break;
            }
          }

          // Fallback: if no exact match, find the closest segment
          if (!foundSegment && segmentPathsRef.current.length > 0) {
            foundSegment = segmentPathsRef.current.reduce((closest, seg) => {
              const currentDist = Math.min(
                Math.abs(currentPathIndex - seg.startIndex),
                Math.abs(currentPathIndex - seg.endIndex)
              );
              const closestDist = Math.min(
                Math.abs(currentPathIndex - closest.startIndex),
                Math.abs(currentPathIndex - closest.endIndex)
              );
              return currentDist < closestDist ? seg : closest;
            }, segmentPathsRef.current[0]);
          }

          if (foundSegment && foundSegment.mode) {
            const newMode = foundSegment.mode;
            setCurrentSegmentMode(newMode);

            // Dispatch event for AnimatedMarkerBox
            window.dispatchEvent(new CustomEvent('routeAnimationUpdate', {
              detail: {
                isAnimating: true,
                currentModeIcon: TRANSPORT_ICONS[newMode],
                segmentColor: TRANSPORTATION_COLORS[newMode]
              }
            }));
          }
        }
      }

      // Don't update icon properties during animation - it's already black
      // This was causing unnecessary redraws and potential jitter
      
      // Smart camera panning - ALWAYS track the marker
      const path = pathRef.current;
      
      // Safety check - make sure we have a valid path
      if (!path || path.length === 0) {
        // Don't return - continue animation even if camera tracking fails
      } else {
      
      const numPoints = path.length;
      // Use the ACTUAL visual position of the animated marker
      const actualMarkerProgress = visualOffsetRef.current / 100; // This is the real marker position!
      
      // Note: Position calculation is now handled in the camera following section below
      
      // Camera following for Follow mode - only update when actually animating (not paused)
      if ((zoomLevelRef.current === 'follow' || forceCenterOnNextFrameRef.current) && mapRef.current && !isPausedRef.current) {
        // Check if we need to force center and zoom (after mode switch)
        const shouldForceZoom = forceCenterOnNextFrameRef.current;
        if (forceCenterOnNextFrameRef.current) {
          forceCenterOnNextFrameRef.current = false; // Reset flag
        }
        
        // Update camera every frame for smooth following
        // Use the visual offset which tracks the actual symbol position
        const symbolProgress = visualOffsetRef.current / 100; // Convert percentage to decimal
        
        // Calculate position along the path
        if (path && path.length > 1) {
            // Calculate total distance
            let totalDistance = 0;
            const distances = [];
            for (let i = 0; i < path.length - 1; i++) {
              const dist = window.google.maps.geometry.spherical.computeDistanceBetween(
                path[i], 
                path[i + 1]
              );
              distances.push(dist);
              totalDistance += dist;
            }
            
            // Find the target distance along the path
            const targetDistance = totalDistance * symbolProgress;
            let accumulatedDistance = 0;
            
            // Find which segment the symbol is on
            for (let i = 0; i < distances.length; i++) {
              if (accumulatedDistance + distances[i] >= targetDistance) {
                // Symbol is on this segment
                const segmentProgress = (targetDistance - accumulatedDistance) / distances[i];
                
                // Interpolate position on this segment
                const symbolPosition = window.google.maps.geometry.spherical.interpolate(
                  path[i],
                  path[i + 1],
                  segmentProgress
                );
                
                // Use setCenter for immediate update without animation
                // This prevents conflicting animations between panTo and our frame updates
                mapRef.current.setCenter(symbolPosition);
                
                // If we just switched to follow mode, force zoom and center
                if (shouldForceZoom) {
                  // Simply set the zoom level directly
                  mapRef.current.setZoom(getFollowModeZoom());
                }
                
                break;
              }
              accumulatedDistance += distances[i];
            }
          }
      }
      } // Close the else block for path check

      // Check if animation is complete
      if (countRef.current >= 198) {
        // Use stopAnimation to ensure proper cleanup and callback notification
        stopAnimation();
      } else {
        // Continue animation
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    // Start animation
    animationRef.current = requestAnimationFrame(animate);
  }

  const pauseAnimation = () => {
    setIsPaused(true);
    isPausedRef.current = true;
    // Cancel the animation frame when pausing
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }

  const resumeAnimation = () => {
    setIsPaused(false);
    isPausedRef.current = false;
    // Resume the animation from where it left off - countRef already has the position
    animateAlongRoute(true); // Pass true to indicate we're resuming
  }



  // Drag handlers
  const handleMouseDown = (e) => {
    if (e.target.closest('.drag-handle')) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
      e.preventDefault();
    }
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    
    // Keep panel within viewport bounds
    const panel = panelRef.current;
    if (panel) {
      const rect = panel.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add mouse event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Handle window resize to keep modal on screen
  useEffect(() => {
    const handleResize = () => {
      const panel = panelRef.current;
      if (panel && !isMinimized) {
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          const rect = panel.getBoundingClientRect();
          const padding = 10; // Minimum distance from edge
          
          setPosition(prev => {
            let newX = prev.x;
            let newY = prev.y;
            
            // Check right edge
            if (rect.right > window.innerWidth - padding) {
              newX = window.innerWidth - rect.width - padding;
            }
            
            // Check bottom edge
            if (rect.bottom > window.innerHeight - padding) {
              newY = window.innerHeight - rect.height - padding;
            }
            
            // Check left edge
            if (rect.left < padding) {
              newX = padding;
            }
            
            // Check top edge
            if (rect.top < padding) {
              newY = padding;
            }
            
            return { x: newX, y: newY };
          });
        });
      }
    };

    window.addEventListener('resize', handleResize);
    // Initial check
    handleResize();
    
    return () => window.removeEventListener('resize', handleResize);
  }, [isMinimized]);

  // When embedded in modal on mobile, just render the controls
  if (embeddedInModal) {
    return (
      <>
        <div className="mobile-card-header">
          {!isMobile && <DragHandle />}
          <h4>Route Animator</h4>
        </div>
        <div 
          className="mobile-animator-controls"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="controls-section">
            <div className="playback-controls">
              <PlaybackControls
                isAnimating={isAnimating}
                isPaused={isPaused}
                onPlay={startAnimation}
                onPause={pauseAnimation}
                onResume={resumeAnimation}
                onStop={stopAnimation}
                isMobile={true}
              />
            </div>
            
            <div className="mobile-section-label">Speed</div>
            <SpeedControl
              playbackSpeed={playbackSpeed}
              onChange={setPlaybackSpeed}
              isMobile={true}
            />
            
            <div className="mobile-section-label">View</div>
            <ZoomControl
              zoomLevel={zoomLevel}
              onChange={setZoomLevel}
              isAnimating={isAnimating}
              isMobile={true}
            />
            
            <div className="timeline-control">
              <div className="timeline-container">
                <div className="timeline-track">
                  <div 
                    className="timeline-progress" 
                    style={{ 
                      width: `${animationProgress}%`,
                      transition: 'none'
                    }}
                  ></div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={animationProgress}
                  onChange={(e) => {
                    const newProgress = parseFloat(e.target.value);
                    setAnimationProgress(newProgress);
                    
                    // Update animation position
                    countRef.current = newProgress * 2;
                    offsetRef.current = newProgress;
                    visualOffsetRef.current = newProgress; // Critical: update visual offset ref
                    
                    // Update visual position immediately
                    if (polylineRef.current) {
                      // Simply update the icon offset - this works in whole route view
                      const icons = polylineRef.current.get('icons');
                      if (icons && icons.length > 0) {
                        icons[0].offset = newProgress + '%';
                        polylineRef.current.set('icons', icons);
                      }
                      
                      // In Follow mode, center camera on the new symbol position
                      if (zoomLevelRef.current === 'follow' && pathRef.current && pathRef.current.length > 0) {
                        const path = pathRef.current;
                        
                        // Calculate exact position along the path based on progress
                        let totalDistance = 0;
                        const distances = [];
                        
                        // Calculate segment distances
                        for (let i = 0; i < path.length - 1; i++) {
                          const dist = window.google.maps.geometry.spherical.computeDistanceBetween(
                            path[i], 
                            path[i + 1]
                          );
                          distances.push(dist);
                          totalDistance += dist;
                        }
                        
                        // Find the target distance along the path
                        const targetDistance = totalDistance * (newProgress / 100);
                        let accumulatedDistance = 0;
                        
                        // Find which segment we're on and interpolate position
                        for (let i = 0; i < distances.length; i++) {
                          if (accumulatedDistance + distances[i] >= targetDistance) {
                            // We're on this segment
                            const segmentProgress = (targetDistance - accumulatedDistance) / distances[i];
                            
                            // Interpolate position on this segment
                            const symbolPosition = window.google.maps.geometry.spherical.interpolate(
                              path[i],
                              path[i + 1],
                              segmentProgress
                            );
                            
                            // Use setCenter for immediate positioning
                            map.setCenter(symbolPosition);
                            
                            // Don't change zoom - let user control it
                            
                            break;
                          }
                          accumulatedDistance += distances[i];
                        }
                      } else if (zoomLevelRef.current !== 'follow') {
                        // In whole route view, just pan to show the new position
                        if (pathRef.current && pathRef.current.length > 0) {
                          const path = pathRef.current;
                          const index = Math.floor((newProgress / 100) * (path.length - 1));
                          if (index < path.length && path[index]) {
                            map.panTo(path[index]);
                          }
                        }
                      }
                    }
                    
                    // Pause if playing
                    if (isAnimating && !isPaused) {
                      pauseAnimation();
                    }
                  }}
                  className={`timeline-slider ${isMobile ? 'mobile-thumb' : 'no-thumb'}`}
                />
                <div className="timeline-labels">
                  <span>0%</span>
                  <span>{Math.round(animationProgress)}%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Modal
          isOpen={modalState.isOpen}
          onClose={() => setModalState({ ...modalState, isOpen: false })}
          title={modalState.title}
          message={modalState.message}
          type={modalState.type}
        />
      </>
    );
  }
  
  // Render minimized state 
  if (isMinimized) {
    // On mobile, always show camera icon FAB when minimized (ignore forceShow)
    if (isMobile || isMobileDevice()) {
      return (
        <div className="route-animator-minimized mobile">
          <button 
            className="unified-icon animation"
            onClick={() => {
              
              // When showing animation controls on mobile, center on first marker
              if (map && directionsRoute && directionsRoute.allLocations && directionsRoute.allLocations.length > 0) {
                const firstLocation = directionsRoute.allLocations[0];
                
                if (firstLocation && firstLocation.lat && firstLocation.lng) {
                  
                  // Use panTo for smooth positioning
                  const centerPoint = new window.google.maps.LatLng(firstLocation.lat, firstLocation.lng);
                  map.panTo(centerPoint);
                  
                  // Don't auto-zoom - let user control zoom
                }
              }
              
              setIsMinimized(false);
            }}
            title="Show Animation Controls"
            style={{ position: 'fixed', left: '20px', bottom: '20px' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c .55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
          </button>
        </div>
      );
    }
    // Desktop minimized state - keep the same as before
    if (!forceShow) {
      return (
        <div className="route-animator-minimized">
          <button 
            className="unified-icon animation"
            onClick={() => setIsMinimized(false)}
            title="Show Animation Controls"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c .55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
          </button>
        </div>
      );
    }
  }

  return (
    <div
      className="route-animator"
      ref={panelRef}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'auto'
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="route-animator-header">
        {!isMobile && <DragHandle />}
        <h4>Route Animator</h4>
        <div className="header-actions">
          {isMobile && onClose ? (
            <>
              <button className="minimize-button" onClick={() => {
                savedPositionRef.current = { ...position };
                setIsMinimized(true);
              }} title="Minimize">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 9h8v1H4z"/>
                </svg>
              </button>
              <button className="close-button" onClick={() => {
                // Stop animation if running to clean up markers
                if (isAnimating) {
                  stopAnimation();
                }
                onClose();
              }} title="Back to Route">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M15 7H3.83l5.59-5.59L8 0 0 8l8 8 1.41-1.41L3.83 9H15V7z"/>
                </svg>
              </button>
            </>
          ) : (
            <button className="minimize-button" onClick={() => {
              savedPositionRef.current = { ...position };
              setIsMinimized(true);
            }} title="Minimize panel">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 9h8v1H4z"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      
      <div className="route-animator-content">
          <div className="controls-section">
            <div className="playback-controls">
              <PlaybackControls
                isAnimating={isAnimating}
                isPaused={isPaused}
                onPlay={startAnimation}
                onPause={pauseAnimation}
                onResume={resumeAnimation}
                onStop={stopAnimation}
                isMobile={false}
              />
            </div>

            <ZoomControl
              zoomLevel={zoomLevel}
              onChange={setZoomLevel}
              isAnimating={isAnimating}
              isMobile={false}
            />

            <SpeedControl
              playbackSpeed={playbackSpeed}
              onChange={setPlaybackSpeed}
              isMobile={false}
            />
            
            <div className="timeline-control">
              <label>Timeline Scrubber</label>
              <div className="timeline-container">
                <div className="timeline-track">
                  <div 
                    className="timeline-progress" 
                    style={{ 
                      width: `${animationProgress}%`,
                      transition: 'none' // Remove any CSS transitions that might interfere
                    }}
                    key={`progress-${Math.floor(animationProgress)}`} // Force re-render
                  ></div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={animationProgress}
                  onChange={(e) => {
                    const newProgress = parseFloat(e.target.value);
                    setAnimationProgress(newProgress);
                    
                    // Update animation position
                    countRef.current = newProgress * 2;
                    offsetRef.current = newProgress;
                    visualOffsetRef.current = newProgress; // Critical: update visual offset ref
                    
                    // Update visual position immediately
                    if (polylineRef.current) {
                      // Simply update the icon offset - this works in whole route view
                      const icons = polylineRef.current.get('icons');
                      if (icons && icons.length > 0) {
                        icons[0].offset = newProgress + '%';
                        polylineRef.current.set('icons', icons);
                      }
                      
                      // In Follow mode, center camera on the new symbol position
                      if (zoomLevelRef.current === 'follow' && pathRef.current && pathRef.current.length > 0) {
                        const path = pathRef.current;
                        
                        // Calculate exact position along the path based on progress
                        let totalDistance = 0;
                        const distances = [];
                        
                        // Calculate segment distances
                        for (let i = 0; i < path.length - 1; i++) {
                          const dist = window.google.maps.geometry.spherical.computeDistanceBetween(
                            path[i], 
                            path[i + 1]
                          );
                          distances.push(dist);
                          totalDistance += dist;
                        }
                        
                        // Find the target distance along the path
                        const targetDistance = totalDistance * (newProgress / 100);
                        let accumulatedDistance = 0;
                        
                        // Find which segment we're on and interpolate position
                        for (let i = 0; i < distances.length; i++) {
                          if (accumulatedDistance + distances[i] >= targetDistance) {
                            // We're on this segment
                            const segmentProgress = (targetDistance - accumulatedDistance) / distances[i];
                            
                            // Interpolate position on this segment
                            const symbolPosition = window.google.maps.geometry.spherical.interpolate(
                              path[i],
                              path[i + 1],
                              segmentProgress
                            );
                            
                            // Use setCenter for immediate positioning
                            map.setCenter(symbolPosition);
                            
                            // Don't change zoom - let user control it
                            
                            break;
                          }
                          accumulatedDistance += distances[i];
                        }
                      } else if (zoomLevelRef.current !== 'follow') {
                        // In whole route view, just pan to show the new position
                        if (pathRef.current && pathRef.current.length > 0) {
                          const path = pathRef.current;
                          const index = Math.floor((newProgress / 100) * (path.length - 1));
                          if (index < path.length && path[index]) {
                            map.panTo(path[index]);
                          }
                        }
                      }
                    }
                    
                    // Pause if playing
                    if (isAnimating && !isPaused) {
                      pauseAnimation();
                    }
                  }}
                  className="timeline-slider"
                />
                <div className="timeline-labels">
                  <span>0%</span>
                  <span>{Math.round(animationProgress)}%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      
      <Modal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
      />
    </div>
  );
};

export default RouteAnimator;
