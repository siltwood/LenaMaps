import React, { useState } from 'react';
import { Wrapper, Status } from '@googlemaps/react-wrapper';
import MapComponent from './components/MapComponent';
import MapErrorBoundary from './MapErrorBoundary';

const GoogleMap = (props) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const [retryCount, setRetryCount] = useState(0);
  const [lastError, setLastError] = useState(null);
  
  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    window.location.reload(); // Simple reload to retry loading maps
  };

  const render = (status, error) => {
    switch (status) {
      case Status.LOADING:
        return (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100%',
            flexDirection: 'column',
            color: '#6b7280'
          }}>
            <div style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>🗺️</div>
            <p>Loading Google Maps...</p>
          </div>
        );
      case Status.FAILURE:
        // Capture the error for the error boundary
        if (error) setLastError(error);
        return <MapErrorBoundary error={error || lastError} onRetry={handleRetry} />;
      default:
        return null;
    }
  };

  return (
    <Wrapper 
      apiKey={apiKey}
      render={render}
      libraries={['places', 'geometry', 'marker']}
      version="weekly"
    >
      <MapComponent {...props} />
    </Wrapper>
  );
};

export default GoogleMap;
