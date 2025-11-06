import { useState, useCallback } from 'react';

/**
 * Custom hook for managing undo history for route planning state
 * Mirrors the data arrays to enable simple undo/redo
 */
export const useRouteUndo = () => {
  const [undoHistory, setUndoHistory] = useState([]);

  /**
   * Save current state to undo history (called BEFORE making changes)
   */
  const saveToHistory = useCallback((state) => {
    // Deep copy customPoints (object with array values)
    const customPointsCopy = {};
    if (state.customPoints) {
      for (const key in state.customPoints) {
        customPointsCopy[key] = [...state.customPoints[key]];
      }
    }

    const snapshot = {
      locations: [...state.locations],
      legModes: [...state.legModes],
      customDrawEnabled: state.customDrawEnabled ? [...state.customDrawEnabled] : [],
      snapToRoads: state.snapToRoads ? [...state.snapToRoads] : [],
      customPoints: customPointsCopy,
      lockedSegments: state.lockedSegments ? [...state.lockedSegments] : []
    };

    setUndoHistory(prev => {
      const newHistory = [...prev, snapshot];
      return newHistory.slice(-50); // Limit to last 50 states
    });
  }, []);

  /**
   * Undo last action - returns the previous snapshot
   */
  const undo = useCallback(() => {
    if (undoHistory.length === 0) return null;

    const previousSnapshot = undoHistory[undoHistory.length - 1];

    // Remove from history
    setUndoHistory(prev => prev.slice(0, -1));

    return previousSnapshot;
  }, [undoHistory]);

  /**
   * Clear undo history
   */
  const clearHistory = useCallback(() => {
    setUndoHistory([]);
  }, []);

  return {
    undoHistory,
    saveToHistory,
    undo,
    clearHistory,
    canUndo: undoHistory.length > 0
  };
};
