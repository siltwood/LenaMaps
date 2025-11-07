import { useCallback } from 'react';

/**
 * useRouteActions - Manages route CRUD operations
 *
 * Provides functions to add, update, remove locations and manage
 * segment properties like modes, custom draw, and locking.
 *
 * @param {Object} params - Configuration object
 * @param {Array} params.locations - Array of location objects
 * @param {Array} params.legModes - Array of transportation modes
 * @param {Array} params.customDrawEnabled - Array of custom draw states
 * @param {Array} params.lockedSegments - Array of locked states
 * @param {Function} params.setLocations - Setter for locations
 * @param {Function} params.setLegModes - Setter for leg modes
 * @param {Function} params.setCustomDrawEnabled - Setter for custom draw
 * @param {Function} params.setLockedSegments - Setter for locked segments
 * @param {Function} params.onLocationsChange - Callback for location changes
 * @param {Function} params.onLegModesChange - Callback for mode changes
 * @param {Function} params.onDirectionsCalculated - Callback for route updates
 * @param {Function} params.onLocationUsed - Callback when clicked location is used
 * @param {Function} params.buildSegments - Function to build segments for map
 * @returns {Object} Route action functions
 */
export const useRouteActions = ({
  locations,
  legModes,
  customDrawEnabled,
  lockedSegments,
  setLocations,
  setLegModes,
  setCustomDrawEnabled,
  setLockedSegments,
  onLocationsChange,
  onLegModesChange,
  onDirectionsCalculated,
  onLocationUsed,
  buildSegments
}) => {
  /**
   * Add next leg to route (extends with empty segment)
   */
  const addNextLegToSegments = useCallback(() => {
    // Lock the last segment if it's in custom draw mode
    const lastSegmentIndex = locations.length - 2;
    if (lastSegmentIndex >= 0 && customDrawEnabled[lastSegmentIndex]) {
      const newLockedSegments = [...lockedSegments];
      newLockedSegments[lastSegmentIndex] = true;
      setLockedSegments(newLockedSegments);

      // Clear the clicked location to prevent it from being reused
      if (onLocationUsed) {
        onLocationUsed();
      }
    }

    // Add new location and mode
    const newLocations = [...locations, null];
    const newModes = [...legModes, 'walk'];

    // Extend segment property arrays to match new segment count
    const newCustomDrawEnabled = [...(customDrawEnabled || []), false];

    setLocations(newLocations);
    setLegModes(newModes);
    setCustomDrawEnabled(newCustomDrawEnabled);

    // Notify parent via deprecated callbacks (will be removed later)
    if (onLocationsChange) {
      onLocationsChange(newLocations, 'ADD_DESTINATION');
    }
    if (onLegModesChange) {
      onLegModesChange(newModes);
    }
  }, [
    locations,
    customDrawEnabled,
    lockedSegments,
    legModes,
    setLocations,
    setLegModes,
    setCustomDrawEnabled,
    setLockedSegments,
    onLocationsChange,
    onLegModesChange,
    onLocationUsed
  ]);

  /**
   * Update the mode for a specific segment
   */
  const updateSegmentMode = useCallback((segmentIndex, mode) => {
    // Update mode directly (no undo - this is a UI action, not a map change)
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
        routeId: filledLocations.map(loc => `${loc.lat},${loc.lng}`).join('_') + '_' + newModes.join('-')
      };
      onDirectionsCalculated(routeData);
    }
  }, [legModes, setLegModes, onLegModesChange, locations, onDirectionsCalculated, buildSegments]);

  /**
   * Toggle custom drawing for a segment
   * Draw mode = simple straight line between two points
   */
  const toggleSegmentDrawMode = useCallback((segmentIndex) => {
    setCustomDrawEnabled(prev => {
      const newArr = [...prev];
      newArr[segmentIndex] = !newArr[segmentIndex];
      return newArr;
    });
  }, [setCustomDrawEnabled]);

  /**
   * Update location
   */
  const updateLocation = useCallback((index, location) => {
    const newLocations = [...locations];
    newLocations[index] = location;
    setLocations(newLocations);

    // Notify parent via deprecated callback (will be removed later)
    if (onLocationsChange) {
      const actionType = location ? 'ADD_LOCATION' : 'CLEAR_LOCATION';
      onLocationsChange(newLocations, actionType);
    }
  }, [locations, setLocations, onLocationsChange]);

  /**
   * Remove a location from the route
   */
  const removeLocation = useCallback((index) => {
    // Keep at least 2 locations total (can be null or filled)
    if (locations.length <= 2) {
      return; // Can't remove if only 2 locations left
    }

    const newLocations = locations.filter((_, i) => i !== index);

    // When removing a location, we need to remove the leg mode that leads TO that location
    const newModes = [...legModes];
    if (index > 0 && index <= legModes.length) {
      newModes.splice(index - 1, 1); // Remove the leg mode leading to this location
    } else if (index === 0 && legModes.length > 0) {
      newModes.splice(0, 1); // If removing first location, remove first leg mode
    }

    // Also update segment property arrays
    const newCustomDrawEnabled = [...customDrawEnabled];
    const newLockedSegments = [...lockedSegments];

    // Determine which segment index to remove
    const segmentIndexToRemove = index > 0 ? index - 1 : 0;

    // Remove the segment data
    newCustomDrawEnabled.splice(segmentIndexToRemove, 1);
    newLockedSegments.splice(segmentIndexToRemove, 1);

    setLocations(newLocations);
    setLegModes(newModes);
    setCustomDrawEnabled(newCustomDrawEnabled);
    setLockedSegments(newLockedSegments);

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
        routeId: filledLocations.map(loc => `${loc.lat},${loc.lng}`).join('_') + '_' + newModes.join('-')
      };
      onDirectionsCalculated(routeData);
    } else {
      // Clear routes when we have less than 2 locations
      onDirectionsCalculated(null);
    }
  }, [
    locations,
    legModes,
    customDrawEnabled,
    lockedSegments,
    setLocations,
    setLegModes,
    setCustomDrawEnabled,
    setLockedSegments,
    onLocationsChange,
    onLegModesChange,
    onDirectionsCalculated,
    buildSegments
  ]);

  /**
   * Reset all route state
   */
  const handleReset = useCallback(() => {
    // Reset all state
    setLocations([null, null]);
    setLegModes(['walk']);
    setCustomDrawEnabled([]);
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
  }, [
    setLocations,
    setLegModes,
    setCustomDrawEnabled,
    setLockedSegments,
    onLocationsChange,
    onLegModesChange
  ]);

  return {
    addNextLegToSegments,
    updateSegmentMode,
    toggleSegmentDrawMode,
    updateLocation,
    removeLocation,
    handleReset
  };
};
