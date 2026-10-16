import { useEffect, useRef } from 'react';
import { canWalk } from './islandWalk.js';

const npcModules = import.meta.glob('../assets/npcs/*.png', { eager: true, import: 'default' });

// Ten of the twenty cut-out sprites. Spawns sit on floors the walk mask accepts.
const WANDERERS = [
  { name: 'aristotle', at: [28, 30] },
  { name: 'minotaur', at: [46, 36] },
  { name: 'centaur', at: [18, 50] },
  { name: 'spartan', at: [55, 48] },
  { name: 'oracle', at: [76, 56] },
  { name: 'nymph', at: [40, 58] },
  { name: 'medusa', at: [24, 78] },
  { name: 'pegasus-rider', at: [56, 80] },
  { name: 'pandora', at: [62, 42] },
  { name: 'chiron', at: [66, 36] },
];

function srcFor(name) {
  const entry = Object.entries(npcModules).find(([path]) => path.endsWith(`/${name}.png`));
  return entry ? entry[1] : '';
}

function segmentWalkable(x0, y0, x1, y1) {
  const steps = 8;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    if (!canWalk(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

function pickDestination(npc) {
  for (let i = 0; i < 18; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 4 + Math.random() * 9;
    const tx = npc.x + Math.cos(angle) * dist;
    const ty = npc.y + Math.sin(angle) * dist * 0.7;
    if (segmentWalkable(npc.x, npc.y, tx, ty)) {
      npc.tx = tx;
      npc.ty = ty;
      return;
    }
  }
  npc.tx = npc.x;
  npc.ty = npc.y;
  npc.pause = 0.45;
}

export default function IslandNpcs() {
  const refs = useRef([]);
  const stateRef = useRef(null);
  if (!stateRef.current) {
    stateRef.current = WANDERERS.map((npc) => ({
      name: npc.name,
      x: npc.at[0],
      y: npc.at[1],
      tx: npc.at[0],
      ty: npc.at[1],
      pause: 0.2 + Math.random() * 1.4,
      facing: Math.random() < 0.5 ? -1 : 1,
      phase: Math.random() * Math.PI * 2,
      speed: 1.8 + Math.random() * 1.3,
      moving: false,
    }));
  }

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduce = media.matches;
    const onChange = () => { reduce = media.matches; };
    media.addEventListener('change', onChange);
    let frame = 0;
    let last = 0;

    const tick = (now) => {
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      stateRef.current.forEach((npc, index) => {
        if (!reduce) {
          if (npc.pause > 0) {
            npc.pause -= dt;
            npc.moving = false;
          } else {
            const dx = npc.tx - npc.x;
            const dy = npc.ty - npc.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 0.35) {
              npc.moving = false;
              npc.pause = 0.55 + Math.random() * 1.7;
              pickDestination(npc);
            } else {
              const step = Math.min(dist, npc.speed * dt);
              const nx = npc.x + (dx / dist) * step;
              const ny = npc.y + (dy / dist) * step;
              if (canWalk(nx, ny)) {
                npc.facing = dx >= 0 ? 1 : -1;
                npc.x = nx;
                npc.y = ny;
                npc.moving = true;
              } else {
                npc.moving = false;
                npc.pause = 0.25 + Math.random() * 0.7;
                pickDestination(npc);
              }
            }
          }
        } else {
          npc.moving = false;
        }

        const el = refs.current[index];
        if (!el) return;
        el.style.left = `${npc.x}%`;
        el.style.top = `${npc.y}%`;
        el.style.zIndex = String(Math.round(npc.y * 10));
        const img = el.querySelector('img');
        if (img) {
          const bob = !reduce && npc.moving ? Math.sin(now / 150 + npc.phase) * 2.4 : 0;
          img.style.transform = `translateY(${bob}px) scaleX(${npc.facing})`;
        }
      });
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener('change', onChange);
    };
  }, []);

  return WANDERERS.map((npc, index) => (
    <div
      key={npc.name}
      ref={(el) => { refs.current[index] = el; }}
      className="island-npc"
      data-npc={npc.name}
      style={{ left: `${npc.at[0]}%`, top: `${npc.at[1]}%`, zIndex: Math.round(npc.at[1] * 10) }}
    >
      <img src={srcFor(npc.name)} alt="" draggable="false" />
    </div>
  ));
}
