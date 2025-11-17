/**
 * Map centering utilities for consistent positioning across the app
 */

/**
 * Center map on a location with mobile-specific positioning
 * On mobile: positions marker horizontally centered, 180px from top of screen
 * On desktop: centers marker normally
 *
 * @param {google.maps.Map} map - Google Maps instance
 * @param {Object} location - Location object with lat/lng
 * @param {boolean} isMobile - Whether device is mobile
 * @param {boolean} useSetCenter - Use setCenter (instant) vs panTo (animated)
 */
export const centerMapOnLocation = (map, location, isMobile, useSetCenter = false) => {
  if (!map || !location?.lat || !location?.lng) return;

  const point = new window.google.maps.LatLng(location.lat, location.lng);
  const centerMethod = useSetCenter ? 'setCenter' : 'panTo';

  // On mobile, position marker horizontally centered, 180px from top
  if (isMobile) {
    const mapDiv = map.getDiv();
    const mapHeight = mapDiv.offsetHeight;

    // First center the marker normally
    map[centerMethod](point);

    // Then shift the map down so marker appears at 180px from top
    // We need to pan DOWN by (mapHeight/2 - 180) pixels
    const pixelOffsetY = (mapHeight / 2) - 180;

    // Use panBy to shift in pixels (0 horizontal, positive = pan down)
    map.panBy(0, pixelOffsetY);
  } else {
    // Desktop: simple center
    map[centerMethod](point);
  }
};
