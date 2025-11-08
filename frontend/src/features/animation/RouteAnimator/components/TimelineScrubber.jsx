import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * TimelineScrubber - Custom drag-based timeline scrubber
 *
 * Built from scratch for smooth dragging and precise control
 */
const TimelineScrubber = ({
  animationProgress,
  onChange,
  isMobile = false,
  showLabel = false
}) => {
  const trackRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localProgress, setLocalProgress] = useState(animationProgress);
  const lastPropProgress = useRef(animationProgress);

  // Sync local progress with prop only when prop actually changes (animation is running)
  useEffect(() => {
    if (!isDragging && animationProgress !== lastPropProgress.current) {
      setLocalProgress(animationProgress);
      lastPropProgress.current = animationProgress;
    }
  }, [animationProgress, isDragging]);

  const updateProgress = useCallback((clientX) => {
    if (!trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const percentage = (x / rect.width) * 100;

    // Update local state immediately for smooth dragging
    setLocalProgress(percentage);

    // Pass the value directly to parent
    onChange(percentage);
  }, [onChange]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    updateProgress(e.clientX);
  }, [updateProgress]);

  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    updateProgress(e.touches[0].clientX);
  }, [updateProgress]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    updateProgress(e.clientX);
  }, [isDragging, updateProgress]);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    updateProgress(e.touches[0].clientX);
  }, [isDragging, updateProgress]);

  const handleEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleEnd);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleEnd);
      };
    }
  }, [isDragging, handleMouseMove, handleTouchMove, handleEnd]);

  const displayProgress = isNaN(localProgress) ? 0 : localProgress;

  return (
    <div className="timeline-control">
      <div className="timeline-container-custom">
        <div
          ref={trackRef}
          className="timeline-track-custom"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          {/* Progress bar */}
          <div
            className="timeline-progress-custom"
            style={{ width: `${displayProgress}%` }}
          />

          {/* Draggable handle */}
          <div
            className="timeline-handle-custom"
            style={{ left: `${displayProgress}%` }}
          />
        </div>

        <div className="timeline-labels">
          <span>0%</span>
          <span>{Math.round(displayProgress)}%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
};

export default TimelineScrubber;
