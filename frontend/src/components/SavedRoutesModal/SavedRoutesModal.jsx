import React, { useState, useEffect } from 'react';
import { 
  getSavedRoutes, 
  deleteRoute, 
  updateRouteName
} from '../../utils/savedRoutesUtils';
import './SavedRoutesModal.css';

function SavedRoutesModal({ isOpen, onClose, onLoadRoute }) {
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSavedRoutes(getSavedRoutes());
      // Reset state when opening
      setEditingId(null);
      setEditingName('');
      setSearchTerm('');
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
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
  }, [isOpen]);

  const handleDelete = (routeId) => {
    deleteRoute(routeId);
    setSavedRoutes(getSavedRoutes());
  };

  const handleRename = (routeId, currentName) => {
    setEditingId(routeId);
    setEditingName(currentName);
  };

  const handleSaveRename = () => {
    if (editingId && editingName.trim()) {
      updateRouteName(editingId, editingName.trim());
      setSavedRoutes(getSavedRoutes());
      setEditingId(null);
      setEditingName('');
    }
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleLoad = (route) => {
    onLoadRoute(route);
    onClose();
  };
  
  const handleClose = () => {
    // Reset any editing state when closing
    setEditingId(null);
    setEditingName('');
    setSearchTerm('');
    onClose();
  };


  const filteredRoutes = savedRoutes.filter(route =>
    route.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (route.description && route.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const formatLocationName = (location) => {
    if (location.name) return location.name;
    if (location.formatted_address) return location.formatted_address;
    return `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
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
      className="saved-routes-modal-overlay" 
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
        className="saved-routes-modal" 
        onClick={handleModalClick}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <div className="saved-routes-header">
          <h2>Saved Routes</h2>
          <button className="close-button" onClick={handleClose}>×</button>
        </div>

        <div className="saved-routes-controls">
          <input
            type="text"
            placeholder="Search saved routes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
            style={{ width: '100%' }}
          />
        </div>

        <div className="saved-routes-list">
          {filteredRoutes.length === 0 ? (
            <div className="no-routes">
              {searchTerm ? 'No routes found matching your search.' : 'No saved routes yet.'}
            </div>
          ) : (
            filteredRoutes.map(route => (
              <div key={route.id} className="saved-route-item">
                <div className="route-header">
                  {editingId === route.id ? (
                    <div className="edit-name">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSaveRename()}
                        autoFocus
                      />
                      <button onClick={handleSaveRename}>✓</button>
                      <button onClick={handleCancelRename}>✗</button>
                    </div>
                  ) : (
                    <>
                      <h3>{route.name}</h3>
                      <div className="route-date">
                        {new Date(route.savedAt).toLocaleString()}
                      </div>
                    </>
                  )}
                </div>
                
                {route.description && (
                  <div className="route-description">{route.description}</div>
                )}

                <div className="route-locations">
                  <div className="location-count">
                    {route.locations.length} location{route.locations.length !== 1 ? 's' : ''}
                  </div>
                  <div className="location-preview">
                    {route.locations.slice(0, 2).map((loc, idx) => (
                      <div key={idx} className="location-item">
                        <span className="location-marker">{String.fromCharCode(65 + idx)}</span>
                        <span className="location-name">{formatLocationName(loc)}</span>
                      </div>
                    ))}
                    {route.locations.length > 2 && (
                      <div className="more-locations">
                        +{route.locations.length - 2} more location{route.locations.length - 2 !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>

                <div className="route-modes">
                  {route.modes.map((mode, idx) => (
                    <span key={idx} className={`mode-badge mode-${mode}`}>
                      {mode}
                    </span>
                  ))}
                </div>

                <div className="route-actions">
                  <button onClick={() => handleLoad(route)} className="load-button">
                    Load
                  </button>
                  <button onClick={() => handleRename(route.id, route.name)} className="rename-button">
                    Rename
                  </button>
                  <button onClick={() => handleDelete(route.id)} className="delete-button">
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default SavedRoutesModal;