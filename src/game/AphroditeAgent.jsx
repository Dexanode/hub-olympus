import React from 'react';
import aphroditeSprite from '../assets/aphrodite-pixel.png';

export default function AphroditeAgent({ isMoving = false, isActive = true, className = '' }) {
  return (
    <div
      className={`aphrodite-agent ${isMoving ? 'is-moving' : ''} ${isActive ? 'is-active' : ''} ${className}`.trim()}
      role="img"
      aria-label="Aphrodite, Web3 Jobs curator of Olympus"
    >
      <img className="aphrodite-agent-art" src={aphroditeSprite} alt="" draggable="false" />
    </div>
  );
}
