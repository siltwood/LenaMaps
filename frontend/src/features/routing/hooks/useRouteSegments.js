import { useMemo, useCallback } from 'react';

/**
 * useRouteSegments - Manages route segment state and derivations
 *
 * Builds route segments from locations, modes, and custom draw state.
 * Provides UI-friendly derived data and segment building utilities.
 *
 * @param {Array} locations - Array of location objects
 * @param {Array} legModes - Array of transportation modes for each segment
 * @param {Array} customDrawEnabled - Array of booleans for custom draw state
 * @param {Array} lockedSegments - Array of booleans for locked state
 * @returns {Object} Route segment data and utilities
 */
export const useRouteSegments = (locations, legModes, customDrawEnabled, lockedSegments) => {
  // Build route segments from state
  // Draw mode is now simple: customDrawEnabled = straight line between two points
  const routeSegments = useMemo(() => {
    const segments = [];
    for (let i = 0; i < locations.length - 1; i++) {
      // Skip if both locations are null
      if (locations[i] === null && locations[i + 1] === null) {
        continue;
      }
      const seg = {
        id: `seg-${i}`,
        startLocation: locations[i],
        endLocation: locations[i + 1],
        mode: legModes[i] || 'walk',
        // Draw mode = straight line if enabled AND both locations exist
        isCustom: customDrawEnabled[i] === true && locations[i] !== null && locations[i + 1] !== null,
        isLocked: lockedSegments[i] === true
      };
      segments.push(seg);
    }
    return segments;
  }, [locations, legModes, customDrawEnabled, lockedSegments]);

  // DERIVED STATE: Compute UI-friendly data from routeSegments
  // These are the values the UI will use for rendering
  const uiLocations = useMemo(() => {
    if (!routeSegments || routeSegments.length === 0) {
      return [null, null];
    }

    const locs = [];
    routeSegments.forEach((seg, i) => {
      if (!seg) return; // Skip null/undefined segments
      if (i === 0) {
        locs.push(seg.startLocation);
      }
      locs.push(seg.endLocation);
    });

    while (locs.length < 2) {
      locs.push(null);
    }

    return locs;
  }, [routeSegments]);

  const uiModes = useMemo(() => {
    if (!routeSegments || routeSegments.length === 0) {
      // Use legModes directly when no route segments (no locations yet)
      return legModes.length > 0 ? legModes : ['walk'];
    }
    const modes = routeSegments.map(seg => seg?.mode || 'walk');
    return modes;
  }, [routeSegments, legModes]);

  // Build segments for map rendering directly from routeSegments
  // Much simpler than before - just convert our internal structure to map format
  const buildSegments = useCallback((filledLocations) => {
    if (!routeSegments || routeSegments.length === 0) {
      return [];
    }

    const segments = routeSegments.map((seg, i) => {
      if (!seg) return null; // Skip null segments

      const segment = {
        mode: seg.mode || 'walk',
        startIndex: i,
        endIndex: i + 1,
        // Draw mode = straight line (no custom waypoints)
        isCustom: seg.isCustom || false
      };

      return segment;
    }).filter(Boolean); // Remove null segments

    return segments;
  }, [routeSegments]);

  return {
    routeSegments,
    uiLocations,
    uiModes,
    buildSegments
  };
};
