import React, { useState, useEffect } from 'react';
import './SaveRouteModal.css';

function SaveRouteModal({ isOpen, onClose, onSave, defaultName }) {
  const [routeName, setRouteName] = useState(defaultName || '');
  const [description, setDescription] = useState('');

  // Prevent body scroll when modal is open and reset state when opening
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      // Reset form when opening with default name
      setRouteName(defaultName || '');
      setDescription('');
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [isOpen, defaultName]);

  const handleSave = () => {
    if (routeName.trim()) {
      onSave({
        name: routeName.trim(),
        description: description.trim()
      });
      // Close will trigger the useEffect to reset state
      onClose();
    }
  };
  
  const handleClose = () => {
    // Just close, state will be reset in useEffect
    onClose();
  };

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    // Only close if clicking directly on the overlay
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleModalClick = (e) => {
    e.stopPropagation();
  };

  return (
    <div 
      className="save-route-modal-overlay" 
      onClick={handleOverlayClick}
      onTouchEnd={handleOverlayClick}
      onTouchStart={(e) => {
        // Prevent scrolling of background
        e.preventDefault();
      }}
      onTouchMove={(e) => {
        // Prevent scrolling of background
        e.preventDefault();
      }}
    >
      <div 
        className="save-route-modal" 
        onClick={handleModalClick}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <div className="save-route-header">
          <h2>Save Route</h2>
          <button className="close-button" onClick={handleClose}>×</button>
        </div>

        <div className="save-route-content">
          <div className="input-group">
            <label htmlFor="route-name">Route Name *</label>
            <input
              id="route-name"
              type="text"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="Enter a name for this route"
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>

          <div className="input-group">
            <label htmlFor="route-description">Description (optional)</label>
            <textarea
              id="route-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description for this route"
              rows="3"
            />
          </div>
        </div>

        <div className="save-route-footer">
          <button className="cancel-button" onClick={handleClose}>
            Cancel
          </button>
          <button 
            className="save-button" 
            onClick={handleSave}
            disabled={!routeName.trim()}
          >
            Save Route
          </button>
        </div>
      </div>
    </div>
  );
}

export default SaveRouteModal;