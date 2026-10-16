// Walkable surface of the unlabeled island, in the 1600×900 space used by
// percent checks (x * 16, y * 9). The rim follows floors and stairs. Sky is outside.
export const ISLAND_WALK_AREA = [
  [288, 117], [288, 216], [128, 270], [72, 378], [72, 522], [112, 594],
  [96, 702], [144, 810], [256, 864], [640, 873], [992, 873], [1312, 846],
  [1440, 774], [1504, 630], [1512, 432], [1520, 270], [1488, 162], [1376, 108],
  [1088, 99], [768, 99], [480, 108],
];

const MASK_W = 160;
const MASK_H = 90;
// Packed bits, row-major, MSB first. 1 = floor or stair inside the island.
// Water, lava, the underworld river, and open sky are 0. Specks smaller than
// a decoration were filled so a walker is not stuck on a single crystal.
const MASK_B64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//AADs3/AAAAAAAAAAB///+AAA///AAe4f/wAAAAAAAAB////+AAP//vAAIA//AAAAAAAAAH////+AD0/+vAAAD/8CAAAAAAAAf////+A/D/w/AAAf/w/4AAAAAAB/////+P4P/B/B4Z//HH4AAAAAAH//////+A/4B+Pn//8Y/4AAAAAAf//////gD/wD4e///xH/gAAAAAB//////+AP+APH////8f+AAAAAAH//////4A/4A8f////x/8AAAAAAf//////gD/wDx/////H/wAAAAAB//////+AP/AP3////4f/AAAAAA///////4C//A/f////N/+AAAAAf///////gH/9z/////4H/4AAAAB///////+Af//P/////4f/gAAAAP///////4B//9/////////AAAAD////////gP///////////8AAAA/////////D////////////wAAAP////////8///8/////////AAAD/////////////D////////8AAB/////////////AP////////wAAP////////////4A//////8H/AAA/////////////wD//////6P8AAH/////////////AP//////8PwAAf////////////8D///////4fAAD/////////////wf///////x8AAP////////////+Hv///////DwAB//////////////8///////8MAAH//////////////D///////wgAAf/////////////wf///////CAAB///j/////////+H///////8EAAH//4D/////////x////////4AAAf//gH//////////////////wAAB///B///////////////////gAAH/n/f//////////////////+AAAf4P////////////////////8AAB/4P////////////////////4AAH/4P////////////////////gAAP/0P///////////////////+AAA//x////////////////////4AAB///////////////////////gAAH//////////////////////8AAAP//////////////////////wAAAP//////////////////////gAAA//////////////////////+AAAB//////////////////////4AAAg//////////////////////gAAAv//////////////////////AAAD//////////////////////+AAAf//////////////////////4AAB///////////////////////gAAH//////////////////////8AAAf//////////////////////wAAB///////////////////////AAAP//////////////////////8AAA///////////////////////gAAD//////////////////////+AAAP//////////////////////wAAA///////////////////////AAAD//////////////////////8AAAP/////////////H////////gAAA/////////////4f///////+AAAB////////////9h////////wAAAH////////////AP////////AAAAP///////////4P////////4AAAA////////////p/////////gAAAD///////////gP////////8AAAAH//////////4A/////////wAAAAf/////////+AP////////8AAAAA//////////yL/////////AAAAAD/////////9B////7////wAAAAAH/////////QP////v///+AAAAAAD////////wD////8f///gAAAAAAD///////8B/////zv//4AAAAAAAD///////8P////+A//+AAAAAAAAD///////5/////zr+AAAAAAAAAAAP///////////+IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

let maskBytes;

function maskBit(xPercent, yPercent) {
  if (!maskBytes) {
    const raw = atob(MASK_B64);
    maskBytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) maskBytes[i] = raw.charCodeAt(i);
  }
  const gx = Math.min(MASK_W - 1, Math.max(0, Math.floor((xPercent / 100) * MASK_W)));
  const gy = Math.min(MASK_H - 1, Math.max(0, Math.floor((yPercent / 100) * MASK_H)));
  const index = gy * MASK_W + gx;
  return ((maskBytes[index >> 3] >> (7 - (index & 7))) & 1) === 1;
}

export function isInsideIsland(xPercent, yPercent) {
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

// Polygon keeps feet on the island. The mask also refuses pools, lava, and the green river.
export function canWalk(xPercent, yPercent) {
  return isInsideIsland(xPercent, yPercent) && maskBit(xPercent, yPercent);
}
