import React from 'react';
import './DragHandle.css';

const DragHandle = ({ title = "Drag to move" }) => {
  return (
    <div className="drag-handle" title={title}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
        <circle cx="6" cy="6" r="1.5"/>
        <circle cx="6" cy="10" r="1.5"/>
        <circle cx="6" cy="14" r="1.5"/>
        <circle cx="10" cy="6" r="1.5"/>
        <circle cx="10" cy="10" r="1.5"/>
        <circle cx="10" cy="14" r="1.5"/>
        <circle cx="14" cy="6" r="1.5"/>
        <circle cx="14" cy="10" r="1.5"/>
        <circle cx="14" cy="14" r="1.5"/>
      </svg>
    </div>
  );
};

export default DragHandle;
