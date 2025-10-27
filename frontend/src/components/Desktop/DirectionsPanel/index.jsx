import React, { useState, useEffect, useCallback, useRef } from 'react';
import LocationSearch from '../../Shared/LocationSearch';
import DirectionsHeader from './DirectionsHeader';
import { getLocationLabel } from '../../../utils/routeCalculations';
import TRANSPORTATION_MODES from '../../../constants/transportationModes';
import { generateShareableURL, copyToClipboard } from '../../../utils/shareUtils';
import { saveRoute } from '../../../utils/savedRoutesUtils';
import { SaveRouteModal } from '../../SaveRouteModal';
import { SavedRoutesModal } from '../../SavedRoutesModal';
import CustomRouteDrawer from '../../Shared/GoogleMap/components/CustomRouteDrawer';
import '../../../styles/unified-icons.css';

const DirectionsPanel = ({
  onDirectionsCalculated,
  directionsRoute,
  isOpen,
  onClose,
  clickedLocation,
  onLocationUsed,
  onOriginChange,
  onDestinationChange,
  isEditing = false,
  editingTrip = null,
  map,
  // DEPRECATED PROPS - Will be removed after refactor
  waypoints = [],
  waypointModes = [],
  onWaypointsChange,
  onWaypointModesChange,
  locations: propsLocations = [null, null],
  legModes: propsLegModes = ['walk'],
  onLocationsChange,
  onLegModesChange,
  onUndo,
  onClear,
  onClearHistory,
  canUndo = false,
  lastAction = null
}) => {
  const [transportationModes] = useState(TRANSPORTATION_MODES);
  const [isMinimized, setIsMinimized] = useState(false); // Start open
  const [activeInput, setActiveInput] = useState(null); // Track which input is active
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSavedRoutesModal, setShowSavedRoutesModal] = useState(false);

  // NEW: DirectionsPanel now owns ALL route state internally
  const [locations, setLocations] = useState(propsLocations);
  const [legModes, setLegModes] = useState(propsLegModes);
  const [customDrawEnabled, setCustomDrawEnabled] = useState([]);
  const [snapToRoads, setSnapToRoads] = useState([]);
  const [customPoints, setCustomPoints] = useState({});
  const [lockedSegments, setLockedSegments] = useState([]);

  const prevClickedLocationRef = useRef(null);
  const isEditingRef = useRef(false);
  const lastRouteIdRef = useRef(null);

  // NEW: Undo system that tracks routeSegments snapshots
  const [undoHistory, setUndoHistory] = useState([]);
  const [lastActionType, setLastActionType] = useState(null);
  const lastSaveTimeRef = useRef(0); // Track last save time to prevent spam

  // ============================================================================
  // UNDO SYSTEM - Tracks routeSegments snapshots
  // ============================================================================

  /**
   * Save current state to undo history
   * Called before making any changes to route state
   */
  const saveToUndoHistory = useCallback((actionType) => {
    const now = Date.now();

    // Rate limit: Only save if >500ms since last save
    // This groups cascading state updates from one user action into one snapshot
    if (now - lastSaveTimeRef.current < 500) {
      console.log(`🚫 Rate limiting: Skipping ${actionType} (too soon after last save)`);
      return;
    }

    lastSaveTimeRef.current = now;

    // Deep copy customPoints (object with array values)
    const customPointsCopy = {};
    for (const key in customPoints) {
      customPointsCopy[key] = [...customPoints[key]];
    }

    const snapshot = {
      locations: [...locations],
      legModes: [...legModes],
      customDrawEnabled: [...customDrawEnabled],
      snapToRoads: [...snapToRoads],
      customPoints: customPointsCopy,
      lockedSegments: [...lockedSegments],
      actionType,
      timestamp: now
    };

    setUndoHistory(prev => {
      // Prevent duplicate snapshots - check if the last snapshot is identical
      if (prev.length > 0) {
        const lastSnapshot = prev[prev.length - 1];
        const statesEqual =
          JSON.stringify(lastSnapshot.locations) === JSON.stringify(snapshot.locations) &&
          JSON.stringify(lastSnapshot.legModes) === JSON.stringify(snapshot.legModes) &&
          JSON.stringify(lastSnapshot.customDrawEnabled) === JSON.stringify(snapshot.customDrawEnabled) &&
          JSON.stringify(lastSnapshot.customPoints) === JSON.stringify(snapshot.customPoints);

        if (statesEqual) {
          console.log('🚫 Skipping duplicate undo snapshot');
          return prev; // Don't add duplicate
        }
      }

      const newHistory = [...prev, snapshot];
      console.log(`💾 Saved undo snapshot: ${actionType}, history length: ${newHistory.length}`);
      return newHistory;
    });
    setLastActionType(actionType);
  }, [locations, legModes, customDrawEnabled, snapToRoads, customPoints, lockedSegments]);

  /**
   * Undo last action - restore previous snapshot
   */
  const handleUndo = useCallback(() => {

    if (undoHistory.length === 0) {
      return;
    }

    const previousSnapshot = undoHistory[undoHistory.length - 1];

    // Restore all state from snapshot
    // Note: No force cleanup needed - segment reuse logic handles cleanup automatically
    setLocations(previousSnapshot.locations);
    setLegModes(previousSnapshot.legModes);
    setCustomDrawEnabled(previousSnapshot.customDrawEnabled);
    setSnapToRoads(previousSnapshot.snapToRoads);
    setCustomPoints(previousSnapshot.customPoints);
    setLockedSegments(previousSnapshot.lockedSegments);

    // Remove this snapshot from history
    setUndoHistory(prev => {
      const newHistory = prev.slice(0, -1);
      return newHistory;
    });
    setLastActionType(undoHistory.length > 1 ? undoHistory[undoHistory.length - 2].actionType : null);

  }, [undoHistory]);

  /**
   * Clear undo history
   */
  const handleClearHistory = useCallback(() => {
    setUndoHistory([]);
    setLastActionType(null);
  }, []);

  // ============================================================================
  // NEW ROUTE SEGMENTS - ALWAYS BUILT FROM PARENT PROPS
  // ============================================================================

  // SIMPLE FIX: Always rebuild routeSegments from parent props (locations, legModes, etc)
  // This ensures they're ALWAYS in sync, no complex state management needed
  const routeSegments = React.useMemo(() => {
    const segments = [];
    for (let i = 0; i < locations.length - 1; i++) {
      // Skip ONLY if both locations are null AND custom draw is NOT enabled
      // If draw mode is enabled, we need the segment to exist even without locations
      if (locations[i] === null && locations[i + 1] === null && !customDrawEnabled[i]) {
        continue;
      }
      segments.push({
        id: `seg-${i}`,
        startLocation: locations[i],
        endLocation: locations[i + 1],
        mode: legModes[i] || 'walk',
        isCustom: customDrawEnabled[i] === true,
        isLocked: lockedSegments[i] === true,
        snapToRoads: snapToRoads[i] === true,
        customPoints: customPoints[i] || []
      });
    }
    return segments;
  }, [locations, legModes, customDrawEnabled, lockedSegments, snapToRoads, customPoints]);

  // DERIVED STATE: Compute UI-friendly data from routeSegments
  // These are the values the UI will use for rendering
  const uiLocations = React.useMemo(() => {
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

  const uiModes = React.useMemo(() => {
    if (!routeSegments || routeSegments.length === 0) {
      return ['walk'];
    }
    return routeSegments.map(seg => seg?.mode || 'walk');
  }, [routeSegments]);

  // NEW: Build segments for map rendering directly from routeSegments
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
        isCustom: seg.isCustom || false
      };

      // Add custom path if this is a custom segment with points
      if (seg.isCustom && seg.customPoints && seg.customPoints.length > 0) {
        const pathPoints = [];
        // For segments after the first, include the start location
        if (i > 0 && seg.startLocation) {
          pathPoints.push(seg.startLocation);
        }
        pathPoints.push(...seg.customPoints);
        segment.customPath = pathPoints;
      }

      return segment;
    }).filter(Boolean); // Remove null segments

    return segments;
  }, [routeSegments]);

  // Generate unique ID for segments
  const generateSegmentId = () => `seg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // ============================================================================
  // SEGMENT OPERATIONS - Simplified to use parent arrays
  // ============================================================================

  /**
   * Add next leg to route (extends with empty segment)
   */
  const addNextLegToSegments = useCallback(() => {

    // Save to undo history BEFORE changing
    saveToUndoHistory('ADD_DESTINATION');

    // Clear active input - user is adding a new leg, not editing
    setActiveInput(null);

    // Lock the last segment if it's in custom draw mode
    const lastSegmentIndex = locations.length - 2;
    if (lastSegmentIndex >= 0 && customDrawEnabled[lastSegmentIndex]) {
      const newLockedSegments = [...lockedSegments];
      newLockedSegments[lastSegmentIndex] = true;
      setLockedSegments(newLockedSegments);

      // CRITICAL FIX: Clear the clicked location to prevent it from being reused
      // When we lock a draw segment, the last clicked point was already used by CustomRouteDrawer
      // We need to prevent it from being processed again by the clickedLocation effect
      if (onLocationUsed) {
        onLocationUsed(); // This clears clickedLocation in parent
      }
    }

    // Add new location and mode
    const newLocations = [...locations, null];
    const newModes = [...legModes, 'walk'];

    setLocations(newLocations);
    setLegModes(newModes);

    // Notify parent via deprecated callbacks (will be removed later)
    if (onLocationsChange) {
      onLocationsChange(newLocations, 'ADD_DESTINATION');
    }
    if (onLegModesChange) {
      onLegModesChange(newModes);
    }
  }, [locations, customDrawEnabled, lockedSegments, legModes, saveToUndoHistory, onLocationsChange, onLegModesChange]);

  /**
   * Update the mode for a specific segment
   */
  const updateSegmentMode = useCallback((segmentIndex, mode) => {

    // Save to undo history BEFORE changing
    saveToUndoHistory('CHANGE_MODE');

    // Update mode directly
    const newModes = [...legModes];
    newModes[segmentIndex] = mode;

    setLegModes(newModes);

    // Notify parent via deprecated callback (will be removed later)
    if (onLegModesChange) {
      onLegModesChange(newModes, segmentIndex);
    }

    // Update route for visual feedback
    const filledLocations = locations.filter(loc => loc !== null);
    if (filledLocations.length >= 2 && onDirectionsCalculated) {
      const segments = buildSegments(filledLocations);
      const routeData = {
        origin: filledLocations[0],
        destination: filledLocations[filledLocations.length - 1],
        waypoints: filledLocations.slice(1, -1),
        mode: newModes[0],
        segments,
        allLocations: filledLocations,
        allModes: newModes,
        customPaths: customPoints,
        routeId: filledLocations.map(loc => `${loc.lat},${loc.lng}`).join('_') + '_' + newModes.join('-')
      };
      onDirectionsCalculated(routeData);
    }
  }, [saveToUndoHistory, legModes, onLegModesChange, locations, onDirectionsCalculated, buildSegments, customPoints]);

  /**
   * Toggle custom drawing for a segment
   * If enabling and both locations exist, initialize straight line
   */
  const toggleSegmentDrawMode = useCallback((segmentIndex) => {

    // Save to undo history BEFORE changing
    saveToUndoHistory('TOGGLE_DRAW_MODE');

    setCustomDrawEnabled(prev => {
      const newArr = [...prev];
      const newIsCustom = !newArr[segmentIndex];
      newArr[segmentIndex] = newIsCustom;


      // If enabling draw mode and both locations exist, create straight line
      if (newIsCustom && locations[segmentIndex] && locations[segmentIndex + 1]) {
        setCustomPoints(prevPoints => ({
          ...prevPoints,
          [segmentIndex]: [
            { lat: locations[segmentIndex].lat, lng: locations[segmentIndex].lng },
            { lat: locations[segmentIndex + 1].lat, lng: locations[segmentIndex + 1].lng }
          ]
        }));
      } else if (newIsCustom && locations[segmentIndex]) {
        // Only start location exists - initialize with that point
        setCustomPoints(prevPoints => ({
          ...prevPoints,
          [segmentIndex]: [
            { lat: locations[segmentIndex].lat, lng: locations[segmentIndex].lng }
          ]
        }));
      } else if (newIsCustom) {
        // Initialize empty customPoints for this segment
        setCustomPoints(prevPoints => ({
          ...prevPoints,
          [segmentIndex]: []
        }));
      }

      // If disabling draw mode, clear custom points (but keep the end location)
      if (!newIsCustom) {
        setCustomPoints(prevPoints => {
          const newPoints = { ...prevPoints };
          delete newPoints[segmentIndex];
          return newPoints;
        });
      }

      return newArr;
    });
  }, [locations, saveToUndoHistory]);

  /**
   * Add a point to a segment's custom route
   */
  const addPointToSegment = useCallback((segmentIndex, point) => {

    // Save to undo history BEFORE adding point
    saveToUndoHistory('ADD_POINT');

    setCustomPoints(prev => {
      const newPoints = {
        ...prev,
        [segmentIndex]: [...(prev[segmentIndex] || []), point]
      };
      return newPoints;
    });
  }, [saveToUndoHistory]);

  /**
   * Undo last point from a segment's custom route
   * NOTE: This is the old per-point undo, NOT the new full-state undo
   * TODO: Remove this once main undo button works
   */
  const undoPointFromSegment = useCallback((segmentIndex) => {

    const points = customPoints[segmentIndex] || [];
    if (points.length === 0) return;

    const newPoints = points.slice(0, -1);

    // Update customPoints
    setCustomPoints(prev => ({
      ...prev,
      [segmentIndex]: newPoints
    }));

    // Update location B to match the new last point
    const newLocations = [...locations];
    if (newPoints.length > 1) {
      // More than 1 point left - update B to the new last point
      const newEndPoint = newPoints[newPoints.length - 1];
      newLocations[segmentIndex + 1] = {
        lat: newEndPoint.lat,
        lng: newEndPoint.lng
      };
    } else {
      // Only 1 or 0 points left - clear location B
      newLocations[segmentIndex + 1] = null;
    }

    setLocations(newLocations);

    // Notify parent via deprecated callback
    if (onLocationsChange) {
      onLocationsChange(newLocations, 'UNDO_POINT');
    }
  }, [locations, customPoints, onLocationsChange]);

  /**
   * Update location - save to undo history before changing
   */
  const updateLocation = useCallback((index, location) => {

    // Save current state to undo history BEFORE making changes
    const actionType = location ? 'ADD_LOCATION' : 'CLEAR_LOCATION';
    saveToUndoHistory(actionType);

    // Now update the location
    const newLocations = [...locations];
    newLocations[index] = location;
    setLocations(newLocations);

    // Notify parent via deprecated callback (will be removed later)
    if (onLocationsChange) {
      onLocationsChange(newLocations, actionType);
    }
  }, [locations, saveToUndoHistory, onLocationsChange]);

  // No more sync effects needed - routeSegments is now derived from parent arrays

  // Auto-calculate routes when routeSegments changes
  useEffect(() => {
    const filledLocations = uiLocations.filter(loc => loc !== null);

    if (filledLocations.length >= 2 && onDirectionsCalculated) {
      const segments = buildSegments(filledLocations);

      // Create stable routeId based on segment data (locations + modes + custom state)
      const routeId = routeSegments.map(s =>
        `${s.id}-${s.startLocation?.lat}-${s.startLocation?.lng}-${s.endLocation?.lat}-${s.endLocation?.lng}-${s.mode}-${s.isCustom}`
      ).join('|');

      // Only call onDirectionsCalculated if the route actually changed
      if (routeId !== lastRouteIdRef.current) {
        lastRouteIdRef.current = routeId;

        const routeData = {
          origin: filledLocations[0],
          destination: filledLocations[filledLocations.length - 1],
          waypoints: filledLocations.slice(1, -1),
          mode: uiModes[0],
          segments,
          allLocations: uiLocations,
          allModes: uiModes,
          customPaths: customPoints, // Still using customPoints for now
          routeId: `${Date.now()}-${routeSegments.map(s => s.id).join('-')}` // Add timestamp for uniqueness in RouteSegmentManager
        };
        onDirectionsCalculated(routeData);
      } else {
      }
    } else if (filledLocations.length === 1) {
      // Special case: 1 location in draw mode - still pass route to show marker
      const hasDrawMode = routeSegments.some(s => s.isCustom);
      if (hasDrawMode && onDirectionsCalculated) {
        const routeData = {
          origin: filledLocations[0],
          destination: null,
          waypoints: [],
          mode: uiModes[0],
          segments: [],
          allLocations: uiLocations,
          allModes: uiModes,
          customPaths: customPoints,
          routeId: `single-${Date.now()}`,
          singleLocationDrawMode: true
        };
        lastRouteIdRef.current = 'single';
        onDirectionsCalculated(routeData);
      } else if (lastRouteIdRef.current !== null) {
        lastRouteIdRef.current = null;
        onDirectionsCalculated(null);
      }
    } else if (filledLocations.length === 0) {
      if (lastRouteIdRef.current !== null) {
        lastRouteIdRef.current = null;
        onDirectionsCalculated(null);
      }
    }
  }, [routeSegments, uiLocations, uiModes, buildSegments, onDirectionsCalculated, customPoints]);

  // HELPERS: Derive data from routeSegments for UI rendering

  /**
   * Build locations array from routeSegments for UI rendering
   * Returns array like [A, B, C, D] where each is a location object or null
   */
  const getLocationsFromSegments = useCallback(() => {
    if (routeSegments.length === 0) {
      return [null, null]; // Default: empty A and B
    }

    const locs = [];
    routeSegments.forEach((seg, i) => {
      if (i === 0) {
        locs.push(seg.startLocation);
      }
      locs.push(seg.endLocation);
    });

    // Ensure at least 2 locations
    while (locs.length < 2) {
      locs.push(null);
    }

    return locs;
  }, [routeSegments]);

  /**
   * Build leg modes array from routeSegments
   */
  const getModesFromSegments = useCallback(() => {
    if (routeSegments.length === 0) {
      return ['walk'];
    }
    return routeSegments.map(seg => seg.mode);
  }, [routeSegments]);

  // Handle ESC key to cancel edit mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && activeInput !== null) {
        setActiveInput(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeInput]);

  // Notify parent when first location (origin) changes
  useEffect(() => {
    if (onOriginChange && locations[0]) {
      onOriginChange(locations[0]);
    }
  }, [locations, onOriginChange]);

  // Notify parent when last location (current destination) changes
  useEffect(() => {
    if (onDestinationChange && locations.length > 1) {
      const lastLocation = locations[locations.length - 1];
      onDestinationChange(lastLocation);
    }
  }, [locations, onDestinationChange]);

  // Handle clicked location from map - only trigger when clickedLocation actually changes
  useEffect(() => {
    if (!clickedLocation || !isOpen) {
      return;
    }

    // Check if this is a new clicked location (different from previous)
    const isNewLocation = !prevClickedLocationRef.current ||
      clickedLocation.lat !== prevClickedLocationRef.current.lat ||
      clickedLocation.lng !== prevClickedLocationRef.current.lng;

    if (!isNewLocation) {
      return; // Don't process the same location twice
    }


    // Check if any draw mode is currently active (and NOT locked)
    const isAnyDrawModeActive = routeSegments.some((seg) => {
      // Only consider segments that are in custom draw mode AND not locked
      return seg.isCustom && !seg.isLocked;
    });

    if (isAnyDrawModeActive) {
      return;
    }

    prevClickedLocationRef.current = clickedLocation;


    // If there's an active input (edit mode), replace that specific location
    if (activeInput !== null && activeInput !== undefined) {
      updateLocation(activeInput, clickedLocation);
      setActiveInput(null);
    } else {
      // Otherwise, find the first empty slot
      const emptyIndex = uiLocations.findIndex(loc => !loc);
      if (emptyIndex !== -1) {
        updateLocation(emptyIndex, clickedLocation);
      } else {
      }
    }

    onLocationUsed?.();
  }, [clickedLocation, isOpen, uiLocations, routeSegments, activeInput, onLocationUsed, updateLocation]);

  // OLD EFFECT - DISABLED during refactor (now handled by auto-calc effect above)
  // This was causing double renders and race conditions
  // Recalculate route when custom draw mode is toggled (NOT when locations change - that's handled above)
  // useEffect(() => {

  //   const filledLocations = locations.filter(loc => loc !== null);
  //   if (filledLocations.length >= 2 && onDirectionsCalculated) {
  //     const segments = buildSegments(filledLocations);

  //     const routeData = {
  //       origin: filledLocations[0],
  //       destination: filledLocations[filledLocations.length - 1],
  //       waypoints: filledLocations.slice(1, -1),
  //       mode: legModes[0],
  //       segments,
  //       allLocations: locations,
  //       allModes: legModes,
  //       customPaths: customPoints, // Include custom points for reference
  //       routeId: filledLocations.map(loc => `${loc.lat},${loc.lng}`).join('_') + '_' + legModes.join('-') + '_' + customDrawEnabled.join('-')
  //     };
  //     onDirectionsCalculated(routeData);
  //   }
  // }, [customDrawEnabled, legModes, onDirectionsCalculated, customPoints, buildSegments]);


  const removeLocation = (index) => {
    if (index === 0 || index === 1) return; // Can't remove A or B

    // Save to undo history BEFORE removing
    saveToUndoHistory('REMOVE_LOCATION');

    const newLocations = locations.filter((_, i) => i !== index);
    // When removing a location, we need to remove the leg mode that leads TO that location
    // If we're removing location C (index 2), we remove the B→C leg mode (index 1)
    const newModes = [...legModes];
    if (index <= legModes.length) {
      newModes.splice(index - 1, 1); // Remove the leg mode leading to this location
    }

    // Clear dragged segments since the route structure has changed
    if (window.draggedSegments) {
      // Remove dragged data for segments that no longer exist
      const newDraggedSegments = {};
      for (let i = 0; i < newLocations.length - 1; i++) {
        if (i < index - 1 && window.draggedSegments[i]) {
          // Keep dragged segments before the removed location
          newDraggedSegments[i] = window.draggedSegments[i];
        } else if (i >= index - 1 && window.draggedSegments[i + 1]) {
          // Shift dragged segments after the removed location
          newDraggedSegments[i] = window.draggedSegments[i + 1];
          newDraggedSegments[i].segmentIndex = i; // Update the index
        }
      }
      window.draggedSegments = newDraggedSegments;
    }

    setLocations(newLocations);
    setLegModes(newModes);

    // Notify parent via deprecated callbacks (will be removed later)
    if (onLocationsChange) {
      onLocationsChange(newLocations, 'REMOVE_LOCATION');
    }
    if (onLegModesChange) {
      onLegModesChange(newModes);
    }

    // Recalculate route after removal
    const filledLocations = newLocations.filter(loc => loc !== null);
    if (filledLocations.length >= 2) {
      const segments = buildSegments(filledLocations);
      const routeData = {
        origin: filledLocations[0],
        destination: filledLocations[filledLocations.length - 1],
        waypoints: filledLocations.slice(1, -1),
        mode: newModes[0],
        segments,
        allLocations: filledLocations,
        allModes: newModes,
        customPaths: customPoints,
        routeId: filledLocations.map(loc => `${loc.lat},${loc.lng}`).join('_') + '_' + newModes.join('-')
      };
      onDirectionsCalculated(routeData);
    } else {
      // Clear routes when we have less than 2 locations
      onDirectionsCalculated(null);
    }
  };

  const getUndoTooltip = (lastAction) => {
    if (!lastAction) return "Undo last action";
    
    const label = getLocationLabel(lastAction.index);
    
    switch (lastAction.type) {
      case 'ADD_LOCATION':
        return `Undo: Add location ${label}`;
      case 'CLEAR_LOCATION':
        return `Undo: Clear location ${label}`;
      case 'ADD_DESTINATION':
        return `Undo: Add destination ${label}`;
      case 'CHANGE_MODE':
        return `Undo: Change ${label} → ${getLocationLabel(lastAction.index + 1)} to ${lastAction.newMode}`;
      case 'DRAG_SEGMENT':
        return `Undo: Drag route ${label} → ${getLocationLabel(lastAction.index + 1)}`;
      case 'ADD_LOCATION_WITH_MODE':
        return `Undo: Add ${lastAction.mode} location ${label}`;
      default:
        return "Undo last action";
    }
  };




  const handleReset = () => {
    // Reset all state
    setLocations([null, null]);
    setLegModes(['walk']);
    setCustomDrawEnabled([]);
    setSnapToRoads([]);
    setCustomPoints({});
    setLockedSegments([]);

    // Notify parent via deprecated callbacks (will be removed later)
    if (onLocationsChange) {
      onLocationsChange([null, null], null); // Don't track this in history
    }
    if (onLegModesChange) {
      onLegModesChange(['walk']);
    }

    // Clear dragged segments
    if (window.draggedSegments) {
      window.draggedSegments = {};
    }
  };

  const handleSaveRoute = useCallback((routeData) => {
    const filledLocations = locations.filter(loc => loc !== null);
    if (filledLocations.length >= 1) {
      try {
        saveRoute({
          name: routeData.name,
          description: routeData.description,
          locations: filledLocations,
          modes: legModes
        });
      } catch (error) {
      }
    }
  }, [locations, legModes]);

  const handleLoadRoute = useCallback((route) => {
    const loadedLocations = [...route.locations];
    while (loadedLocations.length < 2) {
      loadedLocations.push(null);
    }

    setLocations(loadedLocations);
    setLegModes(route.modes);

    // Notify parent via deprecated callbacks (will be removed later)
    if (onLocationsChange) {
      onLocationsChange(loadedLocations, 'load_route');
    }
    if (onLegModesChange) {
      onLegModesChange(route.modes);
    }

    if (route.locations.length >= 2) {
      setTimeout(() => {
        const segments = buildSegments(route.locations);

        const routeData = {
          origin: route.locations[0],
          destination: route.locations[route.locations.length - 1],
          waypoints: route.locations.slice(1, -1),
          mode: route.modes[0] || 'walk',
          segments,
          allLocations: route.locations,
          allModes: route.modes,
          customPaths: customPoints,
          routeId: `loaded_${Date.now()}`
        };

        onDirectionsCalculated(routeData);
      }, 100);
    }
  }, [onLocationsChange, onLegModesChange, onDirectionsCalculated, customPoints, buildSegments]);

  const handleShare = async () => {
    const shareableURL = generateShareableURL(locations, legModes);

    if (!shareableURL) {
      return;
    }

    const copied = await copyToClipboard(shareableURL);

    if (copied) {
      setShowCopiedMessage(true);
      setTimeout(() => setShowCopiedMessage(false), 3000);
    } else {
    }
  };

  // NEW: Handle point added using routeSegments
  const handlePointAdded = (pointData) => {
    const { segmentIndex, point } = pointData;

    // Just use addPointToSegment
    addPointToSegment(segmentIndex, point);
  };

  const handleUndoPoint = (segmentIndex) => {
    const segmentPoints = customPoints[segmentIndex] || [];
    if (segmentPoints.length === 0) return;

    // Remove the last point
    const newSegmentPoints = segmentPoints.slice(0, -1);

    // Update customPoints
    if (newSegmentPoints.length === 0) {
      // No more points for this segment, remove the key
      setCustomPoints(prev => {
        const newPoints = { ...prev };
        delete newPoints[segmentIndex];
        return newPoints;
      });
    } else {
      setCustomPoints(prev => ({
        ...prev,
        [segmentIndex]: newSegmentPoints
      }));
    }

    // Update the end location marker to follow the undo
    const newLocations = [...locations];
    if (newSegmentPoints.length > 0) {
      // Move end marker to the new last point
      const newEndPoint = newSegmentPoints[newSegmentPoints.length - 1];
      newLocations[segmentIndex + 1] = {
        lat: newEndPoint.lat,
        lng: newEndPoint.lng
      };
    } else {
      // No more points - reset both markers if this is the first segment
      if (segmentIndex === 0) {
        newLocations[segmentIndex] = null;
        newLocations[segmentIndex + 1] = null;
      }
    }

    setLocations(newLocations);

    // Notify parent via deprecated callback
    if (onLocationsChange) {
      onLocationsChange(newLocations, 'CLEAR_LOCATION');
    }
  };

  const handleSetLocations = (segmentIndex, startPoint, endPoint) => {

    // Auto-set locations from the drawn points
    const newLocations = [...locations];

    // If startPoint is null, keep existing start location (for continuous drawing)
    if (startPoint !== null) {
      newLocations[segmentIndex] = startPoint;
    }

    // Always update end location
    newLocations[segmentIndex + 1] = endPoint;


    setLocations(newLocations);

    // Notify parent via deprecated callback (will be removed later)
    if (onLocationsChange) {
      onLocationsChange(newLocations, 'ADD_LOCATION');
    }
  };


  const handleMinimize = () => {
    setIsMinimized(true);
  };

  const handleExpand = () => {
    setIsMinimized(false);
  };

  // Render minimized state
  const renderMinimized = isMinimized && (
    <div
      className="directions-panel-minimized"
      style={{
        position: 'fixed',
        left: '20px',
        bottom: '20px',
        zIndex: 2000
      }}
    >
      <button
        className="unified-icon primary"
        onClick={handleExpand}
        title="Plan Your Route"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="18" r="3" />
          <path d="M9 9l6 6" />
        </svg>
      </button>
    </div>
  );

  // Render main panel
  const renderPanel = isOpen && !isMinimized && (
    <div
      className="directions-panel"
    >
      <DirectionsHeader
        isEditing={isEditing}
        editingTrip={editingTrip}
        onMinimize={handleMinimize}
      />

      <div className="directions-content">
        {/* Action buttons - above Location A */}
        <div style={{
          display: 'flex',
          gap: '6px',
          marginBottom: '1.5rem',
          justifyContent: 'flex-start'
        }}>
          {/* Undo button - NOW USING NEW UNDO SYSTEM */}
          <button
            onClick={handleUndo}
            disabled={undoHistory.length === 0}
            style={{
              padding: '4px 8px',
              backgroundColor: '#f3f4f6',
              color: undoHistory.length === 0 ? '#d1d5db' : '#374151',
              border: `1px solid ${undoHistory.length === 0 ? '#e5e7eb' : '#d1d5db'}`,
              borderRadius: '4px',
              fontSize: '14px',
              cursor: undoHistory.length === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '28px',
              height: '28px',
              opacity: undoHistory.length === 0 ? 0.5 : 1
            }}
            title={lastActionType ? `Undo: ${lastActionType}` : 'Undo last action'}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.backgroundColor = '#e5e7eb';
                e.currentTarget.style.borderColor = '#9ca3af';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.borderColor = !e.currentTarget.disabled ? '#d1d5db' : '#e5e7eb';
            }}
          >
            ↩️
          </button>
          {/* Clear/Reset button - NOW USING NEW UNDO SYSTEM */}
          <button
            onClick={() => {
              handleReset();
              // Clear undo history using new system
              handleClearHistory();
              // Also clear the route on the map
              if (onDirectionsCalculated) {
                onDirectionsCalculated({
                  routeId: 'empty',
                  allLocations: [],
                  allModes: []
                });
              }
            }}
            disabled={!(uiLocations.some(loc => loc !== null) || undoHistory.length > 0)}
            style={{
              padding: '4px 8px',
              backgroundColor: '#f3f4f6',
              color: !(uiLocations.some(loc => loc !== null) || undoHistory.length > 0) ? '#d1d5db' : '#374151',
              border: `1px solid ${!(uiLocations.some(loc => loc !== null) || undoHistory.length > 0) ? '#e5e7eb' : '#d1d5db'}`,
              borderRadius: '4px',
              fontSize: '14px',
              cursor: !(uiLocations.some(loc => loc !== null) || undoHistory.length > 0) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '28px',
              height: '28px',
              opacity: !(uiLocations.some(loc => loc !== null) || undoHistory.length > 0) ? 0.5 : 1
            }}
            title="Reset route"
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.backgroundColor = '#e5e7eb';
                e.currentTarget.style.borderColor = '#9ca3af';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.borderColor = !e.currentTarget.disabled ? '#d1d5db' : '#e5e7eb';
            }}
          >
            🔄
          </button>
          {/* Load button */}
          <button
            onClick={() => setShowSavedRoutesModal(true)}
            style={{
              padding: '4px 8px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '28px',
              height: '28px'
            }}
            title="Load saved route"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e5e7eb';
              e.currentTarget.style.borderColor = '#9ca3af';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
          >
            📂
          </button>
          {/* Save button */}
          <button
            onClick={() => setShowSaveModal(true)}
            disabled={!uiLocations.some(loc => loc !== null)}
            style={{
              padding: '4px 8px',
              backgroundColor: '#f3f4f6',
              color: !uiLocations.some(loc => loc !== null) ? '#d1d5db' : '#374151',
              border: `1px solid ${!uiLocations.some(loc => loc !== null) ? '#e5e7eb' : '#d1d5db'}`,
              borderRadius: '4px',
              fontSize: '14px',
              cursor: !uiLocations.some(loc => loc !== null) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '28px',
              height: '28px',
              opacity: !uiLocations.some(loc => loc !== null) ? 0.5 : 1
            }}
            title="Save route"
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.backgroundColor = '#e5e7eb';
                e.currentTarget.style.borderColor = '#9ca3af';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.borderColor = !e.currentTarget.disabled ? '#d1d5db' : '#e5e7eb';
            }}
          >
            💾
          </button>
          {/* Share button */}
          <button
            onClick={handleShare}
            disabled={!directionsRoute || uiLocations.filter(l => l !== null).length < 2}
            style={{
              padding: '4px 8px',
              backgroundColor: '#f3f4f6',
              color: (!directionsRoute || uiLocations.filter(l => l !== null).length < 2) ? '#d1d5db' : '#374151',
              border: `1px solid ${(!directionsRoute || uiLocations.filter(l => l !== null).length < 2) ? '#e5e7eb' : '#d1d5db'}`,
              borderRadius: '4px',
              fontSize: '14px',
              cursor: (!directionsRoute || uiLocations.filter(l => l !== null).length < 2) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '28px',
              height: '28px',
              opacity: (!directionsRoute || uiLocations.filter(l => l !== null).length < 2) ? 0.5 : 1
            }}
            title="Share route (copy link)"
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.backgroundColor = '#e5e7eb';
                e.currentTarget.style.borderColor = '#9ca3af';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.borderColor = !e.currentTarget.disabled ? '#d1d5db' : '#e5e7eb';
            }}
          >
            {showCopiedMessage ? '✅' : '🔗'}
          </button>
        </div>

        <div className="route-inputs">
          {/* Display all locations in sequence - NOW USING uiLocations from routeSegments! */}
          {uiLocations.map((location, index) => (
            <div key={index}>
              <div className={`input-group ${!location && index === uiLocations.findIndex(l => !l) ? 'awaiting-click' : ''} ${activeInput === index ? 'awaiting-input' : ''}`}>
                <label>
                  Location {getLocationLabel(index)}
                </label>
                {!location ? (
                  <LocationSearch
                    onLocationSelect={(loc) => {
                      // Check if this location is part of a segment with custom drawing enabled
                      const isEndOfDrawSegment = index > 0 && customDrawEnabled[index - 1];
                      const isStartOfDrawSegment = index < uiLocations.length - 1 && customDrawEnabled[index];

                      if (isEndOfDrawSegment || isStartOfDrawSegment) {
                        // In draw mode - add this as a point to the custom route
                        const segmentIndex = isEndOfDrawSegment ? index - 1 : index;
                        const point = { lat: loc.lat, lng: loc.lng };

                        // Add this point to customPoints
                        handlePointAdded({
                          segmentIndex,
                          point
                        });

                        // ALSO update the location marker (Location B, C, etc.)
                        // This ensures the marker appears at the searched location
                        updateLocation(index, loc);
                      } else {
                        // Normal mode - just update the location
                        updateLocation(index, loc);
                      }

                      isEditingRef.current = false;
                      setActiveInput(null); // Clear active input

                      // DISABLED: Auto-pan/zoom - let user control viewport
                      // if (index === 0 && map && loc) {
                      //   map.panTo({ lat: loc.lat, lng: loc.lng });
                      //   if (map.getZoom() < 13) {
                      //     map.setZoom(13);
                      //   }
                      // }
                    }}
                    placeholder={`Enter location ${getLocationLabel(index)}...`}
                  />
                ) : activeInput === index ? (
                  // Edit mode - show LocationSearch component to allow typing/searching
                  <div style={{ position: 'relative' }}>
                    <LocationSearch
                      onLocationSelect={(loc) => {
                        updateLocation(index, loc);
                        setActiveInput(null);

                        // DISABLED: Auto-pan/zoom - let user control viewport
                        // if (map && loc) {
                        //   map.panTo({ lat: loc.lat, lng: loc.lng });
                        //   if (map.getZoom() < 13) {
                        //     map.setZoom(13);
                        //   }
                        // }
                      }}
                      placeholder={`Edit location ${getLocationLabel(index)}...`}
                      autoFocus={true}
                      defaultValue={location.name || location.address || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
                    />
                    <div style={{ fontSize: '11px', marginTop: '4px', color: '#3b82f6', fontStyle: 'italic' }}>
                      Type to search or click on map (ESC to cancel)
                    </div>
                  </div>
                ) : (
                  <div
                    className="selected-location"
                    onClick={() => setActiveInput(index)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span>📍 {location.name || location.address || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}</span>
                    {index > 1 && (
                      <button 
                        className="remove-location-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLocation(index);
                        }}
                        title="Remove location"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
              
              {/* Show transportation mode selector between locations */}
              {index < uiLocations.length - 1 && (
                <div className="leg-mode-selector">
                  <label>{getLocationLabel(index)} → {getLocationLabel(index + 1)} Transportation:</label>
                  <div className="mode-buttons compact">
                    {Object.entries(transportationModes).filter(([mode]) => mode !== 'custom').map(([mode, config]) => {
                      const modeLabels = {
                        walk: 'Walking',
                        bike: 'Cycling',
                        bus: 'Bus',
                        car: 'Driving',
                        transit: 'Rail Transit',
                        flight: 'Flight'
                      };
                      return (
                        <button
                          key={mode}
                          className={`mode-button compact ${uiModes[index] === mode ? 'active' : ''}`}
                          onClick={() => updateSegmentMode(index, mode)} // NOW USING NEW FUNCTION!
                          title={modeLabels[mode]}
                          style={{
                            backgroundColor: uiModes[index] === mode ? config.color : 'transparent',
                            borderColor: config.color,
                            color: uiModes[index] === mode ? 'white' : config.color
                          }}
                        >
                          <span className="mode-icon">{config.icon}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom drawing toggles */}
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      cursor: routeSegments[index]?.isLocked ? 'not-allowed' : 'pointer',
                      opacity: routeSegments[index]?.isLocked ? 0.6 : 1
                    }}>
                      <input
                        type="checkbox"
                        checked={routeSegments[index]?.isCustom || false}
                        disabled={routeSegments[index]?.isLocked}
                        onChange={() => toggleSegmentDrawMode(index)}
                        style={{ cursor: routeSegments[index]?.isLocked ? 'not-allowed' : 'pointer' }}
                      />
                      <span>
                        Draw Custom Route
                        {routeSegments[index]?.isLocked && ' (Locked)'}
                      </span>
                    </label>
                  </div>
                </div>
              )}
              
            </div>
          ))}
          
          {/* Add Next Leg Button */}
          <button
            className="add-stop-button"
            onClick={(e) => {
              e.preventDefault();
              addNextLegToSegments(); // NOW USING NEW FUNCTION!
            }}
            type="button"
          >
            <span>➕ Add Next Location ({getLocationLabel(uiLocations.length)})</span>
          </button>


        </div>

      </div>
    </div>
  );

  // Always render modals and drawers (even when panel is closed/minimized)
  return (
    <>
      {renderMinimized}
      {renderPanel}

      {/* Save Route Modal */}
      <SaveRouteModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSaveRoute}
        defaultName={`Route ${new Date().toLocaleDateString()}`}
      />

      {/* Saved Routes Modal */}
      <SavedRoutesModal
        isOpen={showSavedRoutesModal}
        onClose={() => setShowSavedRoutesModal(false)}
        onLoadRoute={handleLoadRoute}
      />

      {/* Custom Route Drawers - render one per segment with draw mode enabled */}
    {map && routeSegments.map((segment, index) => {
      if (!segment.isCustom) return null; // Only render if drawing is enabled


      return (
        <CustomRouteDrawer
          key={`drawer-${index}`}
          map={map}
          segmentIndex={index}
          isEnabled={!segment.isLocked}
          snapToRoads={segment.snapToRoads || false}
          mode={segment.mode || 'walk'}
          onPointAdded={handlePointAdded}
          onSetLocations={handleSetLocations}
          previousLocation={index > 0 ? segment.startLocation : null}
          points={segment.customPoints || []}
        />
      );
    })}
    </>
  );
};

export default DirectionsPanel;
