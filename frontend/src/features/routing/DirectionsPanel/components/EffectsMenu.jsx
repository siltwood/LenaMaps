import React from 'react';

/**
 * EffectsMenu - Toggle animation effects on/off
 * Similar styling to MileageDisplay
 */
const EffectsMenu = ({ enabledEffects, onEffectsChange }) => {
  const effects = [
    {
      id: 'particleTrail',
      name: 'Particle Trail',
      icon: '✨',
      description: 'Colorful particles follow the marker',
      disabled: true // Coming soon
    },
    {
      id: 'confetti',
      name: 'Confetti Burst',
      icon: '🎉',
      description: 'Celebration at destination',
      disabled: true // Coming soon
    },
    {
      id: 'modeTransitions',
      name: 'Mode Transitions',
      icon: '💫',
      description: 'Effects when switching transport',
      disabled: true // Coming soon
    },
    {
      id: 'routeDrawIn',
      name: 'Route Draw-in',
      icon: '✏️',
      description: 'Animate route appearing',
      disabled: true // Coming soon
    }
  ];

  const handleToggle = (effectId) => {
    onEffectsChange({
      ...enabledEffects,
      [effectId]: !enabledEffects[effectId]
    });
  };

  return (
    <div className="effects-menu">
      <div className="effects-header">
        <span className="effects-title">Animation Effects</span>
      </div>

      <div className="effects-list">
        {effects.map(effect => (
          <div
            key={effect.id}
            className={`effect-item ${effect.disabled ? 'disabled' : ''}`}
          >
            <div className="effect-info">
              <span className="effect-icon">{effect.icon}</span>
              <div className="effect-details">
                <span className="effect-name">{effect.name}</span>
                {effect.disabled && (
                  <span className="effect-coming-soon">Coming soon</span>
                )}
              </div>
            </div>

            <label className="effect-toggle">
              <input
                type="checkbox"
                checked={enabledEffects[effect.id] || false}
                onChange={() => handleToggle(effect.id)}
                disabled={effect.disabled}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EffectsMenu;
