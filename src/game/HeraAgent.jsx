import React from 'react';
import heraSprite from '../assets/hera-pixel.png';

export default function HeraAgent({ isMoving = false, isActive = true, className = '' }) {
  return (
    <div
      className={`hera-agent ${isMoving ? 'is-moving' : ''} ${isActive ? 'is-active' : ''} ${className}`.trim()}
      role="img"
      aria-label="Hera, royal content creator of Olympus"
    >
      <img className="hera-agent-art" src={heraSprite} alt="" draggable="false" />
    </div>
  );
}
