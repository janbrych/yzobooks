// The floor plan of the library: a room, its entrance and where each bookcase
// stands. Sizes are centimetres. Kept apart from the bookcases themselves
// (src/lib/locations.ts), so a library without a map works as before.

import type { Bookcase } from '@/lib/locations';

export interface Point {
  x: number;
  y: number;
}

// Top-left corner and size as drawn (already turned).
export interface Spot extends Point {
  w: number;
  h: number;
}

export interface LibraryMapData {
  room: { w: number; h: number };
  door: Point;
  spots: Record<string, Spot>;
}

export const GRID = 25;
export const ROOM_MIN = 200;
export const ROOM_MAX = 3000;
export const CASE_DEPTH = 50;
const CASE_LENGTH = 150;
const CASE_MIN = 50;
const CASE_MAX = 800;
// Room to walk between automatically placed bookcases.
const AISLE = 100;

const STORAGE_KEY = 'yzobooks_map';
const CHANGE_EVENT = 'yzobooks-map-change';

export const EMPTY_MAP: LibraryMapData = { room: { w: 800, h: 600 }, door: { x: 400, y: 600 }, spots: {} };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const snap = (n: number) => Math.round(n / GRID) * GRID;

// ---- pure helpers ----------------------------------------------------------

export function clampSpot(spot: Spot, room: LibraryMapData['room']): Spot {
  const w = Math.min(spot.w, room.w);
  const h = Math.min(spot.h, room.h);
  return { w, h, x: clamp(snap(spot.x), 0, room.w - w), y: clamp(snap(spot.y), 0, room.h - h) };
}

