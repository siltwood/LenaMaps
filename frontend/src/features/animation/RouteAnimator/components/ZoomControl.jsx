import React from 'react';

/**
 * ZoomControl - View mode selector (Follow/Whole)
 */
const ZoomControl = ({ zoomLevel, onChange, isAnimating, isPaused, isMobile = false }) => {
  const modes = [
    { value: 'follow', label: 'Follow', sublabel: 'Marker' },
    { value: 'whole', label: 'Whole', sublabel: 'Route' }
  ];

  // Disable zoom controls when animation is playing (not paused)
  const isDisabled = isAnimating && !isPaused;

  return (
    <div className="zoom-control">
      <div className="zoom-radio-group">
        {modes.map(({ value, label, sublabel }) => (
          <label
            key={value}
            className={`zoom-radio ${zoomLevel === value ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
          >
            <input
              type="radio"
              name="zoom"
              value={value}
              checked={zoomLevel === value}
              onChange={() => !isDisabled && onChange(value)}
              disabled={isDisabled}
            />
            <span>{label}</span>
            <small>{sublabel}</small>
          </label>
        ))}
      </div>
    </div>
  );
};

export default ZoomControl;
