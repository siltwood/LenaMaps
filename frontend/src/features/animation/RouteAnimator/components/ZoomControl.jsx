import React from 'react';

/**
 * ZoomControl - View mode selector (Follow/Whole)
 */
const ZoomControl = ({ zoomLevel, onChange, isAnimating, isMobile = false }) => {
  const modes = [
    { value: 'follow', label: 'Follow', sublabel: 'Marker' },
    { value: 'whole', label: 'Whole', sublabel: 'Route' }
  ];

  return (
    <div className="zoom-control">
      <div className="zoom-radio-group">
        {modes.map(({ value, label, sublabel }) => (
          <label
            key={value}
            className={`zoom-radio ${zoomLevel === value ? 'active' : ''} ${isAnimating ? 'disabled' : ''}`}
          >
            <input
              type="radio"
              name="zoom"
              value={value}
              checked={zoomLevel === value}
              onChange={() => onChange(value)}
              disabled={isAnimating}
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
