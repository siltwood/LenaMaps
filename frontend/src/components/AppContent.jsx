import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, LocationSearch } from './Shared';
import { DirectionsPanel } from './Desktop';
import { useMobileDetection } from '../utils/deviceDetection';
import { hasSharedTrip, loadSharedTrip, clearSharedTripFromURL } from '../utils/shareUtils';
import { saveRoute } from '../utils/savedRoutesUtils';
import Modal from '../features/animation/RouteAnimator/Modal';
import { SaveRouteModal } from '../features/saved-routes/SaveRouteModal';
import { SavedRoutesModal } from '../features/saved-routes/SavedRoutesModal';
import { supabase, isSupabaseConfigured } from '../utils/supabaseClient';
import { initFingerprint } from '../utils/fingerprint';
import MapDistanceDisplay from '../components/Shared/MapDistanceDisplay';
// DISCONNECTED: Usage tracking paused for release - see STATUS.md
// import { useUsageTracking } from '../hooks/useUsageTracking';
// import UpgradeModal from './UpgradeModal';

function AppContent() {
  const [directionsRoute, setDirectionsRoute] = useState(null);
  const [mapCenter, setMapCenter] = useState({ lat: 48.1181, lng: -123.4307 }); // Default: Port Angeles, WA
  const [shouldCenterMap, setShouldCenterMap] = useState(false);
  const [clickedLocation, setClickedLocation] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const isMobile = useMobileDetection();
  const [showRouteAnimator, setShowRouteAnimator] = useState(!isMobile); // Show on desktop by default, hide on mobile
  const [mapInstance, setMapInstance] = useState(null); // Store map instance

  // Route state - managed here and passed to DirectionsPanel as controlled component
  const [directionsLocations, setDirectionsLocations] = useState([null, null]);
  const [directionsLegModes, setDirectionsLegModes] = useState(['walk']);
  const [sharedEffects, setSharedEffects] = useState(null);
  
  // Route error modal
  const [routeErrorModal, setRouteErrorModal] = useState({
    isOpen: false,
    message: ''
  });
  
  // Save/Load modals
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSavedRoutesModal, setShowSavedRoutesModal] = useState(false);

  // Distance display on map
  const [distanceDisplayInfo, setDistanceDisplayInfo] = useState(null);

  // Authentication state
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);

  // DISCONNECTED: Usage tracking paused for release - see STATUS.md
  // const usageTracking = useUsageTracking();
  
  // Listen for route calculation errors
  useEffect(() => {
    const handleRouteError = (event) => {
      // Show error modal
      setRouteErrorModal({
        isOpen: true,
        message: event.detail.message
      });

      // Clear the second location if route calculation failed
      if (event.detail.shouldClearSecondLocation) {
        // Keep only the first location, clear the rest
        const newLocations = [directionsLocations[0], null];
        if (directionsLocations.length > 2) {
          // If there were more than 2 locations, clear all except the first
          for (let i = 2; i < directionsLocations.length; i++) {
            newLocations.push(null);
          }
        }
        setDirectionsLocations(newLocations);
        setDirectionsRoute(null);
      }
    };

    window.addEventListener('routeCalculationError', handleRouteError);

    return () => {
      window.removeEventListener('routeCalculationError', handleRouteError);
    };
  }, [directionsLocations]);

  // Initialize authentication and fingerprinting
  useEffect(() => {
    if (isSupabaseConfigured()) {
      // Initialize fingerprinting for anonymous users
      initFingerprint();

      // Check for existing session
      const checkSession = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user || null);
      };

      checkSession();

      // Listen for auth state changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
        setUser(session?.user || null);
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  // Callback for route animation start
  const handleAnimationStart = async () => {
    return true; // Allow animation
  };

  // Check for shared trip in URL on mount
  useEffect(() => {
    if (hasSharedTrip()) {
      const sharedTrip = loadSharedTrip();
      
      if (sharedTrip) {
        
        // Set the locations and modes
        setDirectionsLocations(sharedTrip.locations);
        setDirectionsLegModes(sharedTrip.modes);

        // Load effects from shared trip if present
        if (sharedTrip.effects) {
          setSharedEffects(sharedTrip.effects);
        }
        
        // Auto-calculate the route
        if (sharedTrip.locations.length >= 2) {
          const segments = [];
          for (let i = 0; i < sharedTrip.locations.length - 1; i++) {
            segments.push({
              mode: sharedTrip.modes[i] || 'walk',
              startIndex: i,
              endIndex: i + 1
            });
          }
          
          const routeData = {
            origin: sharedTrip.locations[0],
            destination: sharedTrip.locations[sharedTrip.locations.length - 1],
            waypoints: sharedTrip.locations.slice(1, -1),
            mode: sharedTrip.modes[0] || 'walk',
            segments,
            allLocations: sharedTrip.locations,
            allModes: sharedTrip.modes,
            routeId: `shared_${Date.now()}`
          };
          
          setDirectionsRoute(routeData);
          
          // Center map on first location
          setMapCenter({ 
            lat: sharedTrip.locations[0].lat, 
            lng: sharedTrip.locations[0].lng 
          });
          setShouldCenterMap(true);
        } else if (sharedTrip.locations.length === 1) {
          // Single location - just center on it
          setMapCenter({ 
            lat: sharedTrip.locations[0].lat, 
            lng: sharedTrip.locations[0].lng 
          });
          setShouldCenterMap(true);
        }
        
        // Clear the trip from URL to clean up the address bar
        clearSharedTripFromURL();
      }
    } else {
      // No shared trip - try to get user's location
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const userLocation = {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            };
            setMapCenter(userLocation);
            setShouldCenterMap(true);
          },
          () => {
            // Silently fail - use default location
            // Geolocation error - silently fail
          },
          {
            enableHighAccuracy: false,
            timeout: 5000,
            maximumAge: 0
          }
        );
      }
    }
  }, []); // Run only once on mount

  const handleLocationSearch = useCallback((location) => {
    setMapCenter({ lat: location.lat, lng: location.lng });
    setShouldCenterMap(true);
  }, []);

  const handleMapCentered = useCallback(() => {
    setShouldCenterMap(false);
  }, []);

  const handleMapClick = useCallback((lat, lng, locationInfo) => {
    setClickedLocation({ lat, lng, ...locationInfo });
  }, []);

  const handleLocationUsed = useCallback(() => {
    setClickedLocation(null);
  }, []);

  // Controlled component callbacks - DirectionsPanel calls these to update parent state
  const setDirectionsLocationsWithHistory = useCallback((newLocations, actionType) => {
    setDirectionsLocations(newLocations);
  }, []);

  const setDirectionsLegModesWithHistory = useCallback((newModes, index) => {
    setDirectionsLegModes(newModes);
  }, []);

  // Handle saving a route
  const handleSaveRoute = useCallback((routeData) => {
    const filledLocations = directionsLocations.filter(loc => loc !== null);
    if (filledLocations.length >= 1) {
      try {
        saveRoute({
          name: routeData.name,
          description: routeData.description,
          locations: filledLocations,
          modes: directionsLegModes
        });
        // Close the modal silently - no alert
      } catch (error) {
      }
    }
  }, [directionsLocations, directionsLegModes]);

  // Handle loading a saved route
  const handleLoadRoute = useCallback((route) => {
    // Set locations and modes - DirectionsPanel will handle route calculation
    setDirectionsLocations(route.locations);
    setDirectionsLegModes(route.modes);

    // Center map on first location
    if (route.locations[0]) {
      setMapCenter({
        lat: route.locations[0].lat,
        lng: route.locations[0].lng
      });
      setShouldCenterMap(true);
    }

    // Close the modal
    setShowSavedRoutesModal(false);
  }, []);

  return (
    <div className="app">
      {!isAnimating && (
        <header className={`header ${isMobile ? 'header-mobile' : ''}`}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            padding: '0 1rem'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '1rem',
              color: '#000000',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              marginTop: '6px',
              marginBottom: '6px'
            }}>
              <img
                src="/lenamaps-logo.png"
                alt="LenaMaps Logo"
                style={{
                  height: '24px',
                  width: 'auto',
                  verticalAlign: 'middle'
                }}
              />
              LenaMaps{!isMobile && ' - Animate your Google Maps Route'}
            </div>
            <div className="header-search">
            {import.meta.env.VITE_GOOGLE_MAPS_API_KEY &&
             import.meta.env.VITE_GOOGLE_MAPS_API_KEY !== "your_google_maps_api_key_here" ? (
              <LocationSearch
                onLocationSelect={handleLocationSearch}
                placeholder="Find location..."
              />
            ) : (
              <div style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'rgba(255,255,255,0.2)',
                borderRadius: '25px',
                fontSize: '0.9rem',
                color: 'rgba(255,255,255,0.8)'
              }}>
                Set up Google Maps API to enable search
              </div>
            )}
            </div>
          </div>
        </header>
      )}

      <div className="main-content">
        <div className="map-container">
          <GoogleMap
            directionsRoute={directionsRoute}
            center={mapCenter}
            shouldCenterMap={shouldCenterMap}
            onMapCentered={handleMapCentered}
            onMapClick={handleMapClick}
            directionsLocations={directionsLocations}
            directionsLegModes={directionsLegModes}
            onAnimationStateChange={setIsAnimating}
            onAnimationStart={handleAnimationStart}
            isMobile={isMobile}
            showRouteAnimator={showRouteAnimator}
            onHideRouteAnimator={() => {
              setShowRouteAnimator(false);
            }}
            onMapReady={setMapInstance}
            onModesAutoUpdate={(updatedModes) => {
              // When routes are auto-switched to flight, update the UI modes
              setDirectionsLegModes(updatedModes);
            }}
            // DISCONNECTED: Usage tracking paused for release - see STATUS.md
            // usageTracking={usageTracking}
          />

          {/* Distance Display on Map - render directly here */}
          <MapDistanceDisplay displayInfo={distanceDisplayInfo} />

          {/* Watermark - Always visible */}
          <div style={{
            position: 'absolute',
            top: '60px',
            right: '10px',
            fontFamily: 'Baconfarm, sans-serif',
            fontSize: isMobile ? '40px' : '80px',
            color: '#000000',
            fontWeight: 'bold',
            zIndex: 1001,
            opacity: 1,
            pointerEvents: 'none',
            userSelect: 'none'
          }}>
            Lenamaps.com
          </div>

          {!isAnimating && (
            <>
              <div className="bmc-button-container" style={{
                position: 'absolute',
                top: '10px',
                right: isMobile ? '10px' : '60px',
                zIndex: 1000
              }}>
                <a
                  href="https://www.buymeacoffee.com/lenamaps"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: isMobile ? '6px 10px' : '10px 16px',
                    backgroundColor: '#FFDD00',
                    color: '#000000',
                    fontFamily: 'Cookie, cursive',
                    fontSize: isMobile ? '14px' : '18px',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
                  }}
                >
                  ☕ Buy me a coffee
                </a>
              </div>
            </>
          )}
        </div>
      </div>
      
      <DirectionsPanel
        key="directions-panel"
        isOpen={!isAnimating}
        onDirectionsCalculated={setDirectionsRoute}
        directionsRoute={directionsRoute}
        clickedLocation={clickedLocation}
        onLocationUsed={handleLocationUsed}
        locations={directionsLocations}
        legModes={directionsLegModes}
        onLocationsChange={setDirectionsLocationsWithHistory}
        onLegModesChange={setDirectionsLegModesWithHistory}
        map={mapInstance}
        isAnimating={isAnimating}
        isMobile={isMobile}
        onAnimationStateChange={setIsAnimating}
        onDistanceDisplayChange={setDistanceDisplayInfo}
        sharedEffects={sharedEffects}
      />
      
      {/* Route Error Modal */}
      <Modal
        isOpen={routeErrorModal.isOpen}
        onClose={() => setRouteErrorModal({ isOpen: false, message: '' })}
        title="No Route Available"
        message={routeErrorModal.message}
        type="warning"
      />
      
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

      {/* DISCONNECTED: Usage tracking paused for release - see STATUS.md */}
      {/* Upgrade Modal - shown when daily limit reached */}
      {/* <UpgradeModal
        isOpen={usageTracking.limitReached}
        onClose={usageTracking.dismissLimitWarning}
        usageInfo={usageTracking.usageInfo}
      /> */}
    </div>
  );
}

export default AppContent;
