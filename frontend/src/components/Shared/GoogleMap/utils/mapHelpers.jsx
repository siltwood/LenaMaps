import { TRANSPORTATION_COLORS } from './constants';

// Get color for transportation mode
export const getTransportationColor = (mode) => {
  return TRANSPORTATION_COLORS[mode] || "#3b82f6";
};

// Helper function to clear Advanced Markers
export const clearAdvancedMarker = (marker) => {
  if (marker) {
    marker.map = null;
  }
};

// Helper function to create HTML content for Advanced Markers
export const createMarkerContent = (icon, color, isTransition = false, icon2 = null, color2 = null, scale = 1) => {
  const content = document.createElement('div');
  
  if (isTransition && icon2 && color2) {
    // Transition marker with two icons - with white borders for consistency
    content.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      gap: ${4 * scale}px;
      position: relative;
    `;

    const leftDiv = document.createElement('div');
    leftDiv.style.cssText = `
      width: ${44 * scale}px;
      height: ${44 * scale}px;
      background-color: ${color};
      border: ${3 * scale}px solid white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${20 * scale}px;
      box-shadow: 0 ${2 * scale}px ${6 * scale}px rgba(0,0,0,0.3);
    `;
    leftDiv.textContent = icon;

    const rightDiv = document.createElement('div');
    rightDiv.style.cssText = `
      width: ${44 * scale}px;
      height: ${44 * scale}px;
      background-color: ${color2};
      border: ${3 * scale}px solid white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${20 * scale}px;
      box-shadow: 0 ${2 * scale}px ${6 * scale}px rgba(0,0,0,0.3);
    `;
    rightDiv.textContent = icon2;

    content.appendChild(leftDiv);
    content.appendChild(rightDiv);
  } else {
    // Single icon marker
    content.style.cssText = `
      width: ${44 * scale}px;
      height: ${44 * scale}px;
      background-color: ${color};
      border: ${3 * scale}px solid white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${20 * scale}px;
      box-shadow: 0 ${2 * scale}px ${6 * scale}px rgba(0,0,0,0.3);
    `;
    content.textContent = icon;
  }
  
  return content;
};

// Create polyline options for routes
export const createPolylineOptions = (mode, color) => {
  const baseOptions = {
    strokeColor: color || getTransportationColor(mode),
    strokeWeight: 5,
    strokeOpacity: 0.8
  };
  
  // Make walking routes dotted
  if (mode === 'walk') {
    baseOptions.strokeOpacity = 0;
    baseOptions.icons = [{
      icon: {
        path: 'M 0,-1 0,1',
        strokeOpacity: 1,
        strokeColor: color || getTransportationColor(mode),
        scale: 3
      },
      offset: '0',
      repeat: '20px'
    }];
  }
  
  // Add train symbols for transit routes
  if (mode === 'transit') {
    baseOptions.strokeColor = '#ec4899'; // Pink color for transit
    baseOptions.strokeWeight = 6;
    baseOptions.strokeOpacity = 0.7;
    baseOptions.icons = [
      // Railroad track pattern
      {
        icon: {
          path: 'M -2,-1 L 2,-1 M -2,1 L 2,1', // Railroad ties
          strokeColor: '#ec4899',
          strokeOpacity: 1,
          strokeWeight: 2,
          scale: 2
        },
        offset: '0',
        repeat: '20px'
      }
    ];
  }
  
  return baseOptions;
};
