import React from 'react';
import apolloSprite from '../assets/apollo-pixel.png';

export default function ApolloAgent({ isMoving = false, isActive = true, className = '' }) {
  return (
    <div
      className={`apollo-agent ${isMoving ? 'is-moving' : ''} ${isActive ? 'is-active' : ''} ${className}`.trim()}
      role="img"
      aria-label="Apollo, oracle auditor of Olympus"
    >
      <img className="apollo-agent-art" src={apolloSprite} alt="" draggable="false" />
    </div>
  );
}
