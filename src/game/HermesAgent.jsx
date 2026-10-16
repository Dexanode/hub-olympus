import React from 'react';
import hermesSprite from '../assets/hermes-pixel.png';

export default function HermesAgent({ isMoving = false, isActive = true, className = '' }) {
  return (
    <div
      className={`hermes-agent ${isMoving ? 'is-moving' : ''} ${isActive ? 'is-active' : ''} ${className}`.trim()}
      role="img"
      aria-label="Hermes, messenger and marketer of Olympus"
    >
      <img className="hermes-agent-art" src={hermesSprite} alt="" draggable="false" />
    </div>
  );
}
