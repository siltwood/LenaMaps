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
  isMobile = false
}) => {
  const buttonClass = isMobile ? 'mobile-control-btn' : 'control-btn';

  if (!isAnimating) {
    return (
      <button onClick={onPlay} className={`${buttonClass} play`}>
        <FontAwesomeIcon icon={faPlay} /> {isMobile ? 'Play' : 'Start Animation'}
      </button>
    );
  }

  return (
    <>
      {isPaused ? (
        <button onClick={onResume} className={`${buttonClass} play`}>
          <FontAwesomeIcon icon={faPlay} /> Resume
        </button>
      ) : (
        <button onClick={onPause} className={`${buttonClass} pause`}>
          <FontAwesomeIcon icon={faPause} /> Pause
        </button>
      )}
      <button onClick={onStop} className={`${buttonClass} stop`}>
        <FontAwesomeIcon icon={faStop} /> {isMobile ? 'Stop' : 'Exit Animation'}
      </button>
    </>
  );
};

export default PlaybackControls;
