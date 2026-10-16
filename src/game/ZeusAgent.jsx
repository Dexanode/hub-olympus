import React from 'react';
import zeusSprite from '../assets/zeus-pixel.png';
import zeusWalkSprite from '../assets/zeus-walk.png';

export default function ZeusAgent({ isMoving = false, isActive = true, className = '' }) {
  return (
    <div
      className={`zeus-agent ${isMoving ? 'is-moving' : ''} ${isActive ? 'is-active' : ''} ${className}`.trim()}
      role="img"
      aria-label="Zeus, founder of Olympus"
    >
      <>
        <img className="zeus-agent-art zeus-agent-art-idle" src={zeusSprite} alt="" draggable="false" />
        <span
          className="zeus-agent-art zeus-agent-art-walk"
          style={{ '--zeus-walk-sheet': `url(${zeusWalkSprite})` }}
          aria-hidden="true"
        />
      </>
    </div>
  );
}
