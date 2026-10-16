import React from 'react';
import hephaestusSprite from '../assets/hephaestus-pixel.png';

export default function HephaestusAgent({ isMoving = false, isActive = true, className = '' }) {
  return (
    <div
      className={`hephaestus-agent ${isMoving ? 'is-moving' : ''} ${isActive ? 'is-active' : ''} ${className}`.trim()}
      role="img"
      aria-label="Hephaestus, DevOps smith of Olympus"
    >
      <img className="hephaestus-agent-art" src={hephaestusSprite} alt="" draggable="false" />
    </div>
  );
}
