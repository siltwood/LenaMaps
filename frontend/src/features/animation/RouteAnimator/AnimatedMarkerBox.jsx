import React from 'react';
import './AnimatedMarkerBox.css';

const AnimatedMarkerBox = ({ currentModeIcon, isAnimating, segmentColor }) => {
  if (!isAnimating || !currentModeIcon) return null;

  return (
    <div className="animated-marker-box-outer">
      <div
        className="animated-marker-box-inner"
        style={{ backgroundColor: segmentColor || 'white' }}
      >
        <div className="marker-icon">{currentModeIcon}</div>
      </div>
    </div>
  );
};

export default AnimatedMarkerBox;
