import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faPause, faStop } from '@fortawesome/free-solid-svg-icons';
import { TRANSPORT_ICONS, TRANSPORTATION_COLORS } from '../../../constants/transportationModes';
import {
  ANIMATION_ZOOM,
  ANIMATION_PADDING,
  ANIMATION_SPEEDS,
  DISTANCE_THRESHOLDS,
  PLAYBACK_MULTIPLIERS,
  ANIMATION_TIMING,
  MARKER_SCALE
} from '../../../constants/animationConstants';
import DragHandle from '../../../components/common/DragHandle';
import Modal from './Modal';
import PlaybackControls from './components/PlaybackControls';
import SpeedControl from './components/SpeedControl';
import ZoomControl from './components/ZoomControl';
import TimelineScrubber from './components/TimelineScrubber';
import { useMarkerAnimation, useZoomManager, useRouteAnimation } from './hooks';
import { isMobileDevice } from '../../../utils/deviceDetection';
import { centerMapOnLocation } from '../../../utils/mapCenteringUtils';
import '../../../styles/unified-icons.css';
import './RouteAnimator.css';

const RouteAnimator = ({ map, directionsRoute, onAnimationStateChange, onAnimationStart, isMobile = false, forceShow = false, onClose, embeddedInModal = false, onMinimize, isMinimized: propsIsMinimized, setIsMinimized: propsSetIsMinimized, enabledEffects = {} }) => {

  // Use props if provided (embedded mode), otherwise manage internally
  const [internalIsMinimized, setInternalIsMinimized] = useState(false);
  const isMinimized = propsIsMinimized !== undefined ? propsIsMinimized : internalIsMinimized;
  const setIsMinimized = propsSetIsMinimized !== undefined ? propsSetIsMinimized : setInternalIsMinimized;
  const [isAnimating, setIsAnimatingState] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [modalState, setModalState] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [position, setPosition] = useState(isMobile ? { x: 10, y: 60 } : { x: Math.max(10, window.innerWidth - 480), y: window.innerHeight - 250 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const panelRef = useRef(null);
  
  // Store position before minimizing
  const savedPositionRef = useRef(null);
  const mapRef = useRef(map);
  
  // Update map ref when prop changes
  useEffect(() => {
    mapRef.current = map;
  }, [map]);


  
  // Helper to show modal
  const showModal = (message, title = '', type = 'info') => {
    setModalState({ isOpen: true, title, message, type });
  }
  
  // Wrapper to notify parent when animation state changes
  const setIsAnimating = (value) => {
    setIsAnimatingState(value);
    if (onAnimationStateChange) {
      onAnimationStateChange(value);
    }
  }
  const [zoomLevel, setZoomLevel] = useState(isMobile ? 'follow' : 'whole'); // 'follow' on mobile, 'whole' on desktop
  const [playbackSpeed, setPlaybackSpeed] = useState('medium'); // 'slow', 'medium', 'fast'
  const [animationProgress, setAnimationProgress] = useState(0); // 0-100 for timeline
  const [currentSegmentMode, setCurrentSegmentMode] = useState(null); // Track current segment mode for animated marker box

  // Refs for hook access
  const zoomLevelRef = useRef(zoomLevel);
  const playbackSpeedRef = useRef(playbackSpeed);
  const forceCenterOnNextFrameRef = useRef(false);

  // Update refs when state changes
  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  // Use marker animation hook
  const {
    markerRef,
    createMarker,
    updateMarkerScale,
    updateMarkerMode,
    clearMarker
  } = useMarkerAnimation(map, isAnimating);

  // Use route animation hook
  const {
    startAnimation: startAnimationFromHook,
    stopAnimation,
    handleStopAnimation,
    pauseAnimation,
    resumeAnimation,
    handleTimelineChange,
    totalDistanceRef,
    polylineRef,
    pathRef
  } = useRouteAnimation({
    map,
    directionsRoute,
    zoomLevel,
    playbackSpeed,
    isAnimating,
    setIsAnimating,
    isPaused,
    setIsPaused,
    setAnimationProgress,
    setCurrentSegmentMode,
    showModal,
    onAnimationStart,
    getFollowModeZoom: () => getFollowModeZoom(),
    zoomLevelRef,
    playbackSpeedRef,
    forceCenterOnNextFrameRef,
    isMobile,
    enabledEffects
  });

  // Exit animation mode - clean up everything
  const exitAnimationMode = useCallback(() => {
    // Stop animation and remove polyline (don't recenter - user might be examining route)
    handleStopAnimation(false);

    // Hide animated marker box (top-left transport icon)
    window.dispatchEvent(new CustomEvent('routeAnimationUpdate', {
      detail: {
        isAnimating: false,
        currentModeIcon: null,
        segmentColor: null
      }
    }));

    // Close animation panel
    if (onClose) {
      onClose();
    }
  }, [handleStopAnimation, onClose]);

  // Listen for exit animation mode event (triggered by mobile X button)
  useEffect(() => {
    const handleExitAnimationMode = () => {
      exitAnimationMode();
    };

    window.addEventListener('exitAnimationMode', handleExitAnimationMode);
    return () => window.removeEventListener('exitAnimationMode', handleExitAnimationMode);
  }, [exitAnimationMode]);

  // Store handleStopAnimation in ref to avoid triggering cleanup on every change
  const handleStopAnimationRef = useRef(handleStopAnimation);
  useEffect(() => {
    handleStopAnimationRef.current = handleStopAnimation;
  }, [handleStopAnimation]);

  // Cleanup when component unmounts (e.g., switching mobile/desktop)
  useEffect(() => {
    return () => {
      // Call stop function to properly clean up animation state
      if (handleStopAnimationRef.current) {
        handleStopAnimationRef.current();
      }
    };
  }, []); // Empty deps - only run on unmount

  // Use zoom manager hook
  const {
    calculateBoundsZoomLevel,
    getFollowModeZoom,
    fitWholeRoute
  } = useZoomManager(
    map,
    directionsRoute,
    isAnimating,
    isMinimized,
    totalDistanceRef,
    zoomLevelRef,
    forceCenterOnNextFrameRef,
    polylineRef,
    isMobile
  );

  // Handle zoom level changes - both before and during animation
  useEffect(() => {
    if (!map || !directionsRoute?.allLocations?.[0]) return;

    if (zoomLevel === 'follow') {
      // Instantly zoom in to follow distance
      map.setZoom(getFollowModeZoom());

      if (isAnimating && !isPaused) {
        // During animation: center on current marker position on next frame
        forceCenterOnNextFrameRef.current = true;
      } else {
        // Before animation or when paused: center on start marker
        const firstLocation = directionsRoute.allLocations[0];
        if (firstLocation?.lat && firstLocation?.lng) {
          centerMapOnLocation(map, firstLocation, isMobile, true);
        }
      }
    } else if (zoomLevel === 'whole') {
      // Fit whole route in view
      fitWholeRoute();
    }
  }, [zoomLevel, map, directionsRoute, isAnimating, isPaused, isMobile, getFollowModeZoom, fitWholeRoute]);

  // Check if route is playable
  const isRoutePlayable = useCallback(() => {
    if (!directionsRoute || !directionsRoute.allLocations || directionsRoute.allLocations.length < 2) {
      return false;
    }

    // Check if all locations are the same
    const locations = directionsRoute.allLocations.filter(loc => loc !== null);
    if (locations.length >= 2) {
      const firstLoc = locations[0];
      const allSame = locations.every(loc =>
        loc.lat === firstLoc.lat && loc.lng === firstLoc.lng
      );

      if (allSame) {
        return false;
      }
    }

    return true;
  }, [directionsRoute]);

  // Wrapper for startAnimation
  const startAnimation = useCallback(() => {
    // Call hook's startAnimation
    startAnimationFromHook(embeddedInModal, onMinimize);
  }, [embeddedInModal, onMinimize, startAnimationFromHook]);

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

  // Handle window resize to keep modal on screen
  useEffect(() => {
    const handleResize = () => {
      const panel = panelRef.current;
      if (panel && !isMinimized) {
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          const rect = panel.getBoundingClientRect();
          const padding = 10; // Minimum distance from edge
          
          setPosition(prev => {
            let newX = prev.x;
            let newY = prev.y;
            
            // Check right edge
            if (rect.right > window.innerWidth - padding) {
              newX = window.innerWidth - rect.width - padding;
            }
            
            // Check bottom edge
            if (rect.bottom > window.innerHeight - padding) {
              newY = window.innerHeight - rect.height - padding;
            }
            
            // Check left edge
            if (rect.left < padding) {
              newX = padding;
            }
            
            // Check top edge
            if (rect.top < padding) {
              newY = padding;
            }
            
            return { x: newX, y: newY };
          });
        });
      }
    };

    window.addEventListener('resize', handleResize);
    // Initial check
    handleResize();
    
    return () => window.removeEventListener('resize', handleResize);
  }, [isMinimized]);

  // When embedded in modal on mobile, render the controls only (FAB handled by DirectionsPanel)
  if (embeddedInModal) {
    return (
      <>

        {!isMinimized && (
          <div
          className="mobile-animator-controls"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="controls-section">
            <div className="playback-controls">
              <PlaybackControls
                isAnimating={isAnimating}
                isPaused={isPaused}
                onPlay={startAnimation}
                onPause={pauseAnimation}
                onResume={resumeAnimation}
                onStop={handleStopAnimation}
                isMobile={true}
                disabled={!isRoutePlayable()}
              />
            </div>
            
            <div className="mobile-section-label">Speed</div>
            <SpeedControl
              playbackSpeed={playbackSpeed}
              onChange={setPlaybackSpeed}
              isMobile={true}
            />
            
            <div className="mobile-section-label">View</div>
            <ZoomControl
              zoomLevel={zoomLevel}
              onChange={setZoomLevel}
              isAnimating={isAnimating}
              isPaused={isPaused}
              isMobile={true}
            />
          </div>
            <Modal
              isOpen={modalState.isOpen}
              onClose={() => setModalState({ ...modalState, isOpen: false })}
              title={modalState.title}
              message={modalState.message}
              type={modalState.type}
            />
          </div>
        )}
      </>
    );
  }
  
  // Render minimized state 
  if (isMinimized) {
    // On mobile, always show camera icon FAB when minimized (ignore forceShow)
    if (isMobile || isMobileDevice()) {
      return (
        <div className="route-animator-minimized mobile">
          <button 
            className="unified-icon animation"
            onClick={() => {
              
              // When showing animation controls on mobile, position marker at 1/3 from top
              if (map && directionsRoute && directionsRoute.allLocations && directionsRoute.allLocations.length > 0) {
                const firstLocation = directionsRoute.allLocations[0];
                if (firstLocation && firstLocation.lat && firstLocation.lng) {
                  centerMapOnLocation(map, firstLocation, isMobile, false);
                }
              }

              setIsMinimized(false);
            }}
            title="Show Animation Controls"
            style={{ position: 'fixed', left: '20px', bottom: '20px' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c .55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
          </button>
        </div>
      );
    }
    // Desktop minimized state - keep the same as before
    if (!forceShow) {
      return (
        <div className="route-animator-minimized">
          <button 
            className="unified-icon animation"
            onClick={() => setIsMinimized(false)}
            title="Show Animation Controls"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c .55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
          </button>
        </div>
      );
    }
  }

  return (
    <div
      className="route-animator"
      ref={panelRef}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'auto'
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="route-animator-header">
        {!isMobile && <DragHandle />}
        <h4>Route Animator</h4>
        <div className="header-actions">
          {isMobile && onClose ? (
            <>
              <button className="minimize-button" onClick={() => {
                savedPositionRef.current = { ...position };
                setIsMinimized(true);
              }} title="Minimize">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 9h8v1H4z"/>
                </svg>
              </button>
              <button className="close-button" onClick={exitAnimationMode} title="Back to Route">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M15 7H3.83l5.59-5.59L8 0 0 8l8 8 1.41-1.41L3.83 9H15V7z"/>
                </svg>
              </button>
            </>
          ) : (
            <button className="minimize-button" onClick={() => {
              savedPositionRef.current = { ...position };
              setIsMinimized(true);
            }} title="Minimize panel">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 9h8v1H4z"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      
      <div className="route-animator-content">
          <div className="controls-section">
            <div className="playback-controls">
              <PlaybackControls
                isAnimating={isAnimating}
                isPaused={isPaused}
                onPlay={startAnimation}
                onPause={pauseAnimation}
                onResume={resumeAnimation}
                onStop={handleStopAnimation}
                isMobile={false}
                disabled={!isRoutePlayable()}
              />
            </div>

            <ZoomControl
              zoomLevel={zoomLevel}
              onChange={setZoomLevel}
              isAnimating={isAnimating}
              isPaused={isPaused}
              isMobile={false}
            />

            <SpeedControl
              playbackSpeed={playbackSpeed}
              onChange={setPlaybackSpeed}
              isMobile={false}
            />
            
            <TimelineScrubber
              animationProgress={animationProgress}
              onChange={handleTimelineChange}
              isMobile={false}
              showLabel={true}
            />
            
          </div>
        </div>
      
      <Modal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
      />
    </div>
  );
};

export default RouteAnimator;
