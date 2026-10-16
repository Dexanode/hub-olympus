import React from 'react';
import aresSprite from '../assets/ares-pixel.png';

export default function AresAgent({ isMoving = false, isActive = true, className = '' }) {
  return (
    <div
      className={`ares-agent ${isMoving ? 'is-moving' : ''} ${isActive ? 'is-active' : ''} ${className}`.trim()}
      role="img"
      aria-label="Ares, bug hunter of Olympus"
    >
      <img className="ares-agent-art" src={aresSprite} alt="" draggable="false" />
    </div>
  );
}
