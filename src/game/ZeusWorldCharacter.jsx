import { useEffect, useRef } from 'react';
import ZeusAgent from './ZeusAgent.jsx';

const ISLAND_WALK_AREA = [
  [160, 389], [310, 295], [495, 229], [680, 151], [874, 162], [1051, 230],
  [1257, 245], [1424, 364], [1472, 530], [1368, 620], [1283, 728], [1151, 776],
  [992, 757], [869, 826], [693, 810], [538, 834], [371, 771], [231, 648], [154, 522],
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
  const positionRef = useRef({ x: 50, y: 43 });

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
