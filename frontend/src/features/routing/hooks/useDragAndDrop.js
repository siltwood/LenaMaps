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

    // Reorder segment properties using same splice logic
    const newCustomDrawEnabled = [...customDrawEnabled];
    const newLockedSegments = [...lockedSegments];
    const newModes = [...legModes];

    // Handle segment reordering
    // When dragging from index 0, there's no "incoming" segment to move
    if (draggedIndex > 0) {
      // Extract the segment that was "leading to" the dragged location
      const sourceSegmentIndex = draggedIndex - 1;
      const targetSegmentIndex = dropIndex > 0 ? dropIndex - 1 : 0;

      // Move segment properties
      const [movedDraw] = newCustomDrawEnabled.splice(sourceSegmentIndex, 1);
      newCustomDrawEnabled.splice(targetSegmentIndex, 0, movedDraw);

      const [movedLock] = newLockedSegments.splice(sourceSegmentIndex, 1);
      newLockedSegments.splice(targetSegmentIndex, 0, movedLock);

      const [movedMode] = newModes.splice(sourceSegmentIndex, 1);
      newModes.splice(targetSegmentIndex, 0, movedMode);
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

    // Recalculate route with new order
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
        routeId: `reorder_${Date.now()}`
      };
      onDirectionsCalculated(routeData);
    }

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
