import React from 'react';

/**
 * TimelineScrubber - Timeline progress bar and scrubber for animation
 *
 * Displays animation progress and allows user to scrub to any position
 */
const TimelineScrubber = ({
  animationProgress,
  onChange,
  isMobile = false,
  showLabel = false
}) => {
  return (
    <div className="timeline-control">
      {showLabel && <label>Timeline Scrubber</label>}
      <div className="timeline-container">
        <div className="timeline-track">
          <div
            className="timeline-progress"
            style={{
              width: `${animationProgress}%`,
              transition: 'none'
            }}
            key={showLabel ? `progress-${Math.floor(animationProgress)}` : undefined}
          ></div>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={animationProgress}
          onChange={onChange}
          className={isMobile ? `timeline-slider mobile-thumb` : 'timeline-slider'}
        />
        <div className="timeline-labels">
          <span>0%</span>
          <span>{Math.round(animationProgress)}%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
};

export default TimelineScrubber;
