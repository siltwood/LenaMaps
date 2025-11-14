import { useRef, useCallback, useEffect } from 'react';
import { TRANSPORT_ICONS, TRANSPORTATION_COLORS } from '../../../../constants/transportationModes';
import { ANIMATION_PADDING } from '../../../../constants/animationConstants';

/**
 * useRouteAnimation - Manages route animation state and loop
 *
 * Handles path building, polyline creation, and the main animation loop.
 * Extracted from RouteAnimator to reduce component complexity.
 *
 * @param {Object} params - Configuration object
 * @returns {Object} Animation control functions and state
 */
export const useRouteAnimation = ({
  map,
  directionsRoute,
  zoomLevel,
  playbackSpeed,
  isAnimating,
  setIsAnimating,
  isPaused,
  setIsPaused,
  setAnimationProgress,
  setCurrentSegmentMode,
  showModal,
  onAnimationStart,
  getFollowModeZoom,
  zoomLevelRef,
  playbackSpeedRef,
  forceCenterOnNextFrameRef
}) => {
  // Animation refs
  const animationRef = useRef(null);
  const pathRef = useRef(null);
  const segmentPathsRef = useRef(null);
  const isAnimatingRef = useRef(false);
  const isPausedRef = useRef(false);
  const animateRef = useRef(null);
  const polylineRef = useRef(null);
  const offsetRef = useRef(0);
  const countRef = useRef(0);
  const visualOffsetRef = useRef(0);
  const totalDistanceRef = useRef(0);
  const mapRef = useRef(map);

  // Update map ref when prop changes
  if (map) {
    mapRef.current = map;
  }

  /**
   * Get interpolated position along the path based on distance traveled
   */
  const getInterpolatedPosition = useCallback((path, distance) => {
    let accumulatedDistance = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const segmentDistance = window.google.maps.geometry.spherical.computeDistanceBetween(
        path[i],
        path[i + 1]
      );

      if (accumulatedDistance + segmentDistance >= distance) {
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
  }, []);

  /**
   * Build path from route segments
   */
  const buildPathFromRoute = useCallback((allLocations, allModes) => {
    let fullPath = [];
    let segmentInfo = [];

    // Get path from stored route segments
    if (window._routeSegments && window._routeSegments.length > 0) {
      for (let i = 0; i < window._routeSegments.length; i++) {
        const segment = window._routeSegments[i];
        const mode = segment.mode || allModes[i] || 'walk';

        // Handle custom drawn segments
        if (segment.isCustom && segment.customPath) {
          const customPath = segment.customPath.map(p =>
            new window.google.maps.LatLng(p.lat, p.lng)
          );

          // Interpolate between custom points for smooth animation
          const interpolatedCustomPath = [];
          for (let j = 0; j < customPath.length - 1; j++) {
            const start = customPath[j];
            const end = customPath[j + 1];
            const distance = window.google.maps.geometry.spherical.computeDistanceBetween(start, end);
            const steps = Math.min(100, Math.max(10, Math.floor(distance / 1000)));

            interpolatedCustomPath.push(start);

            for (let k = 1; k < steps; k++) {
              const fraction = k / steps;
              interpolatedCustomPath.push(
                window.google.maps.geometry.spherical.interpolate(start, end, fraction)
              );
            }
          }
          interpolatedCustomPath.push(customPath[customPath.length - 1]);

          const segmentStartIndex = fullPath.length;
          fullPath = fullPath.concat(interpolatedCustomPath);

          segmentInfo.push({
            startIndex: segmentStartIndex,
            endIndex: fullPath.length - 1,
            mode: mode,
            locationIndex: i,
            isCustom: true
          });
        } else if (segment.route && segment.route.routes && segment.route.routes[0]) {
          // Use the EXACT path from overview_path
          const route = segment.route.routes[0];
          let segmentPath = route.overview_path || [];

          const segmentStartIndex = fullPath.length;
          fullPath = fullPath.concat(segmentPath);

          segmentInfo.push({
            startIndex: segmentStartIndex,
            endIndex: fullPath.length - 1,
            mode: mode,
            locationIndex: i
          });
        }
      }
    }

    // Fallback: create straight lines if no path
    if (fullPath.length === 0 && allLocations.length >= 2) {
      for (let i = 0; i < allLocations.length - 1; i++) {
        const start = new window.google.maps.LatLng(allLocations[i].lat, allLocations[i].lng);
        const end = new window.google.maps.LatLng(allLocations[i + 1].lat, allLocations[i + 1].lng);
        const mode = allModes[i] || 'walk';

        const interpolatedPath = [];
        const distance = window.google.maps.geometry.spherical.computeDistanceBetween(start, end);
        const steps = Math.min(100, Math.max(10, Math.floor(distance / 1000)));

        for (let j = 0; j <= steps; j++) {
          const fraction = j / steps;
          interpolatedPath.push(window.google.maps.geometry.spherical.interpolate(start, end, fraction));
        }

        const segmentStartIndex = fullPath.length;
        fullPath = fullPath.concat(interpolatedPath);

        segmentInfo.push({
          startIndex: segmentStartIndex,
          endIndex: fullPath.length - 1,
          mode: mode,
          locationIndex: i
        });
      }
    }

    return { fullPath, segmentInfo };
  }, []);

  /**
   * Optimize path for performance
   */
  const optimizePath = useCallback((fullPath, segmentInfo) => {
    // Calculate total distance
    let routeDistance = 0;
    for (let i = 0; i < fullPath.length - 1; i++) {
      routeDistance += window.google.maps.geometry.spherical.computeDistanceBetween(
        fullPath[i],
        fullPath[i + 1]
      );
    }
    const routeDistanceKm = routeDistance / 1000;

    let densifiedPath;

    // For very long routes, sample points to avoid performance issues
    if (fullPath.length > 10000) {
      densifiedPath = [];
      const sampleRate = Math.ceil(fullPath.length / 5000);
      for (let i = 0; i < fullPath.length; i += sampleRate) {
        densifiedPath.push(fullPath[i]);
      }
      if (densifiedPath[densifiedPath.length - 1] !== fullPath[fullPath.length - 1]) {
        densifiedPath.push(fullPath[fullPath.length - 1]);
      }
    } else if (routeDistanceKm > 100) {
      densifiedPath = fullPath;
    } else {
      // For short routes, add minimal smoothing
      densifiedPath = [];
      for (let i = 0; i < fullPath.length - 1; i++) {
        densifiedPath.push(fullPath[i]);

        const segmentDistance = window.google.maps.geometry.spherical.computeDistanceBetween(
          fullPath[i],
          fullPath[i + 1]
        );

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

    // Update segment info indices if densification occurred
    const densifiedSegmentInfo = [];

    if (densifiedPath === fullPath) {
      densifiedSegmentInfo.push(...segmentInfo);
    } else {
      let densifiedIndex = 0;

      for (const segment of segmentInfo) {
        const startIdx = densifiedIndex;

        const fullPathIdx = fullPath.indexOf(densifiedPath[densifiedIndex]);
        if (fullPathIdx !== -1) {
          while (densifiedIndex < densifiedPath.length &&
                 fullPath.indexOf(densifiedPath[densifiedIndex]) <= segment.endIndex - 1) {
            densifiedIndex++;
          }
        } else {
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

    return { densifiedPath, densifiedSegmentInfo, routeDistanceKm };
  }, []);

  /**
   * Create animated polyline
   */
  const createAnimatedPolyline = useCallback((densifiedPath, allModes) => {
    const lineSymbol = {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 10,
      fillColor: '#000000',
      fillOpacity: 1,
      strokeColor: '#FFFFFF',
      strokeWeight: 3
    };

    const polyline = new window.google.maps.Polyline({
      path: densifiedPath,
      geodesic: false,
      strokeColor: 'transparent',
      strokeOpacity: 0,
      strokeWeight: 20,
      icons: [{
        icon: lineSymbol,
        offset: '0%'
      }],
      map: map,
      clickable: true,
      zIndex: 999999
    });

    // Add click listener to jump to position
    polyline.addListener('click', (e) => {
      if (isPausedRef.current || !isAnimatingRef.current) {
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

        const progress = (closestIndex / (densifiedPath.length - 1)) * 100;
        countRef.current = progress * 2;
        offsetRef.current = progress;
        visualOffsetRef.current = progress;
        setAnimationProgress(progress);

        const icons = polyline.get('icons');
        if (icons && icons.length > 0) {
          const currentIcon = icons[0].icon;
          polyline.set('icons', [{
            icon: currentIcon,
            offset: progress + '%'
          }]);
        }

        map.panTo(e.latLng);

        if (!isAnimatingRef.current) {
          setIsAnimating(true);
          setIsPaused(false);
          isAnimatingRef.current = true;
          isPausedRef.current = false;
          animateAlongRoute(true);
        }
      }
    });

    return polyline;
  }, [map, setAnimationProgress, setIsAnimating, setIsPaused]);

  /**
   * Main animation loop
   */
  const animateAlongRoute = useCallback((isResuming = false) => {
    if (!isResuming) {
      countRef.current = 0;
      visualOffsetRef.current = 0;
      if (animateRef.current) {
        animateRef.current.frameCount = 0;
      }
    }

    // Calculate total route distance
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

      const deltaTime = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      const fixedTimestep = 16.67;

      // Skip frame if deltaTime is too large (tab was in background)
      if (deltaTime > 200) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const clampedDeltaTime = fixedTimestep;

      if (!totalRouteDistance || totalRouteDistance === 0) return;

      // Calculate speed based on route distance and zoom level
      let baseSpeed;
      const routeDistanceKm = totalRouteDistance / 1000;

      if (zoomLevelRef.current === 'whole') {
        // Adaptive base speed for whole route mode
        if (routeDistanceKm > 2000) {
          baseSpeed = 20000;
        } else if (routeDistanceKm > 1000) {
          baseSpeed = 10000;
        } else if (routeDistanceKm > 500) {
          baseSpeed = 5000;
        } else if (routeDistanceKm > 100) {
          baseSpeed = 2000;
        } else if (routeDistanceKm > 50) {
          baseSpeed = 800;
        } else if (routeDistanceKm > 10) {
          baseSpeed = 400;
        } else if (routeDistanceKm > 1) {
          baseSpeed = 100;
        } else {
          baseSpeed = 30;
        }
      } else {
        // Follow marker mode
        if (routeDistanceKm > 1000) {
          baseSpeed = 500;
        } else if (routeDistanceKm > 100) {
          baseSpeed = 200;
        } else if (routeDistanceKm > 10) {
          baseSpeed = 100;
        } else {
          baseSpeed = 60;
        }
      }

      // Apply zoom-based speed adjustment
      const currentZoom = map.getZoom();
      const zoomDiff = 15 - currentZoom;
      let zoomSpeedMultiplier = Math.pow(1.15, zoomDiff);
      zoomSpeedMultiplier = Math.max(0.3, Math.min(5.0, zoomSpeedMultiplier));

      // Apply playback speed multiplier
      let playbackMultiplier = 1;
      if (playbackSpeedRef.current === 'slow') {
        playbackMultiplier = 0.5;
      } else if (playbackSpeedRef.current === 'fast') {
        playbackMultiplier = 2;
      }

      let metersPerSecond = baseSpeed * zoomSpeedMultiplier * playbackMultiplier;

      const metersThisFrame = metersPerSecond * (clampedDeltaTime / 1000);
      const percentageThisFrame = (metersThisFrame / totalRouteDistance) * 100;

      countRef.current = countRef.current + (percentageThisFrame * 2);
      if (countRef.current >= 200) countRef.current = 200;

      const visualUpdateFrequency = 1;

      if (!animateRef.current) animateRef.current = { frameCount: 0 };
      animateRef.current.frameCount++;

      const visualOffset = (countRef.current / 2);

      // Update icon position
      if (animateRef.current.frameCount % visualUpdateFrequency === 0 || countRef.current >= 198) {
        const icons = polylineRef.current.get('icons');
        if (icons && icons.length > 0) {
          icons[0].offset = visualOffset + '%';
          polylineRef.current.set('icons', icons);
        }
      }

      visualOffsetRef.current = visualOffset;
      offsetRef.current = countRef.current / 2;
      const newProgress = countRef.current / 2;
      setAnimationProgress(newProgress);

      // Update current segment mode
      if (segmentPathsRef.current && segmentPathsRef.current.length > 0) {
        const path = pathRef.current;
        if (path && path.length > 0) {
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

          const targetDistance = totalDistance * (newProgress / 100);
          let accumulatedDistance = 0;
          let currentPathIndex = 0;

          for (let i = 0; i < distances.length; i++) {
            if (accumulatedDistance + distances[i] >= targetDistance) {
              currentPathIndex = i;
              break;
            }
            accumulatedDistance += distances[i];
          }

          let foundSegment = null;
          for (const seg of segmentPathsRef.current) {
            if (currentPathIndex >= seg.startIndex && currentPathIndex <= seg.endIndex) {
              foundSegment = seg;
              break;
            }
          }

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

      // Camera following for Follow mode
      const path = pathRef.current;
      if (path && path.length > 0) {
        if ((zoomLevelRef.current === 'follow' || forceCenterOnNextFrameRef.current) && mapRef.current && !isPausedRef.current) {
          const shouldForceZoom = forceCenterOnNextFrameRef.current;
          if (forceCenterOnNextFrameRef.current) {
            forceCenterOnNextFrameRef.current = false;
          }

          const symbolProgress = visualOffsetRef.current / 100;

          if (path && path.length > 1) {
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

            const targetDistance = totalDistance * symbolProgress;
            let accumulatedDistance = 0;

            for (let i = 0; i < distances.length; i++) {
              if (accumulatedDistance + distances[i] >= targetDistance) {
                const segmentProgress = (targetDistance - accumulatedDistance) / distances[i];

                const symbolPosition = window.google.maps.geometry.spherical.interpolate(
                  path[i],
                  path[i + 1],
                  segmentProgress
                );

                mapRef.current.setCenter(symbolPosition);

                if (shouldForceZoom) {
                  mapRef.current.setZoom(getFollowModeZoom());
                }

                break;
              }
              accumulatedDistance += distances[i];
            }
          }
        }
      }

      // Check if animation is complete
      if (countRef.current >= 198) {
        stopAnimation();
      } else {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [map, setAnimationProgress, setCurrentSegmentMode, getFollowModeZoom, zoomLevelRef, playbackSpeedRef, forceCenterOnNextFrameRef]);

  /**
   * Start animation
   */
  const startAnimation = useCallback(async (embeddedInModal, onMinimize) => {
    // Button should be disabled if no route, but double-check
    if (!directionsRoute || !directionsRoute.allLocations || directionsRoute.allLocations.length < 2) {
      return;
    }

    // Check if all locations are the same
    const locations = directionsRoute.allLocations.filter(loc => loc !== null);
    if (locations.length >= 2) {
      const firstLoc = locations[0];
      const allSame = locations.every(loc =>
        loc.lat === firstLoc.lat && loc.lng === firstLoc.lng
      );

      if (allSame) {
        return;
      }
    }

    // Check rate limit
    if (onAnimationStart) {
      const canAnimate = await onAnimationStart();
      if (!canAnimate) {
        return;
      }
    }

    setIsAnimating(true);
    setIsPaused(false);
    isAnimatingRef.current = true;
    isPausedRef.current = false;

    // Center on first marker
    if (directionsRoute.allLocations && directionsRoute.allLocations.length > 0) {
      const firstLocation = directionsRoute.allLocations[0];
      if (firstLocation && firstLocation.lat && firstLocation.lng) {
        map.panTo(new window.google.maps.LatLng(firstLocation.lat, firstLocation.lng));
        if (zoomLevel === 'follow') {
          map.setZoom(getFollowModeZoom());
        }
      }
    }

    // Disable map interactions during animation
    map.setOptions({
      draggable: false,
      scrollwheel: false,
      disableDoubleClickZoom: true,
      gestureHandling: 'none'
    });

    const allLocations = directionsRoute.allLocations;
    const allModes = directionsRoute.allModes || [];

    // Clear any existing polyline before creating new one
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    try {
      // Build path from route
      const { fullPath, segmentInfo } = buildPathFromRoute(allLocations, allModes);

      if (fullPath.length === 0) {
        throw new Error('No path generated');
      }

      // Optimize path
      const { densifiedPath, densifiedSegmentInfo, routeDistanceKm } = optimizePath(fullPath, segmentInfo);

      if (!densifiedPath || densifiedPath.length < 2) {
        throw new Error('Invalid path: not enough points for animation');
      }

      pathRef.current = densifiedPath;
      segmentPathsRef.current = densifiedSegmentInfo;

      // Calculate total distance
      let totalDistance = 0;
      for (let i = 0; i < densifiedPath.length - 1; i++) {
        totalDistance += window.google.maps.geometry.spherical.computeDistanceBetween(
          densifiedPath[i],
          densifiedPath[i + 1]
        );
      }

      const totalDistanceKm = totalDistance / 1000;
      totalDistanceRef.current = totalDistanceKm;

      // Create animated polyline
      polylineRef.current = createAnimatedPolyline(densifiedPath, allModes);

      // Store as THE active animated polyline globally (singleton)
      window._activeAnimatedPolyline = polylineRef.current;

      // Set zoom based on selected level
      if (zoomLevel === 'follow') {
        const startPos = densifiedPath[0];
        if (startPos) {
          const lat = typeof startPos.lat === 'function' ? startPos.lat() : startPos.lat;
          const lng = typeof startPos.lng === 'function' ? startPos.lng() : startPos.lng;
          if (lat && lng) {
            map.panTo(new window.google.maps.LatLng(lat, lng));
          }
        }
      } else if (zoomLevel === 'whole') {
        const bounds = new window.google.maps.LatLngBounds();
        densifiedPath.forEach(point => bounds.extend(point));
        const padding = ANIMATION_PADDING.WHOLE_ROUTE;
        map.fitBounds(bounds, padding);
      }

      // Start animation
      setTimeout(() => {
        animateAlongRoute();
        if (embeddedInModal && onMinimize) {
          onMinimize();
        }
      }, 100);

    } catch (error) {
      showModal('Failed to start the animation. Please try again.', 'Animation Error', 'error');
      setIsAnimating(false);
    }
  }, [
    directionsRoute,
    zoomLevel,
    map,
    showModal,
    onAnimationStart,
    setIsAnimating,
    setIsPaused,
    getFollowModeZoom,
    buildPathFromRoute,
    optimizePath,
    createAnimatedPolyline,
    animateAlongRoute
  ]);

  /**
   * Stop animation
   */
  const stopAnimation = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    // Remove polyline from map
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    offsetRef.current = 0;
    countRef.current = 0;
    visualOffsetRef.current = 0;

    isAnimatingRef.current = false;
    isPausedRef.current = false;
    setIsAnimating(false);
    setIsPaused(false);
    setAnimationProgress(0);
    setCurrentSegmentMode(null);

    // Dispatch event to hide AnimatedMarkerBox
    window.dispatchEvent(new CustomEvent('routeAnimationUpdate', {
      detail: {
        isAnimating: false,
        currentModeIcon: null
      }
    }));

    // Re-enable map interactions
    if (map) {
      map.setOptions({
        draggable: true,
        scrollwheel: true,
        disableDoubleClickZoom: false,
        gestureHandling: 'auto'
      });
    }
  }, [map, setIsAnimating, setIsPaused]);

  /**
   * Pause animation
   */
  const pauseAnimation = useCallback(() => {
    setIsPaused(true);
    isPausedRef.current = true;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, [setIsPaused]);

  /**
   * Resume animation
   */
  const resumeAnimation = useCallback(() => {
    setIsPaused(false);
    isPausedRef.current = false;
    animateAlongRoute(true);
  }, [setIsPaused, animateAlongRoute]);

  /**
   * Handle timeline scrub
   */
  const handleTimelineChange = useCallback((newProgress) => {
    // Update refs
    countRef.current = newProgress * 2;
    offsetRef.current = newProgress;
    visualOffsetRef.current = newProgress;

    // Update visual position immediately
    if (polylineRef.current) {
      const icons = polylineRef.current.get('icons');
      if (icons && icons.length > 0) {
        icons[0].offset = newProgress + '%';
        polylineRef.current.set('icons', icons);
      }

      // In Follow mode, center camera on new position
      if (zoomLevelRef.current === 'follow' && pathRef.current && pathRef.current.length > 0) {
        const path = pathRef.current;

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

        const targetDistance = totalDistance * (newProgress / 100);
        let accumulatedDistance = 0;

        for (let i = 0; i < distances.length; i++) {
          if (accumulatedDistance + distances[i] >= targetDistance) {
            const segmentProgress = (targetDistance - accumulatedDistance) / distances[i];

            const symbolPosition = window.google.maps.geometry.spherical.interpolate(
              path[i],
              path[i + 1],
              segmentProgress
            );

            map.setCenter(symbolPosition);
            break;
          }
          accumulatedDistance += distances[i];
        }
      } else {
        // In whole route mode, just pan to approximate position
        if (pathRef.current && pathRef.current.length > 0) {
          const path = pathRef.current;
          const index = Math.floor((newProgress / 100) * (path.length - 1));
          if (index < path.length && path[index]) {
            map.panTo(path[index]);
          }
        }
      }
    }

    // Update current segment mode based on scrubber position
    if (segmentPathsRef.current && segmentPathsRef.current.length > 0) {
      const path = pathRef.current;
      if (path && path.length > 0) {
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

        const targetDistance = totalDistance * (newProgress / 100);
        let accumulatedDistance = 0;
        let currentPathIndex = 0;

        for (let i = 0; i < distances.length; i++) {
          if (accumulatedDistance + distances[i] >= targetDistance) {
            currentPathIndex = i;
            break;
          }
          accumulatedDistance += distances[i];
        }

        let foundSegment = null;
        for (const seg of segmentPathsRef.current) {
          if (currentPathIndex >= seg.startIndex && currentPathIndex <= seg.endIndex) {
            foundSegment = seg;
            break;
          }
        }

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

    // Pause if playing
    if (isAnimating && !isPaused) {
      pauseAnimation();
    }
  }, [map, isAnimating, isPaused, pauseAnimation, zoomLevelRef]);

  // Auto-create polyline when route exists (for scrubbing without playing)
  useEffect(() => {
    if (!map || !directionsRoute || isAnimating) return;

    const allLocations = directionsRoute.allLocations;
    const allModes = directionsRoute.allModes || [];

    if (!allLocations || allLocations.length < 2) return;

    // If polyline already exists for this route, don't recreate
    if (polylineRef.current && directionsRoute.routeId === polylineRef.current._routeId) return;

    // Poll for route segments to be ready (they're set by RouteSegmentManager)
    const checkAndCreate = () => {
      if (!window._routeSegments || window._routeSegments.length === 0) {
        return false;
      }

      // Clear old polyline if exists and reset progress
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }

      // CRITICAL: Remove the global active animated polyline (singleton pattern)
      if (window._activeAnimatedPolyline) {
        try {
          window._activeAnimatedPolyline.setMap(null);
        } catch (e) {
          // Already removed
        }
        window._activeAnimatedPolyline = null;
      }

      // Reset progress to 0
      offsetRef.current = 0;
      countRef.current = 0;
      visualOffsetRef.current = 0;
      setAnimationProgress(0);

      try {
      const { fullPath, segmentInfo } = buildPathFromRoute(allLocations, allModes);
      if (fullPath.length === 0) return;

      const { densifiedPath, densifiedSegmentInfo } = optimizePath(fullPath, segmentInfo);
      if (!densifiedPath || densifiedPath.length < 2) return false;

      pathRef.current = densifiedPath;
      segmentPathsRef.current = densifiedSegmentInfo;

      // Calculate total distance
      let totalDistance = 0;
      for (let i = 0; i < densifiedPath.length - 1; i++) {
        totalDistance += window.google.maps.geometry.spherical.computeDistanceBetween(
          densifiedPath[i],
          densifiedPath[i + 1]
        );
      }
      totalDistanceRef.current = totalDistance / 1000;

      // Create polyline and mark with routeId
      polylineRef.current = createAnimatedPolyline(densifiedPath, allModes);
      polylineRef.current._routeId = directionsRoute.routeId;

      // Store as THE active animated polyline globally (singleton)
      window._activeAnimatedPolyline = polylineRef.current;

      return true;
    } catch (e) {
      return false;
    }
    };

    // Try immediately
    if (checkAndCreate()) return;

    // Otherwise poll every 100ms for up to 2 seconds
    let attempts = 0;
    const pollInterval = setInterval(() => {
      attempts++;
      if (checkAndCreate() || attempts >= 20) {
        clearInterval(pollInterval);
      }
    }, 100);

    return () => {
      clearInterval(pollInterval);

      // Dispatch cleanup event to hide mode icon when switching mobile/desktop
      window.dispatchEvent(new CustomEvent('routeAnimationUpdate', {
        detail: {
          isAnimating: false,
          currentModeIcon: null,
          segmentColor: null
        }
      }));

      // DON'T clean up polyline if we're animating - startAnimation owns it now
      // Use ref to get current value (cleanup closure captures old value)
      if (isAnimatingRef.current) {
        return;
      }
      // Clean up polyline when component unmounts or dependencies change (but not during animation)
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        // Only clear global if it's our polyline
        if (window._activeAnimatedPolyline === polylineRef.current) {
          window._activeAnimatedPolyline = null;
        }
        polylineRef.current = null;
      }
    };
  }, [map, directionsRoute, isAnimating, buildPathFromRoute, optimizePath, createAnimatedPolyline]);

  return {
    startAnimation,
    stopAnimation,
    pauseAnimation,
    resumeAnimation,
    handleTimelineChange,
    animationProgress: offsetRef.current,
    totalDistanceRef,
    polylineRef,
    pathRef
  };
};
