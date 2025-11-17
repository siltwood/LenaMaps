import React from 'react';

/**
 * ActionButtons - Route action buttons (Reset, Load, Save, Share, Play)
 */
const ActionButtons = ({
  hasLocations,
  hasRoute,
  showCopiedMessage,
  onReset,
  onLoadClick,
  onSaveClick,
  onShare,
  onPlayClick,
  showAnimationPanel,
  onCloseAnimationPanel,
  showMileage,
  onToggleMileage,
  showEffects,
  onToggleEffects,
  hasEnabledEffects
}) => {
  const buttonBaseStyle = {
    padding: '4px 8px',
    backgroundColor: '#f3f4f6',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '28px',
    height: '28px'
  };

  const disabledStyle = {
    ...buttonBaseStyle,
    color: '#d1d5db',
    borderColor: '#e5e7eb',
    cursor: 'not-allowed',
    opacity: 0.5
  };

  const enabledStyle = {
    ...buttonBaseStyle,
    color: '#374151'
  };

  const handleMouseEnter = (e, isHighlighted, highlightColor, highlightBorder) => {
    if (!e.currentTarget.disabled) {
      if (!isHighlighted) {
        e.currentTarget.style.backgroundColor = '#e5e7eb';
        e.currentTarget.style.borderColor = '#9ca3af';
      }
    }
  };

  const handleMouseLeave = (e, isDisabled, isHighlighted, highlightColor, highlightBorder) => {
    if (isHighlighted) {
      e.currentTarget.style.backgroundColor = highlightColor;
      e.currentTarget.style.borderColor = highlightBorder;
    } else {
      e.currentTarget.style.backgroundColor = '#f3f4f6';
      e.currentTarget.style.borderColor = isDisabled ? '#e5e7eb' : '#d1d5db';
    }
  };

  const animateButtonStyle = {
    padding: '8px 16px',
    backgroundColor: '#10b981',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#059669',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'white',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '28px',
    whiteSpace: 'nowrap'
  };

  const handleAnimateMouseEnter = (e) => {
    e.currentTarget.style.backgroundColor = '#059669';
    e.currentTarget.style.borderColor = '#047857';
  };

  const handleAnimateMouseLeave = (e) => {
    e.currentTarget.style.backgroundColor = '#10b981';
    e.currentTarget.style.borderColor = '#059669';
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      marginBottom: '8px'
    }}>
      {/* Action buttons row with Animate/Close button */}
      <div style={{ display: 'flex', gap: '4px', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {/* Reset button */}
        <button
          onClick={onReset}
          disabled={!hasLocations}
          style={hasLocations ? enabledStyle : disabledStyle}
          title="Reset route"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={(e) => handleMouseLeave(e, !hasLocations)}
        >
          🔄
        </button>

        {/* Load button */}
        <button
          onClick={onLoadClick}
          style={enabledStyle}
          title="Load saved route"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={(e) => handleMouseLeave(e, false)}
        >
          📂
        </button>

        {/* Save button */}
        <button
          onClick={onSaveClick}
          disabled={!hasLocations}
          style={hasLocations ? enabledStyle : disabledStyle}
          title="Save route"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={(e) => handleMouseLeave(e, !hasLocations)}
        >
          💾
        </button>

        {/* Share button */}
        <button
          onClick={onShare}
          disabled={!hasRoute}
          style={hasRoute ? enabledStyle : disabledStyle}
          title="Share route (copy link)"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={(e) => handleMouseLeave(e, !hasRoute)}
        >
          {showCopiedMessage ? '✅' : '🔗'}
        </button>

        {/* Mileage toggle button */}
        {onToggleMileage && (
          <button
            onClick={onToggleMileage}
            disabled={!hasRoute}
            style={{
              ...(hasRoute ? enabledStyle : disabledStyle),
              backgroundColor: showMileage ? '#e0e7ff' : (hasRoute ? '#f3f4f6' : '#f3f4f6'),
              borderColor: showMileage ? '#818cf8' : (hasRoute ? '#d1d5db' : '#e5e7eb')
            }}
            title="Toggle distance breakdown"
            onMouseEnter={(e) => handleMouseEnter(e, showMileage, '#e0e7ff', '#818cf8')}
            onMouseLeave={(e) => handleMouseLeave(e, !hasRoute, showMileage, '#e0e7ff', '#818cf8')}
          >
            📏
          </button>
        )}

        {/* Effects toggle button */}
        {onToggleEffects && (
          <button
            onClick={onToggleEffects}
            disabled={!hasRoute}
            style={{
              ...(hasRoute ? enabledStyle : disabledStyle),
              backgroundColor: showEffects ? '#fef3c7' : (hasRoute ? '#f3f4f6' : '#f3f4f6'),
              borderColor: showEffects ? '#fbbf24' : (hasRoute ? '#d1d5db' : '#e5e7eb')
            }}
            title="Toggle animation effects"
            onMouseEnter={(e) => handleMouseEnter(e, showEffects, '#fef3c7', '#fbbf24')}
            onMouseLeave={(e) => handleMouseLeave(e, !hasRoute, showEffects, '#fef3c7', '#fbbf24')}
          >
            ✨
          </button>
        )}
        </div>

        {/* Right side: Animate button or Close button */}
        {hasRoute && onPlayClick && !showAnimationPanel && (
          <button
            onClick={onPlayClick}
            style={animateButtonStyle}
            title="Show animation controls"
            onMouseEnter={handleAnimateMouseEnter}
            onMouseLeave={handleAnimateMouseLeave}
          >
            Animate your route!
          </button>
        )}

        {showAnimationPanel && onCloseAnimationPanel && (
          <button
            onClick={onCloseAnimationPanel}
            style={enabledStyle}
            title="Close animation controls"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={(e) => handleMouseLeave(e, false)}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};

export default ActionButtons;
