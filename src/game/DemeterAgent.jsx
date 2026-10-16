import React from 'react';
import demeterSprite from '../assets/demeter-pixel.png';

export default function DemeterAgent({ isMoving = false, isActive = true, className = '' }) {
  return (
    <div
      className={`demeter-agent ${isMoving ? 'is-moving' : ''} ${isActive ? 'is-active' : ''} ${className}`.trim()}
      role="img"
      aria-label="Demeter, customer support guardian of Olympus"
    >
      <img className="demeter-agent-art" src={demeterSprite} alt="" draggable="false" />
    </div>
  );
}
