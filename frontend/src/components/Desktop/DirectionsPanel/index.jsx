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
  waypoints = [],
  waypointModes = [],
  onWaypointsChange,
  onWaypointModesChange,
  locations = [null, null],
  legModes = ['walk'],
  onLocationsChange,
  onLegModesChange,
  onUndo,
  onClear,
  onClearHistory,
  canUndo = false,
  isEditing = false,
  editingTrip = null,
  lastAction = null,
  map
}) => {
  const [transportationModes] = useState(TRANSPORTATION_MODES);
  const [isMinimized, setIsMinimized] = useState(false); // Start open
  const [activeInput, setActiveInput] = useState(null); // Track which input is active
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSavedRoutesModal, setShowSavedRoutesModal] = useState(false);
  const [customDrawEnabled, setCustomDrawEnabled] = useState([]); // Track which segments have custom drawing enabled
  const [snapToRoads, setSnapToRoads] = useState([]); // Track snap-to-roads for each segment
  const [customPoints, setCustomPoints] = useState({}); // Store clicked points per segment
  const [lockedSegments, setLockedSegments] = useState([]); // Track which segments are locked (can't change draw mode)
  const prevClickedLocationRef = useRef(null);
  const isEditingRef = useRef(false);

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

  // Helper function to build segments with custom path data (memoized to prevent unnecessary rerenders)
  const buildSegments = useCallback((filledLocations) => {
    console.log('BUILD SEGMENTS called with:');
    console.log('  filledLocations length:', filledLocations.length);
    console.log('  customDrawEnabled:', customDrawEnabled);
    console.log('  customDrawEnabled as array:', Array.from(customDrawEnabled));

    const segments = [];
    for (let i = 0; i < filledLocations.length - 1; i++) {
      const isCustom = customDrawEnabled[i] === true;
      console.log(`  Segment ${i}: customDrawEnabled[${i}]=${customDrawEnabled[i]}, isCustom=${isCustom}`);

      if (isCustom) {
        // Custom segment
        const segment = {
          mode: legModes[i] || 'walk',
          startIndex: i,
          endIndex: i + 1,
          isCustom: true
        };

        // Add custom path if available
        if (customPoints[i] && customPoints[i].length > 0) {
          const pathPoints = [];
          if (i > 0 && filledLocations[i]) {
            pathPoints.push(filledLocations[i]);
          }
          pathPoints.push(...customPoints[i]);
          segment.customPath = pathPoints;
        }

        console.log(`  Built custom segment ${i}:`, segment);
        segments.push(segment);
      } else {
        // Regular segment
        const segment = {
          mode: legModes[i] || 'walk',
          startIndex: i,
          endIndex: i + 1,
          isCustom: false  // Explicitly set to false
        };
        console.log(`  Built regular segment ${i}:`, segment);
        segments.push(segment);
      }
    }
    return segments;
  }, [customDrawEnabled, legModes, customPoints]);

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
      console.log('CLICKED LOCATION EFFECT: Skipping - same location as previous');
      return; // Don't process the same location twice
    }

    console.log('CLICKED LOCATION EFFECT:');
    console.log('  Clicked location:', clickedLocation);
    console.log('  Current locations:', locations.map((l, i) => `${i}: ${l ? 'SET' : 'NULL'}`));
    console.log('  Active input:', activeInput);
    console.log('  customDrawEnabled:', customDrawEnabled);

    // Check if any draw mode is currently active
    const isAnyDrawModeActive = customDrawEnabled.some((enabled, idx) => {
      const hasEmptyLocationsAhead = locations.slice(idx + 1).some(loc => loc === null);
      return enabled && !hasEmptyLocationsAhead;
    });
    console.log('  Is any draw mode active?', isAnyDrawModeActive);

    if (isAnyDrawModeActive) {
      console.log('  SKIPPING: Draw mode is active, CustomRouteDrawer should handle this click');
      return;
    }

    prevClickedLocationRef.current = clickedLocation;

    const newLocations = [...locations];

    // If there's an active input (edit mode), replace that specific location
    if (activeInput !== null && activeInput !== undefined) {
      console.log('  EDIT MODE: Replacing location at index', activeInput);
      newLocations[activeInput] = clickedLocation;
      setActiveInput(null);
    } else {
      // Otherwise, find the first empty slot
      const emptyIndex = newLocations.findIndex(loc => !loc);
      console.log('  NORMAL MODE: Empty index found:', emptyIndex);
      if (emptyIndex !== -1) {
        console.log('  Adding location at index', emptyIndex);
        newLocations[emptyIndex] = clickedLocation;
      } else {
        console.log('  No empty slots found! Not adding location.');
      }
    }

    console.log('  Final newLocations:', newLocations.map((l, i) => `${i}: ${l ? 'SET' : 'NULL'}`));
    onLocationsChange(newLocations, 'ADD_LOCATION');

    // Auto-calculate route
    const filledLocations = newLocations.filter(loc => loc !== null);

    if (filledLocations.length >= 2) {
      const segments = buildSegments(filledLocations);
      const routeData = {
        origin: filledLocations[0],
        destination: filledLocations[filledLocations.length - 1],
        waypoints: filledLocations.slice(1, -1),
        mode: legModes[0],
        segments,
        allLocations: newLocations,
        allModes: legModes,
        customPaths: customPoints,
        routeId: filledLocations.map(loc => `${loc.lat},${loc.lng}`).join('_') + '_' + legModes.join('-')
      };
      onDirectionsCalculated(routeData);
    } else if (filledLocations.length === 1) {
      onDirectionsCalculated(null);
    }

    onLocationUsed?.();
  }, [clickedLocation, isOpen, locations, legModes, customPoints, buildSegments, onLocationsChange, onDirectionsCalculated, onLocationUsed]);

  // Recalculate route when custom draw mode is toggled (NOT when locations change - that's handled above)
  useEffect(() => {
    console.log('CUSTOM DRAW EFFECT TRIGGERED:');
    console.log('  customDrawEnabled:', customDrawEnabled);
    console.log('  customPoints:', customPoints);

    const filledLocations = locations.filter(loc => loc !== null);
    if (filledLocations.length >= 2 && onDirectionsCalculated) {
      const segments = buildSegments(filledLocations);
      console.log('  Built segments:', segments.map(s => `[${s.startIndex}→${s.endIndex}] isCustom=${s.isCustom} hasPath=${!!s.customPath}`));

      const routeData = {
        origin: filledLocations[0],
        destination: filledLocations[filledLocations.length - 1],
        waypoints: filledLocations.slice(1, -1),
        mode: legModes[0],
        segments,
        allLocations: locations,
        allModes: legModes,
        customPaths: customPoints, // Include custom points for reference
        routeId: filledLocations.map(loc => `${loc.lat},${loc.lng}`).join('_') + '_' + legModes.join('-') + '_' + customDrawEnabled.join('-')
      };
      console.log('  Calling onDirectionsCalculated with routeId:', routeData.routeId);
      onDirectionsCalculated(routeData);
    }
  }, [customDrawEnabled, legModes, onDirectionsCalculated, customPoints, buildSegments]);


  const addNextLeg = () => {
    if (onLocationsChange && onLegModesChange) {
      console.log('ADD NEXT LEG CALLED');
      console.log('  Current locations:', locations.map((l, i) => `${i}: ${l ? 'SET' : 'NULL'}`));
      console.log('  Current customDrawEnabled:', customDrawEnabled);
      console.log('  Current lockedSegments:', lockedSegments);

      // Lock the previous segment (if it was in draw mode)
      const lastSegmentIndex = locations.length - 2; // The segment we're finishing
      if (lastSegmentIndex >= 0) {
        console.log('  Locking segment at index:', lastSegmentIndex);
        // Lock this segment so it can't be toggled
        const newLockedSegments = [...lockedSegments];
        newLockedSegments[lastSegmentIndex] = true;
        setLockedSegments(newLockedSegments);

        // Keep customDrawEnabled as-is - don't disable it!
        // The custom route should remain visible and locked
      }

      // Add a new destination
      console.log('  Adding new null location');
      onLocationsChange([...locations, null], 'ADD_DESTINATION');
      // Add transportation mode for the new leg
      onLegModesChange([...legModes, 'walk']);
    }
  };

  const removeLocation = (index) => {
    if (index === 0 || index === 1) return; // Can't remove A or B
    
    if (onLocationsChange && onLegModesChange) {
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
      
      onLocationsChange(newLocations, 'REMOVE_LOCATION');
      onLegModesChange(newModes);
      
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
    }
  };

  const updateLocation = (index, location) => {
    if (onLocationsChange) {
      const newLocations = [...locations];
      newLocations[index] = location;
      // Determine action type
      const actionType = location ? 'ADD_LOCATION' : 'CLEAR_LOCATION';
      onLocationsChange(newLocations, actionType);

      // Auto-calculate route or show marker for single location
      const filledLocations = newLocations.filter(loc => loc !== null);
      if (filledLocations.length >= 1) {
        if (filledLocations.length >= 2) {
          // Multiple locations - create route with custom drawing support
          const segments = buildSegments(filledLocations);
          const routeData = {
            origin: filledLocations[0],
            destination: filledLocations[filledLocations.length - 1],
            waypoints: filledLocations.slice(1, -1),
            mode: legModes[0],
            segments,
            allLocations: newLocations, // Pass ALL locations including nulls
            allModes: legModes,
            customPaths: customPoints,
            routeId: filledLocations.map(loc => `${loc.lat},${loc.lng}`).join('_') + '_' + legModes.join('-')
          };
          onDirectionsCalculated(routeData);
        } else {
          // Single location - don't calculate route, just let the marker show
          onDirectionsCalculated(null);
        }
      } else {
        // No locations - clear everything
        onDirectionsCalculated(null);
      }
    }
  };

  const updateLegMode = (index, mode) => {
    if (onLegModesChange) {
      const newModes = [...legModes];
      newModes[index] = mode;
      onLegModesChange(newModes, index); // Pass index for action tracking
      
      // Update the route data immediately with new modes (visual update only)
      const filledLocations = locations.filter(loc => loc !== null);
      if (filledLocations.length === 1) {
        // Single location - don't calculate route, just let the marker show
        // The marker will be handled by RouteSegmentManager
      } else if (filledLocations.length >= 2 && onDirectionsCalculated) {
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
    if (onLocationsChange && onLegModesChange) {
      onLocationsChange([null, null], null); // Don't track this in history
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
    
    onLocationsChange(loadedLocations, 'load_route');
    onLegModesChange(route.modes);
    
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
  }, [onLocationsChange, onLegModesChange, onDirectionsCalculated, customPoints]);

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

  const handlePointAdded = (pointData) => {
    const { segmentIndex, point } = pointData;
    console.log('HANDLE POINT ADDED:');
    console.log('  Segment index:', segmentIndex);
    console.log('  Point:', point);
    console.log('  Current locations:', locations.map((l, i) => `${i}: ${l ? 'SET' : 'NULL'}`));
    console.log('  Current customPoints:', customPoints);

    // Add point to the customPoints state
    setCustomPoints(prev => {
      const segmentPoints = prev[segmentIndex] || [];
      const newPoints = {
        ...prev,
        [segmentIndex]: [...segmentPoints, point]
      };
      console.log('  New customPoints:', newPoints);
      return newPoints;
    });
  };

  const handleUndoPoint = (segmentIndex) => {
    setCustomPoints(prev => {
      const segmentPoints = prev[segmentIndex] || [];
      if (segmentPoints.length === 0) return prev;

      // Remove the last point
      const newSegmentPoints = segmentPoints.slice(0, -1);

      // Update the end location marker to follow the undo
      if (newSegmentPoints.length > 0) {
        // Move end marker to the new last point
        const newEndPoint = newSegmentPoints[newSegmentPoints.length - 1];
        handleSetLocations(segmentIndex, null, newEndPoint);
      } else {
        // No more points - reset both markers to the same position if this is the first segment
        if (segmentIndex === 0) {
          // For segment A→B with no points, reset both A and B to null
          const newLocations = [...locations];
          newLocations[segmentIndex] = null;
          newLocations[segmentIndex + 1] = null;
          if (onLocationsChange) {
            onLocationsChange(newLocations, 'CLEAR_LOCATION');
          }
        }
      }

      if (newSegmentPoints.length === 0) {
        // No more points for this segment, remove the key
        const newPoints = { ...prev };
        delete newPoints[segmentIndex];
        return newPoints;
      }

      return {
        ...prev,
        [segmentIndex]: newSegmentPoints
      };
    });
  };

  const handleSetLocations = (segmentIndex, startPoint, endPoint) => {
    console.log('HANDLE SET LOCATIONS:');
    console.log('  Segment index:', segmentIndex);
    console.log('  Start point:', startPoint ? 'SET' : 'NULL');
    console.log('  End point:', endPoint);
    console.log('  Current locations before:', locations.map((l, i) => `${i}: ${l ? 'SET' : 'NULL'}`));

    // Auto-set locations from the drawn points
    const newLocations = [...locations];

    // If startPoint is null, keep existing start location (for continuous drawing)
    if (startPoint !== null) {
      newLocations[segmentIndex] = startPoint;
    }

    // Always update end location
    newLocations[segmentIndex + 1] = endPoint;

    console.log('  New locations after:', newLocations.map((l, i) => `${i}: ${l ? 'SET' : 'NULL'}`));

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
          {/* Undo button */}
          <button
            onClick={onUndo}
            disabled={!canUndo}
            style={{
              padding: '4px 8px',
              backgroundColor: '#f3f4f6',
              color: !canUndo ? '#d1d5db' : '#374151',
              border: `1px solid ${!canUndo ? '#e5e7eb' : '#d1d5db'}`,
              borderRadius: '4px',
              fontSize: '14px',
              cursor: !canUndo ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '28px',
              height: '28px',
              opacity: !canUndo ? 0.5 : 1
            }}
            title={getUndoTooltip(lastAction)}
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
          {/* Clear/Reset button */}
          <button
            onClick={() => {
              handleReset();
              // Clear undo history
              if (onClearHistory) {
                onClearHistory();
              }
              // Also clear the route on the map
              if (onDirectionsCalculated) {
                onDirectionsCalculated({
                  routeId: 'empty',
                  allLocations: [],
                  allModes: []
                });
              }
            }}
            disabled={!(locations.some(loc => loc !== null) || canUndo)}
            style={{
              padding: '4px 8px',
              backgroundColor: '#f3f4f6',
              color: !(locations.some(loc => loc !== null) || canUndo) ? '#d1d5db' : '#374151',
              border: `1px solid ${!(locations.some(loc => loc !== null) || canUndo) ? '#e5e7eb' : '#d1d5db'}`,
              borderRadius: '4px',
              fontSize: '14px',
              cursor: !(locations.some(loc => loc !== null) || canUndo) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '28px',
              height: '28px',
              opacity: !(locations.some(loc => loc !== null) || canUndo) ? 0.5 : 1
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
            disabled={!locations.some(loc => loc !== null)}
            style={{
              padding: '4px 8px',
              backgroundColor: '#f3f4f6',
              color: !locations.some(loc => loc !== null) ? '#d1d5db' : '#374151',
              border: `1px solid ${!locations.some(loc => loc !== null) ? '#e5e7eb' : '#d1d5db'}`,
              borderRadius: '4px',
              fontSize: '14px',
              cursor: !locations.some(loc => loc !== null) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '28px',
              height: '28px',
              opacity: !locations.some(loc => loc !== null) ? 0.5 : 1
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
            disabled={!directionsRoute || locations.filter(l => l !== null).length < 2}
            style={{
              padding: '4px 8px',
              backgroundColor: '#f3f4f6',
              color: (!directionsRoute || locations.filter(l => l !== null).length < 2) ? '#d1d5db' : '#374151',
              border: `1px solid ${(!directionsRoute || locations.filter(l => l !== null).length < 2) ? '#e5e7eb' : '#d1d5db'}`,
              borderRadius: '4px',
              fontSize: '14px',
              cursor: (!directionsRoute || locations.filter(l => l !== null).length < 2) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '28px',
              height: '28px',
              opacity: (!directionsRoute || locations.filter(l => l !== null).length < 2) ? 0.5 : 1
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
          {/* Display all locations in sequence */}
          {locations.map((location, index) => (
            <div key={index}>
              <div className={`input-group ${!location && index === locations.findIndex(l => !l) ? 'awaiting-click' : ''} ${activeInput === index ? 'awaiting-input' : ''}`}>
                <label>
                  Location {getLocationLabel(index)}
                </label>
                {!location ? (
                  <LocationSearch
                    onLocationSelect={(loc) => {
                      // Check if this location is part of a segment with custom drawing enabled
                      const isEndOfDrawSegment = index > 0 && customDrawEnabled[index - 1];
                      const isStartOfDrawSegment = index < locations.length - 1 && customDrawEnabled[index];

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

                      // Recenter map on first location (Point A)
                      if (index === 0 && map && loc) {
                        map.panTo({ lat: loc.lat, lng: loc.lng });
                        // Optionally set a reasonable zoom level if needed
                        if (map.getZoom() < 13) {
                          map.setZoom(13);
                        }
                      }
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

                        // Recenter map on the new location
                        if (map && loc) {
                          map.panTo({ lat: loc.lat, lng: loc.lng });
                          if (map.getZoom() < 13) {
                            map.setZoom(13);
                          }
                        }
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
              {index < locations.length - 1 && (
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
                          className={`mode-button compact ${legModes[index] === mode ? 'active' : ''}`}
                          onClick={() => updateLegMode(index, mode)}
                          title={modeLabels[mode]}
                          style={{
                            backgroundColor: legModes[index] === mode ? config.color : 'transparent',
                            borderColor: config.color,
                            color: legModes[index] === mode ? 'white' : config.color
                          }}
                        >
                          <span className="mode-icon">{config.icon}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom drawing toggles */}
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: lockedSegments[index] ? 'not-allowed' : 'pointer', opacity: lockedSegments[index] ? 0.5 : 1 }}>
                      <input
                        type="checkbox"
                        checked={customDrawEnabled[index] || false}
                        disabled={lockedSegments[index] || false}
                        onChange={(e) => {
                          console.log('DRAW MODE TOGGLE:');
                          console.log('  Segment index:', index);
                          console.log('  Checked:', e.target.checked);
                          console.log('  Current locations:', locations.map((l, i) => `${i}: ${l ? 'SET' : 'NULL'}`));
                          console.log('  Current customDrawEnabled:', customDrawEnabled);

                          // Create a proper array with explicit false values (not sparse array)
                          const newEnabled = [];
                          for (let i = 0; i < locations.length - 1; i++) {
                            newEnabled[i] = customDrawEnabled[i] === true ? true : false;
                          }
                          newEnabled[index] = e.target.checked;

                          console.log('  New customDrawEnabled:', newEnabled);
                          setCustomDrawEnabled(newEnabled);

                          // If enabling draw mode on a segment with both start and end locations
                          // Create initial straight-line points
                          if (e.target.checked && locations[index] && locations[index + 1]) {
                            console.log('  Enabling draw mode with existing locations - creating straight line');
                            const startLoc = locations[index];
                            const endLoc = locations[index + 1];

                            // Create two points: start and end (straight line)
                            const straightLinePoints = [
                              { lat: startLoc.lat, lng: startLoc.lng },
                              { lat: endLoc.lat, lng: endLoc.lng }
                            ];

                            console.log('  Setting initial points:', straightLinePoints);
                            setCustomPoints(prev => ({
                              ...prev,
                              [index]: straightLinePoints
                            }));
                          } else if (!e.target.checked) {
                            // Clear custom points if disabling
                            console.log('  Disabling draw mode - clearing custom points');
                            const newPoints = { ...customPoints };
                            delete newPoints[index];
                            setCustomPoints(newPoints);
                          }
                        }}
                        style={{ cursor: lockedSegments[index] ? 'not-allowed' : 'pointer' }}
                      />
                      <span>Draw Custom Route {lockedSegments[index] ? '(Locked)' : ''}</span>
                    </label>

                    {/* Snap to roads toggle - only show if custom drawing is enabled */}
                    {customDrawEnabled[index] && (
                      <>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', marginLeft: '20px' }}>
                          <input
                            type="checkbox"
                            checked={snapToRoads[index] || false}
                            onChange={(e) => {
                              const newSnap = [...snapToRoads];
                              newSnap[index] = e.target.checked;
                              setSnapToRoads(newSnap);
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <span>Snap to Roads</span>
                        </label>

                        {/* Clear/Undo buttons for custom points */}
                        {customPoints[index] && customPoints[index].length > 0 && (
                          <div style={{ display: 'flex', gap: '6px', marginLeft: '20px', marginTop: '4px' }}>
                            <button
                              onClick={() => handleUndoPoint(index)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                backgroundColor: '#f3f4f6',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                              title="Undo last point"
                            >
                              ↩️ Undo Point ({customPoints[index].length})
                            </button>
                            <button
                              onClick={() => {
                                const newPoints = { ...customPoints };
                                delete newPoints[index];
                                setCustomPoints(newPoints);
                              }}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                backgroundColor: '#fee2e2',
                                border: '1px solid #fecaca',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                              title="Clear all points"
                            >
                              🗑️ Clear All
                            </button>
                          </div>
                        )}
                      </>
                    )}
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
              addNextLeg();
            }}
            type="button"
          >
            <span>➕ Add Next Location ({getLocationLabel(locations.length)})</span>
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

      {/* Custom Route Drawers - ALWAYS render to keep polylines visible during animation */}
    {map && locations.map((_, index) => {
      if (index >= locations.length - 1) return null; // No drawer for last location
      if (!customDrawEnabled[index]) return null; // Only render if drawing is enabled

      // Check if there are any empty locations after this segment's end point
      // If so, disable the drawer so normal clicking can fill those locations
      const hasEmptyLocationsAhead = locations.slice(index + 1).some(loc => loc === null);
      const shouldEnableDrawer = customDrawEnabled[index] && !hasEmptyLocationsAhead;

      console.log(`CustomRouteDrawer ${index}: customDrawEnabled=${customDrawEnabled[index]}, hasEmptyLocationsAhead=${hasEmptyLocationsAhead}, shouldEnableDrawer=${shouldEnableDrawer}`);

      return (
        <CustomRouteDrawer
          key={`drawer-${index}`}
          map={map}
          segmentIndex={index}
          isEnabled={shouldEnableDrawer}
          snapToRoads={snapToRoads[index] || false}
          mode={legModes[index] || 'walk'}
          onPointAdded={handlePointAdded}
          onSetLocations={handleSetLocations}
          previousLocation={index > 0 ? locations[index] : null}
          points={customPoints[index] || []}
        />
      );
    })}

    {/* ALSO render a drawer even with NO locations if draw mode is enabled */}
    {map && customDrawEnabled[0] && locations.filter(l => l).length === 0 && (
      <CustomRouteDrawer
        key="drawer-initial"
        map={map}
        segmentIndex={0}
        isEnabled={true}
        snapToRoads={snapToRoads[0] || false}
        mode={legModes[0] || 'walk'}
        onPointAdded={handlePointAdded}
        onSetLocations={handleSetLocations}
        previousLocation={null}
        points={customPoints[0] || []}
      />
    )}
    </>
  );
};

export default DirectionsPanel;
