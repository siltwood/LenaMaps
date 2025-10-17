import React from 'react';
import DragHandle from '../../common/DragHandle';

const DirectionsHeader = ({ 
  isEditing, 
  editingTrip, 
  onUndo, 
  onClear, 
  onClose,
  onMinimize,
  canUndo,
  canClear = false,
  getUndoTooltip,
  lastAction
}) => {
  return (
    <div className="directions-header">
      <DragHandle />
      <h4>{isEditing ? `Edit: ${editingTrip?.name}` : 'Visualize Your Route'}</h4>
      <div className="header-buttons">
        <button 
          className="header-action-btn undo-btn" 
          onClick={onUndo}
          disabled={!canUndo}
          title={getUndoTooltip(lastAction)}
        >
          ↩️
        </button>
        <button 
          className="header-action-btn clear-btn" 
          onClick={onClear}
          disabled={!canClear}
          title="Reset route"
        >
          🔄
        </button>
        <button className="minimize-button" onClick={onMinimize} title="Minimize panel">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 9h8v1H4z"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default DirectionsHeader;
