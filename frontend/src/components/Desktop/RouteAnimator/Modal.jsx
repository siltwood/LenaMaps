import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faInfoCircle, faExclamationTriangle, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import { isMobileDevice } from '../../../utils/deviceDetection';
import './Modal.css';

const Modal = ({ isOpen, onClose, title, message, type = 'info' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const isMobile = isMobileDevice();

  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure CSS is loaded before showing
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // Don't render if not open
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <FontAwesomeIcon icon={faCheckCircle} className="route-modal-icon success" />;
      case 'warning':
        return <FontAwesomeIcon icon={faExclamationTriangle} className="route-modal-icon warning" />;
      case 'error':
        return <FontAwesomeIcon icon={faExclamationTriangle} className="route-modal-icon error" />;
      default:
        return <FontAwesomeIcon icon={faInfoCircle} className="route-modal-icon info" />;
    }
  };

  return ReactDOM.createPortal(
    <div className={`route-modal-overlay ${isVisible ? 'visible' : ''}`} onClick={onClose}>
      <div className="route-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="route-modal-close" onClick={onClose}>
          <FontAwesomeIcon icon={faTimes} />
        </button>
        
        <div className="route-modal-body">
          {getIcon()}
          {title && <h3 className="route-modal-title">{title}</h3>}
          <div className="route-modal-message">
            {message.split('\n').map((line, index) => (
              <p key={index} style={{ margin: '4px 0' }}>{line || '\u00A0'}</p>
            ))}
          </div>
        </div>
        
        <div className="route-modal-footer">
          <button className="route-modal-button" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
