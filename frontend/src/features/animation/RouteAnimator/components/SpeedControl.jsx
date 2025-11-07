import React from 'react';

/**
 * SpeedControl - Animation speed selector (Slow/Medium/Fast)
 */
const SpeedControl = ({ playbackSpeed, onChange, isMobile = false }) => {
  const speeds = [
    { value: 'slow', label: 'Slow', multiplier: '(0.5x)' },
    { value: 'medium', label: 'Medium', multiplier: '(1x)' },
    { value: 'fast', label: 'Fast', multiplier: '(2x)' }
  ];

  const radioGroupClass = isMobile ? 'zoom-radio-group' : 'speed-radio-group';
  const radioClass = isMobile ? 'zoom-radio' : 'speed-radio';

  return (
    <div className={isMobile ? 'zoom-control' : 'speed-control'}>
      <div className={radioGroupClass}>
        {speeds.map(({ value, label, multiplier }) => (
          <label key={value} className={`${radioClass} ${playbackSpeed === value ? 'active' : ''}`}>
            <input
              type="radio"
              name="speed"
              value={value}
              checked={playbackSpeed === value}
              onChange={() => onChange(value)}
            />
            <span>{label}</span>
            <small>{multiplier}</small>
          </label>
        ))}
      </div>
    </div>
  );
};

export default SpeedControl;
