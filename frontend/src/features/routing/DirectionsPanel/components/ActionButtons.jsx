import React from 'react';

/**
 * ActionButtons - Route action buttons (Reset, Load, Save, Share)
 */
const ActionButtons = ({
  hasLocations,
  hasRoute,
  showCopiedMessage,
  onReset,
  onLoadClick,
  onSaveClick,
  onShare
}) => {
  const buttonBaseStyle = {
    padding: '4px 8px',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
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
    border: '1px solid #e5e7eb',
    cursor: 'not-allowed',
    opacity: 0.5
  };

  const enabledStyle = {
    ...buttonBaseStyle,
    color: '#374151'
  };

  const handleMouseEnter = (e) => {
    if (!e.currentTarget.disabled) {
      e.currentTarget.style.backgroundColor = '#e5e7eb';
      e.currentTarget.style.borderColor = '#9ca3af';
    }
  };

  const handleMouseLeave = (e, isDisabled) => {
    e.currentTarget.style.backgroundColor = '#f3f4f6';
    e.currentTarget.style.borderColor = isDisabled ? '#e5e7eb' : '#d1d5db';
  };

  return (
    <div style={{
      display: 'flex',
      gap: '4px',
      marginBottom: '8px',
      justifyContent: 'flex-start'
    }}>
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
    </div>
  );
};

export default ActionButtons;
