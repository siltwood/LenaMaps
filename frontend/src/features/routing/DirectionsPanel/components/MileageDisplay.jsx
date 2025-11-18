import React, { useState, useEffect, useMemo } from 'react';
import { TRANSPORT_ICONS } from '../../../../constants/transportationModes';

/**
 * MileageDisplay - Shows distance breakdown by transport mode
 * Supports km/miles toggle with localStorage persistence
 */
const MileageDisplay = ({ directionsRoute, onDisplayModeChange }) => {
  // Get segments from window._routeSegments or directionsRoute
  const segments = useMemo(() => {
    return window._routeSegments || [];
  }, [directionsRoute]); // Recalculate when directionsRoute changes
  // Get unit preference from localStorage, default to 'km'
  const [unit, setUnit] = useState(() => {
    return localStorage.getItem('distanceUnit') || 'km';
  });

  // Display mode for on-map distance display
  const [displayMode, setDisplayMode] = useState('none'); // 'none', 'byLeg', 'byMode', 'total'

  // Save unit preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('distanceUnit', unit);
  }, [unit]);

  // Calculate distance using Haversine formula (for custom segments)
  const calculateDistance = (start, end) => {
    const R = 6371; // Earth's radius in km
    const lat1 = start.lat * Math.PI / 180;
    const lat2 = end.lat * Math.PI / 180;
    const deltaLat = (end.lat - start.lat) * Math.PI / 180;
    const deltaLng = (end.lng - start.lng) * Math.PI / 180;

    const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
  };

  // Calculate mileage breakdown by individual legs
  const legBreakdown = useMemo(() => {
    if (!segments || segments.length === 0) return [];

    const legs = [];

    segments.forEach((segment, index) => {
      if (!segment || !segment.mode) return;

      let distanceKm = 0;

      // Get distance from segment
      if (segment.distance && segment.distance.value) {
        // Regular segment with distance already calculated (in meters)
        distanceKm = segment.distance.value / 1000;
      } else if (segment.isCustom && segment.customPath && segment.customPath.length === 2) {
        // Custom segment - calculate distance
        distanceKm = calculateDistance(segment.customPath[0], segment.customPath[1]);
      } else if (segment.route?.routes?.[0]?.legs?.[0]?.distance?.value) {
        // Fallback: check route object
        distanceKm = segment.route.routes[0].legs[0].distance.value / 1000;
      }

      if (distanceKm > 0) {
        // Get location labels (A, B, C, etc.)
        const startLabel = String.fromCharCode(65 + index); // A=65, B=66, etc.
        const endLabel = String.fromCharCode(65 + index + 1);

        legs.push({
          mode: segment.mode,
          distance: distanceKm,
          startLabel,
          endLabel,
          index
        });
      }
    });

    return legs;
  }, [segments]);

  // Convert km to miles
  const toMiles = (km) => km * 0.621371;

  // Format distance based on unit preference
  const formatDistance = (km) => {
    if (unit === 'mi') {
      const miles = toMiles(km);
      return miles < 0.1 ? miles.toFixed(3) : miles.toFixed(1);
    }
    return km < 0.1 ? km.toFixed(3) : km.toFixed(1);
  };

  // Calculate total distance
  const totalKm = legBreakdown.reduce((sum, leg) => sum + leg.distance, 0);

  // Calculate distance breakdown by transport mode
  const modeBreakdown = useMemo(() => {
    const breakdown = {};

    legBreakdown.forEach(leg => {
      if (!breakdown[leg.mode]) {
        breakdown[leg.mode] = 0;
      }
      breakdown[leg.mode] += leg.distance;
    });

    return Object.entries(breakdown).map(([mode, distance]) => ({
      mode,
      distance
    }));
  }, [legBreakdown]);

  // Mode display names
  const modeNames = {
    walk: 'Walk',
    bike: 'Bike',
    car: 'Car',
    bus: 'Bus',
    transit: 'Rail',
    ferry: 'Ferry',
    flight: 'Flight'
  };

  // Notify parent when display mode or data changes
  useEffect(() => {
    if (onDisplayModeChange) {
      let data = null;

      if (displayMode === 'byLeg') {
        data = legBreakdown.map(leg => ({
          label: `${leg.startLabel} → ${leg.endLabel}`,
          mode: leg.mode,
          distance: formatDistance(leg.distance),
          unit
        }));
      } else if (displayMode === 'byMode') {
        data = modeBreakdown.map(item => ({
          label: modeNames[item.mode] || item.mode,
          mode: item.mode,
          distance: formatDistance(item.distance),
          unit
        }));
      } else if (displayMode === 'total') {
        data = [{
          label: 'Total Distance',
          distance: formatDistance(totalKm),
          unit
        }];
      }

      const displayInfo = {
        mode: displayMode,
        data,
        unit
      };

      onDisplayModeChange(displayInfo);
    }
  }, [displayMode, legBreakdown, modeBreakdown, totalKm, unit, onDisplayModeChange]);

  const handleDisplayModeChange = (mode) => {
    const newMode = displayMode === mode ? 'none' : mode;
    setDisplayMode(newMode);
  };

  if (totalKm === 0 || legBreakdown.length === 0) {
    return null; // Don't show if no route
  }

  return (
    <div className="mileage-display">
      <div className="mileage-header">
        <span className="mileage-title">Distance Breakdown</span>
        <div className="unit-toggle">
          <button
            className={`unit-btn ${unit === 'km' ? 'active' : ''}`}
            onClick={() => setUnit('km')}
          >
            km
          </button>
          <button
            className={`unit-btn ${unit === 'mi' ? 'active' : ''}`}
            onClick={() => setUnit('mi')}
          >
            mi
          </button>
        </div>
      </div>

      <div className="mileage-list">
        {legBreakdown.map((leg, idx) => {
          return (
            <div key={`${leg.index}-${leg.mode}`} className="mileage-item">
              <span className="mode-icon">{TRANSPORT_ICONS[leg.mode]}</span>
              <span className="mode-name">
                {leg.startLabel} → {leg.endLabel}
              </span>
              <span className="mode-distance">
                {formatDistance(leg.distance)} {unit}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mileage-total">
        <span className="total-label">Total</span>
        <span className="total-distance">
          {formatDistance(totalKm)} {unit}
        </span>
      </div>

      <div className="map-display-toggles">
        <div className="toggle-label">Display on map:</div>
        <div className="toggle-options-row">
          <label className="toggle-option">
            <input
              type="checkbox"
              checked={displayMode === 'byLeg'}
              onChange={() => handleDisplayModeChange('byLeg')}
            />
            <span>By leg</span>
          </label>
          <label className="toggle-option">
            <input
              type="checkbox"
              checked={displayMode === 'byMode'}
              onChange={() => handleDisplayModeChange('byMode')}
            />
            <span>By mode</span>
          </label>
          <label className="toggle-option">
            <input
              type="checkbox"
              checked={displayMode === 'total'}
              onChange={() => handleDisplayModeChange('total')}
            />
            <span>Total</span>
          </label>
        </div>
      </div>
    </div>
  );
};

export default MileageDisplay;
