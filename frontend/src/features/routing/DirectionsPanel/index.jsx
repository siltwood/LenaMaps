import React, { useState, useEffect, useCallback, useRef } from 'react';
import LocationSearch from '../../location-search/LocationSearch';
import DirectionsHeader from './DirectionsHeader';
import { getLocationLabel } from '../../../utils/routeCalculations';
import TRANSPORTATION_MODES from '../../../constants/transportationModes';
import { generateShareableURL, copyToClipboard } from '../../../utils/shareUtils';
import { saveRoute } from '../../../utils/savedRoutesUtils';
import { SaveRouteModal } from '../../saved-routes/SaveRouteModal';
import { SavedRoutesModal } from '../../saved-routes/SavedRoutesModal';
import CustomRouteDrawer from '../../map/GoogleMap/components/CustomRouteDrawer';
import { COLORS, FONT_SIZES, COMPACT_SPACING } from '../../../constants/uiConstants';
import { useRouteSegments, useDragAndDrop, useRouteActions } from '../hooks';
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
  isAnimating = false,
  // DEPRECATED PROPS - Will be removed after refactor
  waypoints = [],
  waypointModes = [],
  onWaypointsChange,
  onWaypointModesChange,
  locations: propsLocations = [null, null],
  legModes: propsLegModes = ['walk'],
  onLocationsChange,
  onLegModesChange
}) => {
  const [transportationModes] = useState(TRANSPORTATION_MODES);
  const [isMinimized, setIsMinimized] = useState(false); // Start open
  const [activeInput, setActiveInput] = useState(null); // Track which input is active
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSavedRoutesModal, setShowSavedRoutesModal] = useState(false);
  const [expandedWaypoints, setExpandedWaypoints] = useState([]);

  // NEW: DirectionsPanel now owns ALL route state internally
  const [locations, setLocations] = useState(propsLocations);
  const [legModes, setLegModes] = useState(propsLegModes);
  const [customDrawEnabled, setCustomDrawEnabled] = useState([]);
  // Removed: snapToRoads, customPoints (draw mode now = simple straight line)
  const [lockedSegments, setLockedSegments] = useState([]);

  const prevClickedLocationRef = useRef(null);
  const isEditingRef = useRef(false);
  const lastRouteIdRef = useRef(null);

  // Sync with prop changes (for shared routes and loaded routes)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Only update if props actually changed (deep comparison to avoid loops)
    const locationsChanged = JSON.stringify(propsLocations) !== JSON.stringify(locations);
    const modesChanged = JSON.stringify(propsLegModes) !== JSON.stringify(legModes);

    if (locationsChanged) {
      setLocations(propsLocations);
    }

    if (modesChanged) {
      setLegModes(propsLegModes);
    }
  }, [propsLocations, propsLegModes]);

  // ============================================================================
  // ROUTE SEGMENTS - Use custom hook
  // ============================================================================

  const { routeSegments, uiLocations, uiModes, buildSegments } = useRouteSegments(
    locations,
    legModes,
    customDrawEnabled,
    lockedSegments
  );

  // Generate unique ID for segments
  const generateSegmentId = () => `seg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // ============================================================================
  // ROUTE ACTIONS - Use custom hook
  // ============================================================================

  const {
    addNextLegToSegments: addNextLegAction,
    updateSegmentMode,
    toggleSegmentDrawMode,
    updateLocation,
    removeLocation,
    handleReset
  } = useRouteActions({
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
  });

  // Wrapper to clear active input when adding next leg
  const addNextLegToSegments = useCallback(() => {
    setActiveInput(null); // Clear active input - user is adding a new leg, not editing
    addNextLegAction();
  }, [addNextLegAction]);

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
          routeId: `${Date.now()}-${routeSegments.map(s => s.id).join('-')}` // Add timestamp for uniqueness in RouteSegmentManager
        };
        onDirectionsCalculated(routeData);
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
  }, [routeSegments, uiLocations, uiModes, buildSegments, onDirectionsCalculated]);

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
      // Check if this location is part of a segment with custom drawing enabled
      const isEndOfDrawSegment = activeInput > 0 && customDrawEnabled[activeInput - 1];
      const isStartOfDrawSegment = activeInput < uiLocations.length - 1 && customDrawEnabled[activeInput];

      if (isEndOfDrawSegment || isStartOfDrawSegment) {
        // In draw mode - add this as a point to the custom route
        const segmentIndex = isEndOfDrawSegment ? activeInput - 1 : activeInput;
        const point = { lat: clickedLocation.lat, lng: clickedLocation.lng };

        // Add this point to customPoints (this saves to undo)
        handlePointAdded({
          segmentIndex,
          point
        });

        // Update the location marker
        updateLocation(activeInput, clickedLocation);
      } else {
        // Normal mode - just update the location
        updateLocation(activeInput, clickedLocation);
      }

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


  // ============================================================================
  // DRAG AND DROP - Use custom hook
  // ============================================================================

  const {
    draggedIndex,
    dragOverIndex,
    handleDragStart,
    handleDragOver,
    handleDrop
  } = useDragAndDrop({
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
  });

  // removeLocation and handleReset are now provided by useRouteActions hook

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

    // Restore custom drawing state with backward compatibility
    setCustomDrawEnabled(route.customDrawEnabled || []);
    setLockedSegments(route.lockedSegments || []);

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
          routeId: `loaded_${Date.now()}`
        };

        onDirectionsCalculated(routeData);
      }, 100);
    }
  }, [onLocationsChange, onLegModesChange, onDirectionsCalculated, buildSegments]);

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

  // STUBS: No longer needed for simple straight line draw mode
  const handlePointAdded = () => {}; // Draw mode = straight line, no waypoints to add
  const handleUndoPoint = () => {}; // No waypoints to undo

  const handleSetLocations = (segmentIndex, startPoint, endPoint) => {
    // Auto-set locations from the drawn points
    const newLocations = [...locations];

    // Set both locations (simple draw mode)
    if (startPoint !== null) {
      newLocations[segmentIndex] = startPoint;
    }
    if (endPoint !== null) {
      newLocations[segmentIndex + 1] = endPoint;
    }

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
          gap: '4px',
          marginBottom: '8px',
          justifyContent: 'flex-start'
        }}>
          {/* Clear/Reset button */}
          <button
            onClick={() => {
              handleReset();
              // Clear the route on the map
              if (onDirectionsCalculated) {
                onDirectionsCalculated({
                  routeId: 'empty',
                  allLocations: [],
                  allModes: []
                });
              }
            }}
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
            <div
              key={index}
              draggable={location !== null}
              onDragStart={(e) => location && handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={() => {
                setDraggedIndex(null);
                setDragOverIndex(null);
              }}
              style={{
                opacity: draggedIndex === index ? 0.5 : 1,
                border: dragOverIndex === index ? '2px dashed #3b82f6' : 'none',
                borderRadius: '4px',
                transition: 'all 0.2s'
              }}
            >
              <div className={`input-group ${!location && index === uiLocations.findIndex(l => !l) ? 'awaiting-click' : ''} ${activeInput === index ? 'awaiting-input' : ''}`}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Location {getLocationLabel(index)}</span>
                  {location && (
                    <span style={{
                      cursor: 'grab',
                      fontSize: '18px',
                      opacity: 0.6,
                      padding: '0 4px',
                      userSelect: 'none'
                    }}>☰</span>
                  )}
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

                        // Add this point to customPoints (this saves to undo)
                        handlePointAdded({
                          segmentIndex,
                          point
                        });

                        // Update the location marker
                        updateLocation(index, loc);
                      } else {
                        // Normal mode - just update the location
                        updateLocation(index, loc);
                      }

                      isEditingRef.current = false;
                      setActiveInput(null); // Clear active input
                    }}
                    placeholder=""
                  />
                ) : activeInput === index ? (
                  // Edit mode - show LocationSearch component to allow typing/searching
                  <div style={{ position: 'relative' }}>
                    <LocationSearch
                      onLocationSelect={(loc) => {
                        // Check if this location is part of a segment with custom drawing enabled
                        const isEndOfDrawSegment = index > 0 && customDrawEnabled[index - 1];
                        const isStartOfDrawSegment = index < uiLocations.length - 1 && customDrawEnabled[index];

                        if (isEndOfDrawSegment || isStartOfDrawSegment) {
                          // In draw mode - add this as a point to the custom route
                          const segmentIndex = isEndOfDrawSegment ? index - 1 : index;
                          const point = { lat: loc.lat, lng: loc.lng };

                          // Add this point to customPoints (this saves to undo)
                          handlePointAdded({
                            segmentIndex,
                            point
                          });

                          // Update the location marker
                          updateLocation(index, loc);
                        } else {
                          // Normal mode - just update the location
                          updateLocation(index, loc);
                        }

                        setActiveInput(null);
                      }}
                      placeholder=""
                      autoFocus={true}
                      defaultValue={location.name || location.address || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
                    />
                    <div style={{ fontSize: FONT_SIZES.xs, marginTop: COMPACT_SPACING.sm, color: COLORS.primary, fontStyle: 'italic' }}>
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
                    {locations.filter(loc => loc !== null).length > 2 && (
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
                        ferry: 'Ferry',
                        flight: 'Flight'
                      };
                      const isActive = uiModes[index] === mode;
                      if (mode === 'ferry') {
                      }
                      return (
                        <button
                          key={mode}
                          className={`mode-button compact ${isActive ? 'active' : ''}`}
                          onClick={() => {
                            updateSegmentMode(index, mode);
                          }}
                          title={modeLabels[mode]}
                          style={{
                            backgroundColor: isActive ? config.color : 'transparent',
                            borderColor: config.color,
                            color: isActive ? 'white' : config.color
                          }}
                        >
                          <span className="mode-icon">{config.icon}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom drawing toggles */}
                  <div style={{ marginTop: COMPACT_SPACING.sm, display: 'flex', flexDirection: 'column', gap: COMPACT_SPACING.sm }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: COMPACT_SPACING.sm,
                      fontSize: FONT_SIZES.xs,
                      color: COLORS.textPrimary,
                      cursor: lockedSegments[index] ? 'not-allowed' : 'pointer',
                      opacity: lockedSegments[index] ? 0.6 : 1
                    }}>
                      <input
                        type="checkbox"
                        checked={customDrawEnabled[index] || false}
                        disabled={lockedSegments[index]}
                        onChange={() => toggleSegmentDrawMode(index)}
                        style={{ cursor: lockedSegments[index] ? 'not-allowed' : 'pointer' }}
                      />
                      <span>
                        Draw Custom Route
                        {lockedSegments[index] && ' (Locked)'}
                      </span>
                    </label>
                  </div>

                  {/* Waypoint UI removed - draw mode now uses simple straight lines */}
                </div>
              )}

            </div>
          ))}

          {/* Drop zone for end position (after last location) */}
          {draggedIndex !== null && (
            <div
              onDragOver={(e) => handleDragOver(e, uiLocations.length)}
              onDrop={(e) => handleDrop(e, uiLocations.length)}
              style={{
                minHeight: '40px',
                border: dragOverIndex === uiLocations.length ? '2px dashed #3b82f6' : '2px dashed transparent',
                borderRadius: '4px',
                margin: '8px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: dragOverIndex === uiLocations.length ? '#eff6ff' : 'transparent',
                transition: 'all 0.2s',
                fontSize: '12px',
                color: '#6b7280'
              }}
            >
              {dragOverIndex === uiLocations.length && 'Drop here to move to end'}
            </div>
          )}

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
    {map && customDrawEnabled.map((isEnabled, index) => {
      // Only render drawer if draw mode is enabled for this segment
      if (!isEnabled) return null;

      return (
        <CustomRouteDrawer
          key={`drawer-${index}`}
          map={map}
          startLocation={locations[index]}
          endLocation={locations[index + 1]}
          mode={legModes[index] || 'walk'}
          isEnabled={customDrawEnabled[index]}
        />
      );
    })}
    </>
  );
};

export default DirectionsPanel;
