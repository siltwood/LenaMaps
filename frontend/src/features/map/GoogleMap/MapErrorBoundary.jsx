import React from 'react';
import './MapErrorBoundary.css';

const MapErrorBoundary = ({ error, onRetry }) => {
  // Determine error type and message
  const getErrorDetails = () => {
    if (!error) {
      return {
        title: 'Maps Loading Issue',
        message: 'The map is taking longer than expected to load.',
        icon: '🗺️'
      };
    }

    const errorString = error.toString().toLowerCase();
    
    if (errorString.includes('quota') || errorString.includes('limit exceeded')) {
      return {
        title: 'Daily Map Limit Reached',
        message: 'We\'ve hit our daily Google Maps limit. The map may show watermarks or have limited functionality. Please try again tomorrow.',
        icon: '📊'
      };
    }
    
    if (errorString.includes('api key') || errorString.includes('invalid key')) {
      return {
        title: 'API Key Issue',
        message: 'There\'s a problem with the Google Maps API configuration. Please contact the site owner.',
        icon: '🔑'
      };
    }
    
    if (errorString.includes('billing') || errorString.includes('payment')) {
      return {
        title: 'Billing Issue',
        message: 'The Google Maps API billing needs attention. Please contact the site owner.',
        icon: '💳'
      };
    }
    
    if (errorString.includes('network') || errorString.includes('connection')) {
      return {
        title: 'Connection Problem',
        message: 'Unable to connect to Google Maps. Please check your internet connection.',
        icon: '🌐'
      };
    }
    
    return {
      title: 'Maps Unavailable',
      message: 'Google Maps is temporarily unavailable. Please try again in a few moments.',
      icon: '⚠️'
    };
  };

  const { title, message, icon } = getErrorDetails();
  const errorString = error ? error.toString().toLowerCase() : '';

  return (
    <div className="map-error-boundary">
      <div className="error-container">
        <div className="error-icon">{icon}</div>
        <h2>{title}</h2>
        <p>{message}</p>
        
        {error && (
          <details className="error-details">
            <summary>Technical Details</summary>
            <code>{error.toString()}</code>
          </details>
        )}
        
        <div className="error-actions">
          <button onClick={onRetry} className="retry-button">
            🔄 Try Again
          </button>
        </div>
        
        {errorString.includes('quota') && (
          <div className="error-tips">
            <h4>What this means:</h4>
            <ul>
              <li>The map may show "For development purposes only" watermarks</li>
              <li>Some features like search or directions might not work</li>
              <li>Already loaded maps will continue to display</li>
              <li>Service typically resets at midnight Pacific Time</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapErrorBoundary;
