import React, { useState, useEffect, useRef, useCallback } from 'react';
import LocationSearch from '../../location-search/LocationSearch';
import TRANSPORTATION_MODES from '../../../constants/transportationModes';
import RouteAnimator from '../../animation/RouteAnimator/RouteAnimator';
import { generateShareableURL, copyToClipboard } from '../../../utils/shareUtils';
import { saveRoute } from '../../../utils/savedRoutesUtils';
import { SaveRouteModal } from '../../saved-routes/SaveRouteModal';
import { SavedRoutesModal } from '../../saved-routes/SavedRoutesModal';
import CustomRouteDrawer from '../../map/GoogleMap/components/CustomRouteDrawer';
import { useRouteUndo } from '../../../hooks/useRouteUndo';
import '../../../styles/unified-icons.css';
import './MobileControls.css';

const MobileControls = ({
  onDirectionsCalculated,
  clickedLocation,
  onLocationUsed,
  locations = [null, null],
  legModes = ['walk'],
  onLocationsChange,
  onLegModesChange,
  directionsRoute,
  onShowAnimator,
  onHideAnimator,
  isAnimating,
  showRouteAnimator,
  map,
  onAnimationStateChange
}) => {
  const [showCard, setShowCard] = useState(true);
  const [viewMode, setViewMode] = useState('planner'); // 'planner' or 'animator'
  const [showSearchInputs, setShowSearchInputs] = useState({});
  const [activeInput, setActiveInput] = useState(null); // Track which input is active for clicking
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [cardTranslateY, setCardTranslateY] = useState(0);
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);
  const [cardHeight, setCardHeight] = useState(40); // Height as vh percentage
  const initialDragHeight = useRef(40); // Store height at start of drag
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSavedRoutesModal, setShowSavedRoutesModal] = useState(false);
  const [customDrawEnabled, setCustomDrawEnabled] = useState([]); // Track which segments have custom drawing enabled
  const prevClickedLocationRef = useRef(null); // Track previous clicked location to prevent duplicates

  // Shared undo system via custom hook
  const { saveToHistory, undo, clearHistory, canUndo } = useRouteUndo();

  // Save current state to undo history (called BEFORE making changes)
  const saveToUndoHistory = useCallback(() => {
    saveToHistory({
      locations,
      legModes,
      customDrawEnabled
    });
  }, [saveToHistory, locations, legModes, customDrawEnabled]);

  // Undo last action
  const handleUndoInternal = useCallback(() => {
    const previousSnapshot = undo();
    if (!previousSnapshot) return;

    // Restore all state
    if (onLocationsChange) onLocationsChange(previousSnapshot.locations, 'UNDO');
    if (onLegModesChange) onLegModesChange(previousSnapshot.legModes);
    setCustomDrawEnabled(previousSnapshot.customDrawEnabled);
  }, [undo, onLocationsChange, onLegModesChange]);

  // Clear undo history
  const handleClearHistory = useCallback(() => {
    clearHistory();
  }, [clearHistory]);

  // Reset position when card is shown
  useEffect(() => {
    if (showCard) {
      setCardTranslateY(0);
      setCardHeight(40); // Reset to default height
    }
  }, [showCard]);
  
  // Card ref for animations
  const cardRef = useRef(null);
  
  // Switch view mode when animator is toggled
  useEffect(() => {
    if (showRouteAnimator) {
      setViewMode('animator');
    } else {
      setViewMode('planner');
    }
  }, [showRouteAnimator]);

  // Add global mouse move and up listeners for smoother dragging
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMove = (e) => handleDragMove(e);
      const handleGlobalEnd = () => handleDragEnd();
      
      // Add touch event listeners with { passive: false } to allow preventDefault
      document.addEventListener('mousemove', handleGlobalMove);
      document.addEventListener('mouseup', handleGlobalEnd);
      document.addEventListener('touchmove', handleGlobalMove, { passive: true });
      document.addEventListener('touchend', handleGlobalEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleGlobalMove);
        document.removeEventListener('mouseup', handleGlobalEnd);
        document.removeEventListener('touchmove', handleGlobalMove);
        document.removeEventListener('touchend', handleGlobalEnd);
      };
    }
  }, [isDragging, dragStartY]);

  // Handle clicked location from map - ONLY when card is open and in planner mode
  useEffect(() => {
    if (!clickedLocation || !showCard || viewMode !== 'planner') {
      return;
    }

    // Check if this is a new clicked location (different from previous)
    const isNewLocation = !prevClickedLocationRef.current ||
      clickedLocation.lat !== prevClickedLocationRef.current.lat ||
      clickedLocation.lng !== prevClickedLocationRef.current.lng;

    if (!isNewLocation) {
      return; // Don't process the same location twice
    }

    prevClickedLocationRef.current = clickedLocation;

    const newLocations = [...locations];

    // If there's an active input (edit mode), replace that specific location
    if (activeInput !== null) {
      newLocations[activeInput] = clickedLocation;
      // Clear active input and close search box to show the updated location
      const indexToClose = activeInput; // Capture the value before clearing
      setActiveInput(null);
      setShowSearchInputs(prev => ({ ...prev, [indexToClose]: false }));
    } else {
      // Otherwise, find the first empty slot
      const emptyIndex = newLocations.findIndex(loc => !loc);
      if (emptyIndex !== -1) {
        newLocations[emptyIndex] = clickedLocation;
      }
    }

    onLocationsChange(newLocations, 'ADD_LOCATION');

    // ALWAYS recalculate route if we have at least 2 locations (even in edit mode)
    const filledCount = newLocations.filter(l => l).length;
    if (filledCount >= 2) {
      calculateRoute(newLocations, legModes);
    }

    if (onLocationUsed) {
      onLocationUsed();
    }
  }, [clickedLocation, showCard, viewMode, locations, activeInput, legModes, onLocationsChange, onLocationUsed]);

  const calculateRoute = (locs, modes) => {
    const filledLocations = locs.filter(loc => loc !== null);
    if (filledLocations.length >= 2 && onDirectionsCalculated) {
      // Only calculate route when we have at least 2 locations
      const segments = [];
      for (let i = 0; i < filledLocations.length - 1; i++) {
        segments.push({
          mode: modes[i] || 'walk',
          startIndex: i,
          endIndex: i + 1,
          ...(customDrawEnabled[i] && { isCustom: true })
        });
      }
      
      const routeData = {
        origin: filledLocations[0],
        destination: filledLocations[filledLocations.length - 1],
        waypoints: filledLocations.slice(1, -1),
        mode: modes[0],
        segments,
        allLocations: locs,
        allModes: modes,
        routeId: filledLocations.map(loc => `${loc.lat},${loc.lng}`).join('_') + '_' + modes.join('-')
      };
      
      onDirectionsCalculated(routeData);
    }
  };

  // Recalculate route when custom draw mode is toggled
  useEffect(() => {
    const filledLocations = locations.filter(loc => loc !== null);
    if (filledLocations.length >= 2 && onDirectionsCalculated) {
      const segments = [];
      for (let i = 0; i < filledLocations.length - 1; i++) {
        segments.push({
          mode: legModes[i] || 'walk',
          startIndex: i,
          endIndex: i + 1,
          ...(customDrawEnabled[i] && { isCustom: true })
        });
      }
      const routeData = {
        origin: filledLocations[0],
        destination: filledLocations[filledLocations.length - 1],
        waypoints: filledLocations.slice(1, -1),
        mode: legModes[0],
        segments,
        allLocations: locations,
        allModes: legModes,
        routeId: filledLocations.map(loc => `${loc.lat},${loc.lng}`).join('_') + '_' + legModes.join('-') + '_' + customDrawEnabled.join('-')
      };
      onDirectionsCalculated(routeData);
    }
  }, [customDrawEnabled, locations, legModes, onDirectionsCalculated]);

  const handleClear = () => {
    try {
      if (onLocationsChange && onLegModesChange) {
        onLocationsChange([null, null], null);
        onLegModesChange(['walk']);
        onDirectionsCalculated(null);
        if (onClearHistory) {
          onClearHistory();
        }
      }
    } catch (error) {
      // Handle error silently
    }
  };

  const handleSaveRoute = useCallback((routeData) => {
    const filledLocations = locations.filter(loc => loc !== null);
    if (filledLocations.length >= 1) {
      try {
        const saved = saveRoute({
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
    
    // Calculate route if we have at least 2 locations
    if (route.locations.length >= 2) {
      setTimeout(() => {
        const segments = [];
        for (let i = 0; i < route.locations.length - 1; i++) {
          segments.push({
            mode: route.modes[i] || 'walk',
            startIndex: i,
            endIndex: i + 1,
            ...(customDrawEnabled[i] && { isCustom: true })
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
      // On mobile, fallback to native share if available
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'My Trip Route',
            text: 'Check out my trip route!',
            url: shareableURL
          });
        } catch (err) {
          if (err.name !== 'AbortError') {
          }
        }
      } else {
      }
    }
  };

  // Removed: handlePointAdded, handleUndoPoint - no longer needed with simplified draw mode

  // Handle drag events (both touch and mouse for testing)
  const handleDragStart = (e) => {
    // Only preventDefault for mouse events, not touch (which are passive by default)
    if (!e.touches) {
      e.preventDefault();
    }
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setIsDragging(true);
    setDragStartY(clientY); // Store the initial touch position
    initialDragHeight.current = cardHeight; // Remember the current height when starting to drag
  };

  const handleDragMove = (e) => {
    if (!isDragging) return;
    // Don't preventDefault here - it causes issues with passive event listeners
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaY = dragStartY - clientY; // Invert: positive = dragging up
    
    // If dragging down from default position or below, use translate to slide down
    if (initialDragHeight.current <= 40 && deltaY < 0) {
      setCardTranslateY(-deltaY); // Move the card down
    } else {
      // Otherwise adjust height
      setCardTranslateY(0); // Reset translate
      // Convert drag distance to height change
      // Each pixel dragged changes height by 0.1vh
      const heightDelta = deltaY * 0.1;
      const newHeight = Math.max(25, Math.min(90, initialDragHeight.current + heightDelta));
      setCardHeight(newHeight);
    }
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    // Check if we were sliding down (translating) rather than resizing
    if (cardTranslateY > 0) {
      // If dragged down more than 80px, hide it
      if (cardTranslateY > 80) {
        // Animate card sliding down completely
        setCardTranslateY(window.innerHeight);
        setTimeout(() => {
          setShowCard(false);
        }, 400);
      } else {
        // Snap back to original position
        setCardTranslateY(0);
      }
    } else if (cardHeight < 15) {
      // If height is very small, hide it
      setCardTranslateY(window.innerHeight);
      setTimeout(() => {
        setShowCard(false);
      }, 400);
    }
    // Otherwise keep the height where user left it
  };

  // Render animator controls inline
  const renderAnimator = () => {
    if (!map || !directionsRoute) return null;
    
    return (
      <div 
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        style={{ height: '100%', overflow: 'auto' }}
      >
        <RouteAnimator
        map={map}
        directionsRoute={directionsRoute}
        onAnimationStateChange={(isAnimating) => {
          // Don't auto-show the card when animation stops if it was manually hidden
          // Pass the state up to parent
          if (onAnimationStateChange) {
            onAnimationStateChange(isAnimating);
          }
        }}
        isMobile={true}
        forceShow={true}
        onClose={() => {
          setViewMode('planner');
          setShowCard(true);
          if (onHideAnimator) {
            onHideAnimator();
          }
        }}
        onMinimize={() => {
          // Slide the card completely off screen
          if (cardRef.current) {
            const cardRect = cardRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const cardTop = cardRect.top;
            const cardHeight = cardRect.height;
            // Calculate distance to slide card completely off bottom
            const slideDistance = viewportHeight - cardTop + cardHeight + 10;
            setCardTranslateY(slideDistance);
            // Then hide it after animation
            setTimeout(() => {
              setShowCard(false);
            }, 400);
          }
        }}
        embeddedInModal={true}
      />
      </div>
    );
  };

  // Removed: handleSetLocations - no longer needed with simplified draw mode

  const renderPlanner = () => (
    <>
      <div className="mobile-planner-header">
        <h2>Visualize Your Route</h2>
      </div>
      <div className="mobile-planner-content">
        <div className="mobile-segments-container">
          {/* Render all location segments */}
          {locations.map((location, index) => (
            <div key={index} className="mobile-segment">
              <div className="mobile-route-row" style={{ position: 'relative' }}>
                <div className={`mobile-route-marker ${index === 0 ? 'start' : index === locations.length - 1 ? 'end' : 'waypoint'}`}>
                  {String.fromCharCode(65 + index)}
                </div>
                {showSearchInputs[index] ? (
                  <div className="mobile-search-container">
                    <LocationSearch
                      onLocationSelect={(loc) => {
                        const newLocations = [...locations];
                        newLocations[index] = loc;
                        onLocationsChange(newLocations);
                        setShowSearchInputs(prev => ({ ...prev, [index]: false }));
                        setActiveInput(null); // Clear active input
                        
                        
                        // Calculate route if we have at least 2 locations
                        const filledCount = newLocations.filter(l => l).length;
                        if (filledCount >= 2) {
                          calculateRoute(newLocations, legModes);
                        }
                      }}
                      placeholder={`Search for point ${String.fromCharCode(65 + index)}...`}
                      enableInlineComplete={false}
                      hideDropdown={false}
                    />
                  </div>
                ) : !location ? (
                  <div className="mobile-search-container">
                    <LocationSearch
                      onLocationSelect={(loc) => {
                        const newLocations = [...locations];
                        newLocations[index] = loc;
                        onLocationsChange(newLocations);
                        setActiveInput(null); // Clear active input
                        
                        
                        // Calculate route if we have at least 2 locations
                        const filledCount = newLocations.filter(l => l).length;
                        if (filledCount >= 2) {
                          calculateRoute(newLocations, legModes);
                        }
                      }}
                      placeholder={index === 0 ? "Tap to search..." : "Tap to search..."}
                      enableInlineComplete={false}
                      hideDropdown={false}
                      autoFocus={false} // Don't auto-focus until clicked
                    />
                  </div>
                ) : activeInput === index && showSearchInputs[index] ? (
                  <div className="mobile-search-container">
                    <LocationSearch
                      onLocationSelect={(loc) => {
                        const newLocations = [...locations];
                        newLocations[index] = loc;
                        onLocationsChange(newLocations);
                        setShowSearchInputs(prev => ({ ...prev, [index]: false }));
                        setActiveInput(null); // Clear active input
                        
                        
                        // Calculate route if we have at least 2 locations
                        const filledCount = newLocations.filter(l => l).length;
                        if (filledCount >= 2) {
                          calculateRoute(newLocations, legModes);
                        }
                      }}
                      placeholder={`Search for point ${String.fromCharCode(65 + index)}...`}
                      defaultValue={location?.name || location?.address || ''}
                      autoFocus={true}
                    />
                    <button 
                      className="mobile-search-cancel"
                      onClick={() => {
                        setShowSearchInputs(prev => ({ ...prev, [index]: false }));
                        setActiveInput(null);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div 
                    className={`mobile-route-input filled ${activeInput === index ? 'active' : ''}`}
                    onClick={() => {
                      setActiveInput(index);
                      // Don't clear the location immediately - just mark it as active for editing
                      setShowSearchInputs(prev => ({ ...prev, [index]: true }));
                    }}
                  >
                    {location.name?.split(',')[0] || `Location ${String.fromCharCode(65 + index)}`}
                  </div>
                )}
                {/* Remove button for locations after B */}
                {index > 1 && (
                  <button
                    className="mobile-remove-btn"
                    onClick={() => {
                      // Remove location and adjust transport modes
                      const newLocations = locations.filter((_, i) => i !== index);
                      // Remove the transport mode that leads TO this location
                      const newModes = [...legModes];
                      if (index - 1 < newModes.length) {
                        newModes.splice(index - 1, 1);
                      }
                      onLocationsChange(newLocations, 'REMOVE_LOCATION');
                      onLegModesChange(newModes);
                      
                      // Recalculate route if we still have enough locations
                      if (newLocations.filter(l => l).length >= 2) {
                        calculateRoute(newLocations, newModes);
                      }
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
              
              {/* Transport mode selector between segments */}
              {index < locations.length - 1 && (
                <>
                  <div className="mobile-segment-transport">
                    {Object.entries(TRANSPORTATION_MODES).filter(([mode]) => mode !== 'custom').map(([mode, config]) => (
                      <button
                        key={mode}
                        className={`mobile-transport-btn ${legModes[index] === mode ? 'active' : ''}`}
                        onClick={() => {
                          const newModes = [...legModes];
                          newModes[index] = mode;
                          onLegModesChange(newModes);
                          if (locations.filter(l => l).length >= 2) {
                            calculateRoute(locations, newModes);
                          }
                        }}
                        title={mode}
                      >
                        {config.icon}
                      </button>
                    ))}
                  </div>

                  {/* Custom drawing toggles */}
                  <div style={{ marginTop: '8px', marginLeft: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={customDrawEnabled[index] || false}
                        onChange={(e) => {
                          const newEnabled = [...customDrawEnabled];
                          newEnabled[index] = e.target.checked;
                          setCustomDrawEnabled(newEnabled);
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>Draw Custom Route</span>
                    </label>

                    {/* Instructions when draw mode is enabled */}
                    {customDrawEnabled[index] && (
                      <div style={{
                        marginTop: '8px',
                        marginLeft: '24px',
                        padding: '8px 12px',
                        backgroundColor: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#1e40af'
                      }}>
                        💡 Tap on the map to add points and create your route.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
          
          {/* Add next location button */}
          <button
            className="mobile-add-waypoint-btn"
            onClick={() => {
              // Add a new location at the end (like desktop)
              const newLocations = [...locations, null];
              const newModes = [...legModes, 'walk'];
              onLocationsChange(newLocations, 'ADD_DESTINATION');
              onLegModesChange(newModes);
            }}
          >
            + Add Next Location ({String.fromCharCode(65 + locations.length)})
          </button>
        </div>


        {/* Action Buttons */}
        <div className="mobile-actions">
          <button
            className="mobile-action-btn secondary"
            onClick={handleUndoInternal}
            disabled={!canUndo}
            style={{ height: '44px', fontSize: '20px' }}
            title="Undo"
          >
            ↩️
          </button>
          <button
            className="mobile-action-btn secondary"
            onClick={() => {
              handleClear();
              handleClearHistory();
            }}
            disabled={!canUndo && locations.filter(l => l).length === 0}
            style={{ height: '44px', fontSize: '20px' }}
            title="Clear All"
          >
            🔄
          </button>
          <button 
            className="mobile-action-btn secondary"
            onClick={() => setShowSaveModal(true)}
            disabled={!locations.some(loc => loc !== null)}
            style={{ height: '44px', fontSize: '20px' }}
            title="Save Route"
          >
            💾
          </button>
          <button 
            className="mobile-action-btn secondary"
            onClick={() => setShowSavedRoutesModal(true)}
            style={{ height: '44px', fontSize: '20px' }}
            title="Load Route"
          >
            📂
          </button>
          <button 
            className="mobile-action-btn secondary"
            onClick={handleShare}
            disabled={!directionsRoute || locations.filter(l => l !== null).length < 2}
            style={{ height: '44px', fontSize: '20px' }}
            title="Share Trip"
          >
            {showCopiedMessage ? '✅' : '🔗'}
          </button>
          <button 
            className="mobile-action-btn primary"
            onClick={() => {
              if (directionsRoute) {
                // Just trigger the animator - it will handle everything
                if (onShowAnimator) {
                  onShowAnimator();
                }
              } else {
                calculateRoute(locations, legModes);
              }
            }}
            disabled={locations.filter(l => l).length < 2}
            title={directionsRoute ? "Play Animation" : "Calculate Route"}
            style={{ height: '44px' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="mobile-controls-container">
      {/* Single Modal Card */}
      <div 
        ref={cardRef}
        className={`mobile-card ${!showCard ? 'collapsed' : ''} ${isDragging ? 'dragging' : ''}`}
        style={{
          transform: `translateY(${cardTranslateY}px)`,
          height: `${cardHeight}vh`,
          transition: isDragging ? 'none' : 'transform 0.4s ease-in-out, height 0.4s ease-in-out'
        }}
      >
        {/* Draggable handle for repositioning */}
        <div 
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
          onMouseDown={handleDragStart}
          onMouseMove={isDragging ? handleDragMove : undefined}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80px',
            height: '35px',
            cursor: isDragging ? 'grabbing' : 'grab',
            zIndex: 2,
            touchAction: 'none'
          }}
          aria-label="Drag to reposition"
        />
        {/* Back and Minimize buttons at top right */}
        <div style={{
          position: 'absolute',
          top: '3px',
          right: '12px',
          display: 'flex',
          gap: '8px',
          zIndex: 3
        }}>
          {viewMode === 'animator' && (
            <button
              onClick={() => {
                setViewMode('planner');
                setShowCard(true);
                if (onHideAnimator) {
                  onHideAnimator();
                }
              }}
              style={{
                width: '24px',
                height: '24px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
                padding: 0
              }}
              aria-label="Back to Route"
              title="Back to Route"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M15 7H3.83l5.59-5.59L8 0 0 8l8 8 1.41-1.41L3.83 9H15V7z"/>
              </svg>
            </button>
          )}
          <button
            onClick={() => {
              // Slide card completely off screen then hide
              const cardRect = cardRef.current?.getBoundingClientRect();
              if (cardRect) {
                const viewportHeight = window.innerHeight;
                const cardTop = cardRect.top;
                // Calculate distance to slide card completely off bottom
                const slideDistance = viewportHeight - cardTop + 10;
                setCardTranslateY(slideDistance);
                setTimeout(() => {
                  setShowCard(false);
                  // Don't reset translateY here - do it when showing the card again
                }, 400);
              }
            }}
            style={{
              width: '24px',
              height: '24px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
              fontSize: '20px',
              fontWeight: 'bold',
              padding: 0
            }}
            aria-label="Minimize"
          >
            −
          </button>
        </div>
        {viewMode === 'animator' ? renderAnimator() : renderPlanner()}
      </div>

      {/* FAB when card is hidden */}
      {!showCard && (
        <div className="mobile-fab-container">
          <button 
            className="unified-icon primary"
            onClick={() => {
              setCardTranslateY(0); // Reset position
              setShowCard(true);
            }}
            aria-label="Plan Route"
            style={{ position: 'fixed', left: '20px', bottom: '20px' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6" cy="6" r="3" />
              <circle cx="18" cy="18" r="3" />
              <path d="M9 9l6 6" />
            </svg>
          </button>
        </div>
      )}
      
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

        const startLocation = locations[index];
        const endLocation = locations[index + 1];

        return (
          <CustomRouteDrawer
            key={`drawer-${index}`}
            map={map}
            startLocation={startLocation}
            endLocation={endLocation}
            mode={legModes[index] || 'walk'}
            isEnabled={customDrawEnabled[index]}
          />
        );
      })}
    </div>
  );
};

export default MobileControls;
