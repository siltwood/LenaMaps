import React from 'react';
import { TRANSPORT_ICONS } from '../../constants/transportationModes';
import './MapDistanceDisplay.css';

/**
 * MapDistanceDisplay - Shows distance info in top-right corner of map
 */
const MapDistanceDisplay = ({ displayInfo }) => {
  console.log('MapDistanceDisplay received displayInfo:', displayInfo);

  if (!displayInfo || !displayInfo.data || displayInfo.mode === 'none') {
    console.log('MapDistanceDisplay returning null because:', {
      hasDisplayInfo: !!displayInfo,
      hasData: !!displayInfo?.data,
      mode: displayInfo?.mode
    });
    return null;
  }

  const { data } = displayInfo;

  return (
    <div className="map-distance-display">
      {data.map((item, index) => (
        <div key={index} className="distance-item">
          {item.mode && (
            <span className="distance-icon">{TRANSPORT_ICONS[item.mode]}</span>
          )}
          <span className="distance-label">{item.label}</span>
          <span className="distance-value">
            {item.distance} {item.unit}
          </span>
        </div>
      ))}
    </div>
  );
};

export default MapDistanceDisplay;
