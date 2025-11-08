import React from 'react';

const DirectionsHeader = ({
  isEditing,
  editingTrip,
  onMinimize,
  isMobile = false
}) => {
  return (
    <div className="directions-header">
      {!isMobile && <h4>{isEditing ? `Edit: ${editingTrip?.name}` : 'Plan Your Route'}</h4>}
      {!isMobile && (
        <div className="header-buttons">
          <button className="minimize-button" onClick={onMinimize} title="Minimize panel">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 9h8v1H4z"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default DirectionsHeader;
