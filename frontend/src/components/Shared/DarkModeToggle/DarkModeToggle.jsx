import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons';
import './DarkModeToggle.css';

const DarkModeToggle = ({ isDark, onToggle }) => {
  return (
    <div className="dark-mode-toggle-container">
      <input
        type="checkbox"
        className="dark-mode-checkbox"
        id="dark-mode-checkbox"
        checked={isDark}
        onChange={onToggle}
      />
      <label className="dark-mode-label" htmlFor="dark-mode-checkbox">
        <FontAwesomeIcon icon={faSun} className="sun-icon" />
        <FontAwesomeIcon icon={faMoon} className="moon-icon" />
        <div className="dark-mode-ball"></div>
      </label>
    </div>
  );
};

export default DarkModeToggle;
