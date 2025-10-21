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
  const [position, setPosition] = useState({ x: 10, y: 200 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false); // Start open
  const [activeInput, setActiveInput] = useState(null); // Track which input is active
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSavedRoutesModal, setShowSavedRoutesModal] = useState(false);
  const [customDrawEnabled, setCustomDrawEnabled] = useState([]); // Track which segments have custom drawing enabled
  const [snapToRoads, setSnapToRoads] = useState([]); // Track snap-to-roads for each segment
  const [customStrokes, setCustomStrokes] = useState({}); // Store custom strokes per segment
  const panelRef = useRef(null);

  // Store position before minimizing
  const savedPositionRef = useRef(null);


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

  // Handle clicked location from map
  useEffect(() => {
    if (clickedLocation && isOpen) {
      if (onLocationsChange) {
        const newLocations = [...locations];
        
        // If there's an active input (edit mode), replace that specific location
        if (activeInput !== null && activeInput !== undefined) {
          newLocations[activeInput] = clickedLocation;
          // Clear active input to exit edit mode and show the updated location
          setActiveInput(null);
        } else {
          // Otherwise, find the first empty slot
          const emptyIndex = newLocations.findIndex(loc => !loc);
          if (emptyIndex !== -1) {
            newLocations[emptyIndex] = clickedLocation;
          }
        }
        onLocationsChange(newLocations, 'ADD_LOCATION');
        
        // Don't center or zoom map when placing first marker
        
        // Auto-calculate route or show marker for single location
        const filledLocations = newLocations.filter(loc => loc !== null);
        if (filledLocations.length >= 1) {
          
          if (filledLocations.length >= 2) {
            // Multiple locations - create route
            const segments = [];
            for (let i = 0; i < filledLocations.length - 1; i++) {
              segments.push({
                mode: legModes[i] || 'walk',
                startIndex: i,
                endIndex: i + 1
              });
            }
            const routeData = {
              origin: filledLocations[0],
              destination: filledLocations[filledLocations.length - 1],
              waypoints: filledLocations.slice(1, -1),
              mode: legModes[0],
              segments,
              allLocations: newLocations, // Pass ALL locations including nulls
              allModes: legModes,
              // Add a stable ID based on locations
              routeId: filledLocations.map(loc => `${loc.lat},${loc.lng}`).join('_') + '_' + legModes.join('-')
            };
            onDirectionsCalculated(routeData);
          } else {
            // Single location - don't calculate route, just let the marker show
            onDirectionsCalculated(null);
          }
        }
      }
      
      // Notify parent that location was used
      if (onLocationUsed) {
        onLocationUsed();
      }
    }
  }, [clickedLocation, activeInput, isOpen, locations, onLocationsChange, onLocationUsed, onDirectionsCalculated, legModes]);
  
  // Removed auto-recalculate on mode change to prevent annoying re-renders


  const addNextLeg = () => {
    if (onLocationsChange && onLegModesChange) {
      // Add a new destination
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
        const segments = [];
        for (let i = 0; i < filledLocations.length - 1; i++) {
          segments.push({
            mode: newModes[i] || 'walk',
            startIndex: i,
            endIndex: i + 1
          });
        }
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
          // Multiple locations - create route
          const segments = [];
          for (let i = 0; i < filledLocations.length - 1; i++) {
            segments.push({
              mode: legModes[i] || 'walk',
              startIndex: i,
              endIndex: i + 1
            });
          }
          const routeData = {
            origin: filledLocations[0],
            destination: filledLocations[filledLocations.length - 1],
            waypoints: filledLocations.slice(1, -1),
            mode: legModes[0],
            segments,
            allLocations: newLocations, // Pass ALL locations including nulls
            allModes: legModes,
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
        const segments = [];
        for (let i = 0; i < filledLocations.length - 1; i++) {
          segments.push({
            mode: newModes[i] || 'walk',
            startIndex: i,
            endIndex: i + 1
          });
        }
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
        const segments = [];
        for (let i = 0; i < route.locations.length - 1; i++) {
          segments.push({
            mode: route.modes[i] || 'walk',
            startIndex: i,
            endIndex: i + 1
          });
        }
        
        const routeData = {
          origin: route.locations[0],
          destination: route.locations[route.locations.length - 1],
          waypoints: route.locations.slice(1, -1),
          mode: route.modes[0] || 'walk',
          segments,
          allLocations: route.locations,
          allModes: route.modes,
          routeId: `loaded_${Date.now()}`
        };
        
        onDirectionsCalculated(routeData);
      }, 100);
    }
  }, [onLocationsChange, onLegModesChange, onDirectionsCalculated]);

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

  const handleStrokeComplete = (strokeData) => {
    const { segmentIndex, points, snapped, mode } = strokeData;

    // Add stroke to the customStrokes state
    setCustomStrokes(prev => {
      const segmentStrokes = prev[segmentIndex] || [];
      return {
        ...prev,
        [segmentIndex]: [...segmentStrokes, { points, snapped, mode }]
      };
    });

    // Notify parent of the action for undo tracking
    // This allows the parent's undo system to track custom drawing actions
    if (onLocationsChange) {
      // We use the existing onLocationsChange callback to notify the parent
      // The action type 'DRAW_CUSTOM_STROKE' can be handled by the parent
      onLocationsChange(locations, 'DRAW_CUSTOM_STROKE', {
        segmentIndex,
        stroke: { points, snapped, mode }
      });
    }
  };

  const handleUndoStroke = (segmentIndex) => {
    setCustomStrokes(prev => {
      const segmentStrokes = prev[segmentIndex] || [];
      if (segmentStrokes.length === 0) return prev;

      // Remove the last stroke
      const newSegmentStrokes = segmentStrokes.slice(0, -1);

      if (newSegmentStrokes.length === 0) {
        // No more strokes for this segment, remove the key
        const newStrokes = { ...prev };
        delete newStrokes[segmentIndex];
        return newStrokes;
      }

      return {
        ...prev,
        [segmentIndex]: newSegmentStrokes
      };
    });
  };

  const handleSetLocations = (startPoint, endPoint) => {
    // Auto-set Point A and Point B from the drawn stroke
    const newLocations = [...locations];

    // If startPoint is null, keep existing Point A (for continuous drawing)
    if (startPoint !== null) {
      newLocations[0] = startPoint;
    }

    // Always update Point B
    newLocations[1] = endPoint;

    if (onLocationsChange) {
      onLocationsChange(newLocations, 'ADD_LOCATION');
    }
  };

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

  const handleMinimize = () => {
    savedPositionRef.current = { ...position };
    setIsMinimized(true);
  };

  const handleExpand = () => {
    setIsMinimized(false);
    // Restore saved position if available
    if (savedPositionRef.current) {
      setPosition(savedPositionRef.current);
    }
  };

  if (!isOpen) return null;

  // Render minimized state
  if (isMinimized) {
    return (
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
          title="Visualize Your Route"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <circle cx="6" cy="6" r="3" />
            <circle cx="18" cy="18" r="3" />
            <path d="M9 9l6 6" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <>
    <div 
      className="directions-panel"
      ref={panelRef}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'auto'
      }}
      onMouseDown={handleMouseDown}
    >
      <DirectionsHeader
        isEditing={isEditing}
        editingTrip={editingTrip}
        onUndo={onUndo}
        onClear={() => {
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
        onClose={onClose}
        onMinimize={handleMinimize}
        canUndo={canUndo}
        canClear={locations.some(loc => loc !== null) || canUndo}
        getUndoTooltip={getUndoTooltip}
        lastAction={lastAction}
      />

      <div className="directions-content">
        {/* Action buttons - above Location A */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          marginBottom: '1.5rem',
          justifyContent: 'flex-start'
        }}>
          <button 
            onClick={() => setShowSavedRoutesModal(true)}
            style={{
              padding: '8px 12px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '18px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '40px',
              height: '36px'
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
          <button 
            onClick={() => setShowSaveModal(true)}
            disabled={!locations.some(loc => loc !== null)}
            style={{
              padding: '8px 12px',
              backgroundColor: '#f3f4f6',
              color: !locations.some(loc => loc !== null) ? '#d1d5db' : '#374151',
              border: `1px solid ${!locations.some(loc => loc !== null) ? '#e5e7eb' : '#d1d5db'}`,
              borderRadius: '6px',
              fontSize: '18px',
              cursor: !locations.some(loc => loc !== null) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '40px',
              height: '36px',
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
          <button 
            onClick={handleShare}
            disabled={!directionsRoute || locations.filter(l => l !== null).length < 2}
            style={{
              padding: '8px 12px',
              backgroundColor: '#f3f4f6',
              color: (!directionsRoute || locations.filter(l => l !== null).length < 2) ? '#d1d5db' : '#374151',
              border: `1px solid ${(!directionsRoute || locations.filter(l => l !== null).length < 2) ? '#e5e7eb' : '#d1d5db'}`,
              borderRadius: '6px',
              fontSize: '18px',
              cursor: (!directionsRoute || locations.filter(l => l !== null).length < 2) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '40px',
              height: '36px',
              opacity: (!directionsRoute || locations.filter(l => l !== null).length < 2) ? 0.5 : 1
            }}
            title="Share route"
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

        {/* Mode selector and draw toggle - appears BEFORE location inputs */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
            Transportation Mode:
          </label>
          <div className="mode-buttons compact">
            {Object.entries(transportationModes).filter(([mode]) => mode !== 'custom').map(([mode, config]) => (
              <button
                key={mode}
                className={`mode-button compact ${(legModes[0] || 'walk') === mode ? 'active' : ''}`}
                onClick={() => {
                  const newModes = [...legModes];
                  newModes[0] = mode;
                  onLegModesChange(newModes);
                }}
                style={{
                  backgroundColor: (legModes[0] || 'walk') === mode ? config.color : 'transparent',
                  borderColor: config.color,
                  color: (legModes[0] || 'walk') === mode ? 'white' : config.color
                }}
              >
                <span className="mode-icon">{config.icon}</span>
              </button>
            ))}
          </div>

          {/* Draw Custom Route toggle */}
          <div style={{ marginTop: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={customDrawEnabled[0] || false}
                onChange={(e) => {
                  const newEnabled = [...customDrawEnabled];
                  newEnabled[0] = e.target.checked;
                  setCustomDrawEnabled(newEnabled);

                  // Clear custom strokes if disabling
                  if (!e.target.checked) {
                    const newStrokes = { ...customStrokes };
                    delete newStrokes[0];
                    setCustomStrokes(newStrokes);
                  }
                }}
                style={{ cursor: 'pointer' }}
              />
              <span>Draw Custom Route</span>
            </label>

            {/* Snap to roads toggle */}
            {customDrawEnabled[0] && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', marginLeft: '20px', marginTop: '6px' }}>
                <input
                  type="checkbox"
                  checked={snapToRoads[0] || false}
                  onChange={(e) => {
                    const newSnap = [...snapToRoads];
                    newSnap[0] = e.target.checked;
                    setSnapToRoads(newSnap);
                  }}
                  style={{ cursor: 'pointer' }}
                />
                <span>Snap to Roads</span>
              </label>
            )}

            {/* Stroke controls */}
            {customDrawEnabled[0] && customStrokes[0] && customStrokes[0].length > 0 && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <button
                  onClick={() => handleUndoStroke(0)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    backgroundColor: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                  title="Undo last stroke"
                >
                  ↩️ Undo Stroke ({customStrokes[0].length})
                </button>
                <button
                  onClick={() => {
                    const newStrokes = { ...customStrokes };
                    delete newStrokes[0];
                    setCustomStrokes(newStrokes);
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    backgroundColor: '#fee2e2',
                    border: '1px solid #fecaca',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                  title="Clear all strokes"
                >
                  🗑️ Clear All
                </button>
              </div>
            )}

            {/* Instructions when draw mode is enabled */}
            {customDrawEnabled[0] && (!customStrokes[0] || customStrokes[0].length === 0) && (
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#1e40af'
              }}>
                💡 Click and drag on the map to draw your route. Point A will be where you start, Point B where you end.
              </div>
            )}
          </div>
        </div>

        <div className="route-inputs">
          {/* Display all locations in sequence */}
          {locations.map((location, index) => (
            <div key={index}>
              <div className={`input-group ${!location && index === locations.findIndex(l => !l) ? 'awaiting-click' : ''} ${activeInput === index ? 'awaiting-input' : ''}`}>
                <label>
                  Location {getLocationLabel(index)}
                </label>
                {!location || activeInput === index ? (
                  <LocationSearch 
                    onLocationSelect={(loc) => {
                      updateLocation(index, loc);
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
                    onFocus={() => setActiveInput(index)}
                    onBlur={() => {
                      // Only clear active input if we're not selecting a location
                      setTimeout(() => {
                        if (activeInput === index && location) {
                          setActiveInput(null);
                        }
                      }, 200);
                    }}
                    defaultValue={location?.name || location?.address || ''}
                  />
                ) : (
                  <div 
                    className={`selected-location ${activeInput === index ? 'active' : ''}`}
                    onClick={() => {
                      setActiveInput(index);
                      // Don't clear the location immediately - just mark it as active for editing
                    }}
                    style={{
                      ...(activeInput === index ? {
                        backgroundColor: '#eff6ff',
                        borderColor: '#3b82f6',
                        boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)'
                      } : {})
                    }}
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
                    {Object.entries(transportationModes).filter(([mode]) => mode !== 'custom').map(([mode, config]) => (
                      <button
                        key={mode}
                        className={`mode-button compact ${legModes[index] === mode ? 'active' : ''}`}
                        onClick={() => updateLegMode(index, mode)}
                        style={{
                          backgroundColor: legModes[index] === mode ? config.color : 'transparent',
                          borderColor: config.color,
                          color: legModes[index] === mode ? 'white' : config.color
                        }}
                      >
                        <span className="mode-icon">{config.icon}</span>
                      </button>
                    ))}
                  </div>

                  {/* Custom drawing toggles */}
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={customDrawEnabled[index] || false}
                        onChange={(e) => {
                          const newEnabled = [...customDrawEnabled];
                          newEnabled[index] = e.target.checked;
                          setCustomDrawEnabled(newEnabled);

                          // Clear custom strokes if disabling
                          if (!e.target.checked) {
                            const newStrokes = { ...customStrokes };
                            delete newStrokes[index];
                            setCustomStrokes(newStrokes);
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>Draw Custom Route</span>
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

                        {/* Clear/Undo buttons for custom strokes */}
                        {customStrokes[index] && customStrokes[index].length > 0 && (
                          <div style={{ display: 'flex', gap: '6px', marginLeft: '20px', marginTop: '4px' }}>
                            <button
                              onClick={() => handleUndoStroke(index)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                backgroundColor: '#f3f4f6',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                              title="Undo last stroke"
                            >
                              ↩️ Undo Stroke ({customStrokes[index].length})
                            </button>
                            <button
                              onClick={() => {
                                const newStrokes = { ...customStrokes };
                                delete newStrokes[index];
                                setCustomStrokes(newStrokes);
                              }}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                backgroundColor: '#fee2e2',
                                border: '1px solid #fecaca',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                              title="Clear all strokes"
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

    {/* Custom Route Drawers - one for each segment with drawing enabled */}
    {map && locations.map((_, index) => {
      if (index >= locations.length - 1) return null; // No drawer for last location
      if (!customDrawEnabled[index]) return null; // Only render if drawing is enabled

      return (
        <CustomRouteDrawer
          key={`drawer-${index}`}
          map={map}
          segmentIndex={index}
          isEnabled={customDrawEnabled[index]}
          snapToRoads={snapToRoads[index] || false}
          mode={legModes[index] || 'walk'}
          onStrokeComplete={handleStrokeComplete}
          onSetLocations={index === 0 ? handleSetLocations : null}
          previousLocation={index > 0 ? locations[index] : null}
          existingStrokes={customStrokes[index] || []}
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
        onStrokeComplete={handleStrokeComplete}
        onSetLocations={handleSetLocations}
        previousLocation={null}
        existingStrokes={customStrokes[0] || []}
      />
    )}
    </>
  );
};

export default DirectionsPanel;
