import React, { useState, useEffect, useRef } from 'react';

// Custom autocomplete implementation using Places Service
const LocationSearch = ({ onLocationSelect, placeholder = "Search for a city or location...", enableInlineComplete = false, hideDropdown = false, autoFocus = false, defaultValue = '' }) => {
  const [searchInput, setSearchInput] = useState(defaultValue);
  const [predictions, setPredictions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [ghostText, setGhostText] = useState('');
  const autocompleteService = useRef(null);
  const placesService = useRef(null);
  const searchTimeout = useRef(null);
  const containerRef = useRef(null);
  const sessionToken = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const [dropdownPosition, setDropdownPosition] = useState({});
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const initialDefaultValue = useRef(defaultValue);

  // Update searchInput when defaultValue changes (for edit mode)
  // Only set once when component receives a new defaultValue (entering edit mode)
  useEffect(() => {
    if (defaultValue && defaultValue !== initialDefaultValue.current) {
      setSearchInput(defaultValue);
      initialDefaultValue.current = defaultValue;
    }
  }, [defaultValue]);

  // Handle overflow of parent container when dropdown is shown
  useEffect(() => {
    if (showDropdown) {
      // Find the directions-content container
      const directionsContent = document.querySelector('.directions-content');
      if (directionsContent) {
        // Store original overflow value
        const originalOverflow = directionsContent.style.overflowY || 'auto';
        directionsContent.style.overflowY = 'visible';
        
        // Restore overflow when dropdown closes
        return () => {
          directionsContent.style.overflowY = originalOverflow;
        };
      }
      
    }
  }, [showDropdown]);

  useEffect(() => {
    // Function to initialize services
    const initializeServices = () => {
      if (window.google?.maps?.places) {
        autocompleteService.current = new window.google.maps.places.AutocompleteService();
        // Note: PlacesService requires a map or HTMLDivElement that's in the DOM
        const div = document.createElement('div');
        document.body.appendChild(div);
        div.style.display = 'none';
        placesService.current = new window.google.maps.places.PlacesService(div);
        // Create initial session token
        sessionToken.current = new window.google.maps.places.AutocompleteSessionToken();
      } else {
        // Retry after a short delay
        setTimeout(initializeServices, 500);
      }
    };

    initializeServices();
  }, []);

  // Auto-focus input when autoFocus prop is true
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      // Simple focus for when explicitly requested
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
    }
  }, [autoFocus]);

  useEffect(() => {
    // Click outside handler
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchPredictions = (input) => {
    
    if (!autocompleteService.current || input.length < 2) {
      setPredictions([]);
      return;
    }

    autocompleteService.current.getPlacePredictions(
      { 
        input,
        sessionToken: sessionToken.current 
      },
      (predictions, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
          setPredictions(predictions);
          // Only show dropdown if not hidden (for mobile)
          if (!hideDropdown) {
            setShowDropdown(true);
          }
          
          // Set ghost text for inline autocomplete on mobile
          if (enableInlineComplete && predictions.length > 0) {
            const firstPrediction = predictions[0].structured_formatting.main_text.toLowerCase();
            const inputLower = input.toLowerCase();
            if (firstPrediction.startsWith(inputLower)) {
              setGhostText(predictions[0].structured_formatting.main_text);
            } else {
              setGhostText('');
            }
          }
        } else {
          setPredictions([]);
          setGhostText('');
        }
      }
    );
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);
    setSelectedIndex(-1);

    // Clear ghost text if input is empty
    if (!value) {
      setGhostText('');
    }

    // Debounce the search
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = setTimeout(() => {
      fetchPredictions(value);
    }, 300);
  };

  const selectPlace = (placeId, description) => {
    if (!placesService.current) {
      return;
    }

    placesService.current.getDetails(
      {
        placeId,
        fields: ['geometry', 'name', 'formatted_address'],
        sessionToken: sessionToken.current
      },
      (place, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
          const location = {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            name: place.name,
            address: place.formatted_address
          };

          setSearchInput(description);
          setPredictions([]);
          setShowDropdown(false);
          setGhostText('');

          // Create new session token after place selection
          sessionToken.current = new window.google.maps.places.AutocompleteSessionToken();

          if (onLocationSelect) {
            onLocationSelect(location);
          }
        } else {
          // Failed to get place details
        }
      }
    );
  };

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'Tab':
        // Accept ghost text suggestion on Tab
        if (enableInlineComplete && ghostText && searchInput) {
          e.preventDefault();
          setSearchInput(ghostText);
          // Trigger search for the completed text
          if (predictions.length > 0) {
            selectPlace(predictions[0].place_id, predictions[0].description);
          }
        }
        break;
      case 'ArrowRight':
        // Accept ghost text suggestion on right arrow at end of input
        if (enableInlineComplete && ghostText && searchInput && 
            inputRef.current && inputRef.current.selectionStart === searchInput.length) {
          e.preventDefault();
          setSearchInput(ghostText);
          // Trigger search for the completed text
          if (predictions.length > 0) {
            selectPlace(predictions[0].place_id, predictions[0].description);
          }
        }
        break;
      case 'ArrowDown':
        if (showDropdown && predictions.length > 0) {
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < predictions.length - 1 ? prev + 1 : prev
          );
        }
        break;
      case 'ArrowUp':
        if (showDropdown && predictions.length > 0) {
          e.preventDefault();
          setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (showDropdown && selectedIndex >= 0 && selectedIndex < predictions.length) {
          // Select from dropdown
          const prediction = predictions[selectedIndex];
          selectPlace(prediction.place_id, prediction.description);
        } else if (searchInput.trim()) {
          // No dropdown or selection - perform geocoding search
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ address: searchInput }, (results, status) => {
            if (status === 'OK' && results[0]) {
              const result = results[0];
              const location = {
                lat: result.geometry.location.lat(),
                lng: result.geometry.location.lng(),
                name: result.address_components[0]?.long_name || searchInput,
                address: result.formatted_address
              };
              
              setSearchInput(result.formatted_address);
              setPredictions([]);
              setShowDropdown(false);
              setGhostText('');
              
              // Create new session token after geocoding search
              sessionToken.current = new window.google.maps.places.AutocompleteSessionToken();
              
              if (onLocationSelect) {
                onLocationSelect(location);
              }
            } else {
            }
          });
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setSelectedIndex(-1);
        break;
    }
  };

  
  return (
    <div ref={containerRef} className="location-search-custom" style={{ position: 'relative' }}>
      <div className="location-search-input-wrapper">
        {enableInlineComplete && ghostText && searchInput && (
          <div 
            className="location-search-ghost-overlay"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: 'none',
              zIndex: 0,
              display: 'flex',
              alignItems: 'center',
              padding: '12px',
              fontSize: '14px',
              fontFamily: 'inherit',
              lineHeight: '1.5',
              whiteSpace: 'nowrap'
            }}
          >
            <span style={{ color: 'transparent' }}>{searchInput}</span>
            <span style={{ color: '#9ca3af', opacity: 0.6 }}>{ghostText.substring(searchInput.length)}</span>
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          value={searchInput}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => !hideDropdown && predictions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className="location-search-input"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          autoFocus={autoFocus}
          inputMode="text"
          enterKeyHint="search"
          style={{ 
            position: 'relative', 
            zIndex: 2,
            background: enableInlineComplete && ghostText ? 'transparent' : 'white'
          }}
        />
      </div>
      
      {showDropdown && predictions.length > 0 && (
        <div 
          ref={dropdownRef}
          className="location-search-dropdown" 
          style={{ 
            zIndex: 100000,
            position: 'absolute'
          }}
        >
          {predictions.map((prediction, index) => (
            <div
              key={prediction.place_id}
              className={`location-search-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                selectPlace(prediction.place_id, prediction.description);
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="location-search-item-main">
                {prediction.structured_formatting.main_text}
              </div>
              <div className="location-search-item-secondary">
                {prediction.structured_formatting.secondary_text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LocationSearch;
