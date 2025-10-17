// Transportation mode colors
export const TRANSPORTATION_COLORS = {
  walk: "#3b82f6",  // Blue
  bike: "#22c55e",  // Green
  bus: "#ef4444",   // Red
  car: "#f59e0b",   // Orange
  flight: "#8b5cf6", // Purple
  transit: "#ec4899"  // Pink for trains/transit
};

// Transportation icons
export const TRANSPORT_ICONS = {
  walk: '🚶',
  bike: '🚴',
  car: '🚗',
  bus: '🚌',
  flight: '✈️',
  transit: '🚆'  // Train emoji for transit
};

// Default map center (NYC)
export const DEFAULT_CENTER = { lat: 40.7505, lng: -73.9934 };

// Map configuration
export const MAP_CONFIG = {
  zoom: 13,
  mapTypeControl: true,
  streetViewControl: true,
  fullscreenControl: true,
  zoomControl: true,
  clickableIcons: false
  // Styles removed - using mapId controls styles via cloud console
};