export function overlaps(a: Spot, b: Spot, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

// The entrance always sits on the nearest wall.
export function doorOnWall(p: Point, room: LibraryMapData['room']): Point {
  const x = clamp(snap(p.x), 0, room.w);
  const y = clamp(snap(p.y), 0, room.h);
  const walls: [number, Point][] = [
    [x, { x: 0, y }],
    [room.w - x, { x: room.w, y }],
    [y, { x, y: 0 }],
    [room.h - y, { x, y: room.h }],
  ];
  return walls.sort((a, b) => a[0] - b[0])[0][1];
}

function freeSpot(taken: Spot[], room: LibraryMapData['room']): Spot {
  const size = { w: Math.min(CASE_LENGTH, room.w), h: CASE_DEPTH };
  for (const gap of [AISLE, GRID, 0]) {
    for (let y = GRID; y + size.h <= room.h; y += GRID) {
      for (let x = GRID; x + size.w <= room.w; x += GRID) {
        const spot = { x, y, ...size };
        if (!taken.some((t) => overlaps(spot, t, gap))) return spot;
      }
    }
  }
  return clampSpot({ x: 0, y: 0, ...size }, room);
}

/** Where every bookcase stands; ones nobody placed yet get a free spot. */
export function resolveSpots(bookcases: Bookcase[], map: LibraryMapData): Record<string, Spot> {
  const out: Record<string, Spot> = {};
  const taken: Spot[] = [];
  for (const c of bookcases) {
    const saved = map.spots[c.id];
    if (!saved) continue;
    out[c.id] = clampSpot(saved, map.room);
    taken.push(out[c.id]);
  }
  for (const c of bookcases) {
    if (out[c.id]) continue;
    out[c.id] = freeSpot(taken, map.room);
    taken.push(out[c.id]);
  }
  return out;
}

export function rotateSpot(spot: Spot, room: LibraryMapData['room']): Spot {
  const cx = spot.x + spot.w / 2;
  const cy = spot.y + spot.h / 2;
  return clampSpot({ x: cx - spot.h / 2, y: cy - spot.w / 2, w: spot.h, h: spot.w }, room);
}

/** Longer or shorter along its long side. */
export function resizeSpot(spot: Spot, delta: number, room: LibraryMapData['room']): Spot {
  const key = spot.w >= spot.h ? 'w' : 'h';
  return clampSpot({ ...spot, [key]: clamp(spot[key] + delta, CASE_MIN, CASE_MAX) }, room);
}

export function resizeRoom(map: LibraryMapData, size: Partial<LibraryMapData['room']>): LibraryMapData {
  const fit = (n: number) => clamp(snap(n), ROOM_MIN, ROOM_MAX);
  const room = { w: fit(size.w ?? map.room.w), h: fit(size.h ?? map.room.h) };
  // Keep the entrance on its wall when that wall moves.
  const door = doorOnWall(
    { x: map.door.x === map.room.w ? room.w : map.door.x, y: map.door.y === map.room.h ? room.h : map.door.y },
    room
  );
  const spots = Object.fromEntries(Object.entries(map.spots).map(([id, s]) => [id, clampSpot(s, room)]));
  return { room, door, spots };
}

/**
 * Walking route from the entrance to a bookcase around the other ones, as
 * corner points ending at the bookcase's edge. Null when it is walled in.
 */
export function findRoute(map: LibraryMapData, spots: Record<string, Spot>, targetId: string): Point[] | null {
  const target = spots[targetId];
  if (!target) return null;
  const cols = Math.max(1, Math.round(map.room.w / GRID));
  const rows = Math.max(1, Math.round(map.room.h / GRID));
  const center = (c: number, r: number): Point => ({ x: (c + 0.5) * GRID, y: (r + 0.5) * GRID });
  const inside = (p: Point, s: Spot) => p.x > s.x && p.x < s.x + s.w && p.y > s.y && p.y < s.y + s.h;

  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Object.values(spots).some((s) => inside(center(c, r), s))) blocked[r * cols + c] = 1;
    }
  }
  const startC = clamp(Math.floor(map.door.x / GRID), 0, cols - 1);
  const startR = clamp(Math.floor(map.door.y / GRID), 0, rows - 1);
  const start = startR * cols + startC;
  if (blocked[start]) return null;

  // Breadth-first from the entrance; the direction is tried last-used first
  // when walking back, which keeps the route to few corners.
  const dist = new Int32Array(cols * rows).fill(-1);
  dist[start] = 0;
  const queue = [start];
  const steps = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  const touches = (c: number, r: number) =>
    steps.some(([dx, dy]) => c + dx >= 0 && c + dx < cols && r + dy >= 0 && r + dy < rows && inside(center(c + dx, r + dy), target));
  let end = -1;
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i] % cols;
    const r = Math.floor(queue[i] / cols);
    if (touches(c, r)) {
      end = queue[i];
      break;
    }
    for (const [dx, dy] of steps) {
      const nc = c + dx;
      const nr = r + dy;
      const n = nr * cols + nc;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || blocked[n] || dist[n] >= 0) continue;
      dist[n] = dist[queue[i]] + 1;
      queue.push(n);
    }
  }
  if (end < 0) return null;

  const cells = [end];
  let last = -1;
  while (cells[0] !== start) {
    const c = cells[0] % cols;
    const r = Math.floor(cells[0] / cols);
    const order = last < 0 ? [0, 1, 2, 3] : [last, ...[0, 1, 2, 3].filter((d) => d !== last)];
    for (const d of order) {
      const nc = c + steps[d][0];
      const nr = r + steps[d][1];
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      if (dist[nr * cols + nc] === dist[cells[0]] - 1) {
        cells.unshift(nr * cols + nc);
        last = d;
        break;
      }
    }
  }

  const path = cells.map((n) => center(n % cols, Math.floor(n / cols)));
  const tip = path[path.length - 1];
  const edge = { x: clamp(tip.x, target.x, target.x + target.w), y: clamp(tip.y, target.y, target.y + target.h) };
  const all = [map.door, ...path, edge];
  // Only the corners.
  return all.filter((p, i) => {
    if (i === 0 || i === all.length - 1) return true;
    const a = all[i - 1];
    const b = all[i + 1];
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
}

export function routeLength(route: Point[]): number {
  return route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - route[i].x, p.y - route[i].y), 0);
}

// ---- storage ---------------------------------------------------------------

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isMap(value: unknown): value is LibraryMapData {
  const m = value as LibraryMapData;
  return Boolean(
    m &&
      m.room &&
      isNum(m.room.w) &&
      isNum(m.room.h) &&
      m.door &&
      isNum(m.door.x) &&
      isNum(m.door.y) &&
      m.spots &&
      typeof m.spots === 'object' &&
      Object.values(m.spots).every((s) => s && isNum(s.x) && isNum(s.y) && isNum(s.w) && isNum(s.h))
  );
}

export function getLibraryMap(): LibraryMapData {
  if (typeof window === 'undefined') return EMPTY_MAP;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return isMap(parsed) ? parsed : EMPTY_MAP;
  } catch {
    return EMPTY_MAP;
  }
}

export function saveLibraryMap(map: LibraryMapData): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch (err) {
    console.error('Failed to save map:', err);
  }
}

export function subscribeLibraryMap(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
