import React from 'react';
import hadesSprite from '../assets/hades-pixel.png';

export default function HadesAgent({ isMoving = false, isActive = true, className = '' }) {
  return (
    <div
      className={`hades-agent ${isMoving ? 'is-moving' : ''} ${isActive ? 'is-active' : ''} ${className}`.trim()}
      role="img"
      aria-label="Hades, onchain analyst of Olympus"
    >
      <img className="hades-agent-art" src={hadesSprite} alt="" draggable="false" />
    </div>
  );
}
