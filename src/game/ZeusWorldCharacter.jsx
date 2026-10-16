import { useEffect, useRef } from 'react';
import ZeusAgent from './ZeusAgent.jsx';

// Rim of the reference island's floors and stairs, in the 1600×900 space
// used by percent checks (x * 16, y * 9). The title and open sky sit outside.
const ISLAND_WALK_AREA = [
  [288, 117], [288, 216], [128, 270], [72, 378], [72, 522], [112, 594],
  [96, 702], [144, 810], [256, 864], [640, 873], [992, 873], [1312, 846],
  [1440, 774], [1504, 630], [1512, 432], [1520, 270], [1488, 162], [1376, 108],
  [1088, 99], [768, 99], [480, 108],
];

function isInsideIsland(xPercent, yPercent) {
  const x = xPercent * 16;
  const y = yPercent * 9;
  let inside = false;
  for (let i = 0, j = ISLAND_WALK_AREA.length - 1; i < ISLAND_WALK_AREA.length; j = i++) {
    const [xi, yi] = ISLAND_WALK_AREA[i];
    const [xj, yj] = ISLAND_WALK_AREA[j];
    const crosses = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

const MOVEMENT_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

export default function ZeusWorldCharacter({ frameRef, enabled = true }) {
  const characterRef = useRef(null);
  const positionRef = useRef({ x: 50, y: 44 });

  useEffect(() => {
    const frame = frameRef.current;
    const character = characterRef.current;
    if (!frame || !character || !enabled) return undefined;

    const keys = new Set();
    let destination = null;
    let animationId = 0;
    let previousTime = 0;
    let moving = false;

    const drawPosition = () => {
      character.style.left = `${positionRef.current.x}%`;
      character.style.top = `${positionRef.current.y}%`;
      character.style.zIndex = String(4 + Math.round(positionRef.current.y * 10));
    };
    const setMoving = (next) => {
      if (moving === next) return;
      moving = next;
      character.classList.toggle('is-moving', moving);
    };
    const setDirection = (dx, dy, bounds) => {
      const horizontal = Math.abs(dx * bounds.width);
      const vertical = Math.abs(dy * bounds.height);
      if (horizontal > vertical) character.dataset.direction = dx > 0 ? 'east' : 'west';
      else character.dataset.direction = dy > 0 ? 'south' : 'north';
    };
    const onKeyDown = (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))) return;
      const key = event.key.toLowerCase();
      if (!MOVEMENT_KEYS.has(key)) return;
      event.preventDefault();
      keys.add(key);
      destination = null;
      scheduleAnimation();
    };
    const onKeyUp = (event) => keys.delete(event.key.toLowerCase());
    const onBlur = () => keys.clear();
    const onPointerDown = (event) => {
      if (event.target instanceof Element && event.target.closest('button, a, input')) return;
      const bounds = frame.getBoundingClientRect();
      const x = Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100));
      const y = Math.min(100, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * 100));
      if (isInsideIsland(x, y)) {
        destination = { x, y };
        scheduleAnimation();
      }
    };

    const animate = (time) => {
      animationId = 0;
      const dt = Math.min((time - (previousTime || time)) / 1000, 0.04);
      previousTime = time;
      const bounds = frame.getBoundingClientRect();
      const distance = 220 * dt;
      let dx = 0;
      let dy = 0;
      let didMove = false;
      if (keys.size) {
        if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
        if (keys.has('d') || keys.has('arrowright')) dx += 1;
        if (keys.has('w') || keys.has('arrowup')) dy -= 1;
        if (keys.has('s') || keys.has('arrowdown')) dy += 1;
        const magnitude = Math.hypot(dx, dy) || 1;
        dx = (dx / magnitude) * (distance / bounds.width) * 100;
        dy = (dy / magnitude) * (distance / bounds.height) * 100;
      } else if (destination) {
        const px = ((destination.x - positionRef.current.x) / 100) * bounds.width;
        const py = ((destination.y - positionRef.current.y) / 100) * bounds.height;
        const remaining = Math.hypot(px, py);
        if (remaining <= distance + 1) {
          didMove = remaining > 0.1;
          positionRef.current = destination;
          destination = null;
        } else {
          dx = (px / remaining) * (distance / bounds.width) * 100;
          dy = (py / remaining) * (distance / bounds.height) * 100;
        }
      }

      if (dx || dy) {
        setDirection(dx, dy, bounds);
        const nextX = Math.min(99, Math.max(1, positionRef.current.x + dx));
        const nextY = Math.min(99, Math.max(1, positionRef.current.y + dy));
        if (isInsideIsland(nextX, nextY)) {
          positionRef.current = { x: nextX, y: nextY };
          didMove = true;
        }
        else if (destination && !keys.size) destination = null;
      }
      drawPosition();
      const hasInput = Boolean(keys.size || destination);
      setMoving(didMove && hasInput);
      if (hasInput) scheduleAnimation();
    };

    function scheduleAnimation() {
      if (!animationId) animationId = window.requestAnimationFrame(animate);
    }

    drawPosition();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    frame.addEventListener('pointerdown', onPointerDown);
    scheduleAnimation();
    return () => {
      window.cancelAnimationFrame(animationId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      frame.removeEventListener('pointerdown', onPointerDown);
    };
  }, [enabled, frameRef]);

  return (
    <div ref={characterRef} className="map-zeus-character" data-direction="south" aria-label="Zeus, playable character">
      <ZeusAgent className="zeus-world-sprite" isActive />
    </div>
  );
}
