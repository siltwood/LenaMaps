import { useRef, useCallback, useEffect } from 'react';
import { TRANSPORT_ICONS } from '../../../../constants/transportationModes';

/**
 * useMarkerAnimation - Manages animated marker for route animation
 *
 * Handles marker creation, scaling based on zoom level, and cleanup.
 * Uses Google Maps Advanced Marker API for smooth animations.
 *
 * @param {google.maps.Map} map - Google Maps instance
 * @param {boolean} isAnimating - Whether animation is currently running
 * @returns {Object} Marker management functions and ref
 */
export const useMarkerAnimation = (map, isAnimating) => {
  const markerRef = useRef(null);
  const currentZoomRef = useRef(13);
  const zoomListenerRef = useRef(null);

  /**
   * Calculate marker scale based on zoom level
   */
  const getMarkerScale = useCallback((zoom) => {
    // Base scale at zoom 13
    const baseZoom = 13;
    const maxScale = 1.2;  // Maximum scale at high zoom
    const minScale = 0.5;  // Minimum scale at low zoom

    // Scale decreases as you zoom out
    const scaleFactor = Math.pow(2, (zoom - baseZoom) * 0.15);
    return Math.max(minScale, Math.min(maxScale, scaleFactor));
  }, []);

  /**
   * Update marker visual scale based on current zoom
   */
  const updateMarkerScale = useCallback(() => {
    if (!map || !markerRef.current) return;

    const newZoom = map.getZoom();
    currentZoomRef.current = newZoom;
    const scale = getMarkerScale(newZoom);

    if (window.google?.maps?.marker?.AdvancedMarkerElement && markerRef.current.content) {
      const currentMode = markerRef.current._currentMode || 'walk';
      const content = document.createElement('div');
      const size = 50 * scale;
      const fontSize = 24 * scale;
      const borderWidth = 4 * scale;

      content.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        background-color: #000000;
        border-radius: 50%;
        border: ${borderWidth}px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${fontSize}px;
        box-shadow: 0 ${4 * scale}px ${8 * scale}px rgba(0,0,0,0.4);
        cursor: pointer;
        transition: background-color 0.3s ease;
      `;
      content.textContent = TRANSPORT_ICONS[currentMode];
      markerRef.current.content = content;
    }
  }, [map, getMarkerScale]);

  /**
   * Create animated marker at specified position
   */
  const createMarker = useCallback((position, mode = 'walk') => {
    if (!map || !window.google?.maps?.marker?.AdvancedMarkerElement) return null;

    // Clear existing marker if any
    if (markerRef.current) {
      clearMarker();
    }

    const zoom = map.getZoom();
    const scale = getMarkerScale(zoom);

    const content = document.createElement('div');
    const size = 50 * scale;
    const fontSize = 24 * scale;
    const borderWidth = 4 * scale;

    content.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      background-color: #000000;
      border-radius: 50%;
      border: ${borderWidth}px solid white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${fontSize}px;
      box-shadow: 0 ${4 * scale}px ${8 * scale}px rgba(0,0,0,0.4);
      cursor: pointer;
      transition: background-color 0.3s ease;
    `;
    content.textContent = TRANSPORT_ICONS[mode];

    const marker = new window.google.maps.marker.AdvancedMarkerElement({
      map,
      position,
      content,
      zIndex: 1000
    });

    // Store current mode on marker for updates
    marker._currentMode = mode;

    markerRef.current = marker;
    return marker;
  }, [map, getMarkerScale]);

  /**
   * Update marker mode (changes icon)
   */
  const updateMarkerMode = useCallback((mode) => {
    if (!markerRef.current) return;

    markerRef.current._currentMode = mode;
    updateMarkerScale(); // Re-render with new icon
  }, [updateMarkerScale]);

  /**
   * Clear/remove marker from map
   */
  const clearMarker = useCallback(() => {
    if (markerRef.current) {
      if (window.google?.maps?.marker?.AdvancedMarkerElement && markerRef.current.map !== undefined) {
        markerRef.current.map = null;
      } else if (markerRef.current.setMap) {
        markerRef.current.setMap(null);
      }
      markerRef.current = null;
    }
  }, []);

  /**
   * Set up zoom listener for marker scaling
   */
  useEffect(() => {
    if (!map) return;

    // Get initial zoom
    currentZoomRef.current = map.getZoom();

    // Listen for zoom changes
    zoomListenerRef.current = map.addListener('zoom_changed', updateMarkerScale);

    return () => {
      if (zoomListenerRef.current) {
        window.google.maps.event.removeListener(zoomListenerRef.current);
        zoomListenerRef.current = null;
      }
    };
  }, [map, updateMarkerScale]);

  /**
   * Clean up marker when component unmounts
   */
  useEffect(() => {
    return () => {
      clearMarker();
    };
  }, [clearMarker]);

  return {
    markerRef,
    createMarker,
    updateMarkerScale,
    updateMarkerMode,
    clearMarker,
    currentZoom: currentZoomRef.current
  };
};

export default useMarkerAnimation;
