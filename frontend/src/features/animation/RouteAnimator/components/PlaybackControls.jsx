import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faPause, faStop } from '@fortawesome/free-solid-svg-icons';

/**
 * PlaybackControls - Animation playback buttons (Play/Pause/Stop)
 */
const PlaybackControls = ({
  isAnimating,
  isPaused,
  onPlay,
  onPause,
  onResume,
  onStop,
  isMobile = false,
  disabled = false
}) => {
  const buttonClass = isMobile ? 'mobile-control-btn' : 'control-btn';

  if (!isAnimating) {
    return (
      <button
        onClick={onPlay}
        className={`${buttonClass} play`}
        title={disabled ? "No route available" : "Start Animation"}
        disabled={disabled}
      >
        <FontAwesomeIcon icon={faPlay} />
      </button>
    );
  }

  return (
    <>
      {isPaused ? (
        <button onClick={onResume} className={`${buttonClass} play`} title="Resume">
          <FontAwesomeIcon icon={faPlay} />
        </button>
      ) : (
        <button onClick={onPause} className={`${buttonClass} pause`} title="Pause">
          <FontAwesomeIcon icon={faPause} />
        </button>
      )}
      <button onClick={onStop} className={`${buttonClass} stop`} title="Exit Animation">
        <FontAwesomeIcon icon={faStop} />
      </button>
    </>
  );
};

export default PlaybackControls;
