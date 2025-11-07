import { useState, useCallback } from 'react';

/**
 * useDragAndDrop - Manages drag-and-drop location reordering
 *
 * Handles dragging locations to reorder them, along with their
 * associated segment properties (modes, custom draw, locked state).
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
 * @param {Function} params.buildSegments - Function to build segments for map
 * @returns {Object} Drag-and-drop state and handlers
 */
export const useDragAndDrop = ({
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
}) => {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleDragStart = useCallback((e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((e, dropIndex) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder locations
    const newLocations = [...locations];
    const [draggedLocation] = newLocations.splice(draggedIndex, 1);
    newLocations.splice(dropIndex, 0, draggedLocation);

    // Reorder segment properties to match location order
    // Segment i connects location[i] → location[i+1]
    // When moving a location, the segment "leading to" it should move with it
    const newCustomDrawEnabled = [...customDrawEnabled];
    const newLockedSegments = [...lockedSegments];
    const newModes = [...legModes];

    // If dragging from index 0, no incoming segment to move
    // If dragging to a position, segment properties follow the location
    if (draggedIndex > 0) {
      // The segment leading TO the dragged location (at index draggedIndex-1)
      const segmentIndex = draggedIndex - 1;
      const newSegmentIndex = dropIndex > 0 ? dropIndex - 1 : 0;

      // Use same splice logic as locations
      const [movedMode] = newModes.splice(segmentIndex, 1);
      newModes.splice(newSegmentIndex, 0, movedMode);

      const [movedDraw] = newCustomDrawEnabled.splice(segmentIndex, 1);
      newCustomDrawEnabled.splice(newSegmentIndex, 0, movedDraw);

      const [movedLock] = newLockedSegments.splice(segmentIndex, 1);
      newLockedSegments.splice(newSegmentIndex, 0, movedLock);
    }

    setLocations(newLocations);
    setLegModes(newModes);
    setCustomDrawEnabled(newCustomDrawEnabled);
    setLockedSegments(newLockedSegments);

    // Notify parent
    if (onLocationsChange) {
      onLocationsChange(newLocations, 'REORDER_LOCATION');
    }
    if (onLegModesChange) {
      onLegModesChange(newModes);
    }

    // Don't calculate route here - let DirectionsPanel's useEffect handle it
    // This avoids race conditions from duplicate calculations
    // DirectionsPanel will detect the location/mode changes and recalculate

    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [
    draggedIndex,
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

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  return {
    draggedIndex,
    dragOverIndex,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd
  };
};
