import React from 'react';
import athenaSprite from '../assets/athena-pixel.png';

export default function AthenaAgent({ isMoving = false, isActive = true, className = '' }) {
  return (
    <div
      className={`athena-agent ${isMoving ? 'is-moving' : ''} ${isActive ? 'is-active' : ''} ${className}`.trim()}
      role="img"
      aria-label="Athena, liquidity strategist of Olympus"
    >
      <img className="athena-agent-art" src={athenaSprite} alt="" draggable="false" />
    </div>
  );
}
