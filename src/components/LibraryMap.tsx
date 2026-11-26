'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Copy,
  DoorOpen,
  Grid3x3,
  Maximize2,
  Pencil,
  Plus,
  Redo2,
  RotateCw,
  ScanBarcode,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { plural, type Bookcase } from '@/lib/locations';
import {
  EMPTY_MAP,
  GRID,
  ITEM_TYPES,
  clampSpot,
  doorOnWall,
  findRoute,
  freeSpotNear,
  getLibraryMap,
  newItem,
  overlaps,
  resizeFromHandle,
  resizeRoom,
  resolveSpots,
  rotateSpot,
  routeLength,
  saveLibraryMap,
  snapSpot,
  subscribeLibraryMap,
  type LibraryMapData,
  type MapItem,
  type MapItemType,
  type Point,
  type Spot,
} from '@/lib/libraryMap';

interface LibraryMapProps {
  bookcases: Bookcase[];
  // Books standing in each bookcase and on each shelf.
  counts: Map<string, number>;
  shelfCounts?: Map<string, number>;
  selectedId: string | null;
  // What the user is looking for in the selected bookcase.
  shelfName?: string | null;
  bookTitle?: string | null;
  onSelect: (bookcaseId: string | null) => void;
  // Editing the bookcases themselves from the map.
  onAddBookcase?: () => string | null;
  onRenameBookcase?: (id: string, name: string) => void;
  onDeleteBookcase?: (id: string) => void;
  onAddShelf?: (id: string) => void;
  onScanShelf?: (shelfId: string) => void;
}

type Selection = { kind: 'case' | 'item'; id: string } | { kind: 'door' } | null;
type View = { x: number; y: number; w: number };
type Gesture =
  | { mode: 'move'; target: { kind: 'case' | 'item'; id: string }; start: Spot; from: Point; spot: Spot; moved: boolean }
  | { mode: 'resize'; target: { kind: 'case' | 'item'; id: string }; handle: string; start: Spot; from: Point; spot: Spot }
  | { mode: 'door'; door: Point }
  | { mode: 'pan'; from: { x: number; y: number }; view: View; moved: boolean };

const MARGIN = 60;
const HISTORY = 60;
const MIN_VIEW = 150; // most zoomed in: 1.5 m across
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const ADDABLE: MapItemType[] = ['table', 'desk', 'seat', 'sofa', 'plant', 'column', 'wall', 'window', 'rug', 'stairs', 'label'];
const TOOL =
  'flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-40 disabled:active:scale-100 transition-all';
const ITEM_LOOK: Record<MapItemType, { fill: string; stroke: string; text: string }> = {
  table: { fill: '#64748b', stroke: '#334155', text: '#f8fafc' },
  desk: { fill: '#4f46e5', stroke: '#312e81', text: '#eef2ff' },
  seat: { fill: '#0d9488', stroke: '#134e4a', text: '#f0fdfa' },
  sofa: { fill: '#0f766e', stroke: '#134e4a', text: '#f0fdfa' },
  plant: { fill: '#16a34a', stroke: '#14532d', text: '#f0fdf4' },
  column: { fill: '#94a3b8', stroke: '#475569', text: '#0f172a' },
  wall: { fill: '#475569', stroke: '#1e293b', text: '#f8fafc' },
  window: { fill: '#7dd3fc', stroke: '#0369a1', text: '#0c4a6e' },
  rug: { fill: '#be185d', stroke: '#831843', text: '#fdf2f8' },
  stairs: { fill: '#a8a29e', stroke: '#44403c', text: '#1c1917' },
  label: { fill: 'transparent', stroke: 'transparent', text: '#fbbf24' },
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

// The name in one or two lines, whichever lets the letters be larger.
export function fitLabel(name: string, along: number, maxFont = 24): { lines: string[]; font: number } {
  const CHAR = 0.58; // average letter width relative to the font size
  const size = (lines: string[]) => {
    const longest = Math.max(4, ...lines.map((l) => l.length));
    return Math.min(lines.length > 1 ? maxFont * 0.8 : maxFont, (along - 14) / longest / CHAR);
  };
  const words = name.split(' ');
  let best = [name];
  for (let i = 1; i < words.length; i++) {
    const split = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    if (size(split) > size(best)) best = split;
  }
  const font = Math.max(11, size(best));
  const max = Math.max(3, Math.floor((along - 10) / (font * CHAR)));
  return { font, lines: best.map((l) => (l.length > max ? `${l.slice(0, max - 1)}…` : l)) };
}

function Label({ spot, text, fill, maxFont }: { spot: Spot; text: string; fill: string; maxFont?: number }) {
  const vertical = spot.h > spot.w * 1.2;
  const cx = spot.x + spot.w / 2;
  const cy = spot.y + spot.h / 2;
  const { lines, font } = fitLabel(text, Math.max(spot.w, spot.h), Math.min(maxFont ?? 24, Math.min(spot.w, spot.h) * 0.55));
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={font}
      fontWeight={700}
      fill={fill}
      transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
      pointerEvents="none"
    >
      {lines.map((line, i) => (
        <tspan key={i} x={cx} y={cy + (i - (lines.length - 1) / 2) * font * 1.15}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function MeterField({ label, value, onChange }: { label: string; value: number; onChange: (cm: number) => void }) {
  const [draft, setDraft] = useState(String(value / 100));
  useEffect(() => setDraft(String(value / 100)), [value]);
  const commit = () => {
    const meters = Number(draft.replace(',', '.'));
    if (Number.isFinite(meters) && meters > 0) onChange(meters * 100);
    setDraft(String(value / 100));
  };
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-400">
      {label}
      <input
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="w-14 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm text-slate-100 text-center focus:outline-none focus:border-amber-500"
      />
      m
    </label>
  );
}

function NameField({ value, onSave, label }: { value: string; onSave: (v: string) => void; label: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() && draft !== value && onSave(draft.trim())}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="min-w-0 flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-50 focus:outline-none focus:border-amber-500"
    />
  );
}

// Floor plan of the library. Tapping a bookcase selects it and draws the way
// to it from the entrance. Pinch, wheel or the buttons zoom; dragging the
// floor pans. "Upravit mapu" opens the editor full screen: drag, resize with
// the handles, add furniture, undo.
export function LibraryMap(props: LibraryMapProps) {
  const { bookcases, counts, shelfCounts, selectedId, shelfName, bookTitle, onSelect } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<LibraryMapData>(EMPTY_MAP);
  const [editing, setEditing] = useState(false);
  const [snapOn, setSnapOn] = useState(true);
  const [selection, setSelection] = useState<Selection>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [aspect, setAspect] = useState(0.75);
  const [history, setHistory] = useState<{ past: LibraryMapData[]; future: LibraryMapData[] }>({ past: [], future: [] });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mid: Point; view: View } | null>(null);

  useEffect(() => {
    const load = () => setMap(getLibraryMap());
    load();
    return subscribeLibraryMap(load);
  }, []);

  // Viewport shape follows the box on screen.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setAspect(height / width);
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [editing]);

  const fitView = useCallback((): View => {
    const w = Math.max(map.room.w + 2 * MARGIN, (map.room.h + 2 * MARGIN) / aspect);
    const h = w * aspect;
    return { x: map.room.w / 2 - w / 2, y: map.room.h / 2 - h / 2, w };
  }, [map.room.w, map.room.h, aspect]);
  const v = view ?? fitView();
  const vh = v.w * aspect;

  const placed = useMemo(() => resolveSpots(bookcases, map), [bookcases, map]);
  const items = map.items || [];
  const snapIf = (s: Spot) => (snapOn ? clampSpot(s, map.room) : s);

  // While dragging, the moving thing follows the finger exactly.
  const live = gesture && (gesture.mode === 'move' || gesture.mode === 'resize') ? gesture : null;
  const spotOf = (kind: 'case' | 'item', id: string): Spot | undefined => {
    if (live && live.target.kind === kind && live.target.id === id) return live.spot;
    return kind === 'case' ? placed[id] : items.find((i) => i.id === id);
  };
  const door = gesture?.mode === 'door' ? doorOnWall(gesture.door, map.room) : map.door;
  const activeCase = editing ? (selection?.kind === 'case' ? selection.id : null) : selectedId;
  const route = useMemo(() => (selectedId && !editing ? findRoute(map, placed, selectedId) : null), [map, placed, selectedId, editing]);

  // ---- storing, with undo
  const commit = (next: LibraryMapData) => {
    setHistory((h) => ({ past: [...h.past.slice(-HISTORY + 1), { ...map, spots: placed }], future: [] }));
    setMap(next);
    saveLibraryMap(next);
  };
  // Every change stores all positions, so automatically placed bookcases
  // don't jump elsewhere when another one is moved.
  const withSpot = (id: string, spot: Spot): LibraryMapData => ({ ...map, spots: { ...placed, [id]: spot } });
  const withItem = (id: string, patch: Partial<MapItem>): LibraryMapData => ({
    ...map,
    spots: placed,
    items: items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
  });
  const undo = () => {
    const prev = history.past[history.past.length - 1];
    if (!prev) return;
    setHistory((h) => ({ past: h.past.slice(0, -1), future: [map, ...h.future] }));
    setMap(prev);
    saveLibraryMap(prev);
  };
  const redo = () => {
    const next = history.future[0];
    if (!next) return;
    setHistory((h) => ({ past: [...h.past, map], future: h.future.slice(1) }));
    setMap(next);
    saveLibraryMap(next);
  };

  // ---- coordinates and zoom
  const toRoom = (clientX: number, clientY: number): Point | null => {
    const matrix = svgRef.current?.getScreenCTM?.();
    if (!matrix) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  };
  const maxViewW = Math.max(map.room.w, map.room.h / aspect) * 3;
  const zoomAt = useCallback(
    (factor: number, at: Point, base: View = v) => {
      const w = clamp(base.w * factor, MIN_VIEW, maxViewW);
      const k = w / base.w;
      setView({ x: at.x - (at.x - base.x) * k, y: at.y - (at.y - base.y) * k, w });
    },
    [v, maxViewW]
  );
  const zoomCenter = (factor: number) => zoomAt(factor, { x: v.x + v.w / 2, y: v.y + vh / 2 });

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  useEffect(() => {
    wheelRef.current = (e: WheelEvent) => {
      if (!editing && !e.ctrlKey && !e.metaKey) return; // plain scroll moves the page
      e.preventDefault();
      const at = toRoom(e.clientX, e.clientY);
      if (at) zoomAt(Math.exp(e.deltaY * 0.0015), at);
    };
  });
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => wheelRef.current(e);
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [editing]);

  // ---- pointer gestures
  const capture = (e: React.PointerEvent) => {
    try {
      svgRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      // jsdom / old browsers
    }
  };

  const startPinchIfTwo = () => {
    if (pointers.current.size !== 2) return false;
    const [a, b] = [...pointers.current.values()];
    const mid = toRoom((a.x + b.x) / 2, (a.y + b.y) / 2);
    if (!mid) return false;
    pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid, view: v };
    setGesture(null);
    return true;
  };

  const onPointerDown = (e: React.PointerEvent, target?: { kind: 'case' | 'item'; id: string } | 'door', handle?: string) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    capture(e);
    if (startPinchIfTwo()) return;
    const p = toRoom(e.clientX, e.clientY);
    if (!p) return;
    if (editing && target === 'door') {
      e.stopPropagation();
      setSelection({ kind: 'door' });
      setGesture({ mode: 'door', door: p });
      return;
    }
    if (editing && target && target !== 'door') {
      e.stopPropagation();
      const start = spotOf(target.kind, target.id);
      if (!start) return;
      setSelection(target);
      if (target.kind === 'case') onSelect(target.id);
      setGesture(handle ? { mode: 'resize', target, handle, start, from: p, spot: start } : { mode: 'move', target, start, from: p, spot: start, moved: false });
      return;
    }
    setGesture({ mode: 'pan', from: { x: e.clientX, y: e.clientY }, view: v, moved: false });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0) zoomAt(pinch.current.dist / dist, pinch.current.mid, pinch.current.view);
      return;
    }
    if (!gesture) return;
    if (gesture.mode === 'pan') {
      const rect = svgRef.current?.getBoundingClientRect();
      const scale = rect?.width ? v.w / rect.width : 1;
      const dx = e.clientX - gesture.from.x;
      const dy = e.clientY - gesture.from.y;
      if (!gesture.moved && Math.hypot(dx, dy) < 5) return;
      setView({ ...gesture.view, x: gesture.view.x - dx * scale, y: gesture.view.y - dy * scale });
      setGesture({ ...gesture, moved: true });
      return;
    }
    const p = toRoom(e.clientX, e.clientY);
    if (!p) return;
    if (gesture.mode === 'door') setGesture({ mode: 'door', door: p });
    else if (gesture.mode === 'move') {
      const spot = { ...gesture.start, x: gesture.start.x + p.x - gesture.from.x, y: gesture.start.y + p.y - gesture.from.y };
      setGesture({ ...gesture, spot, moved: gesture.moved || Math.hypot(p.x - gesture.from.x, p.y - gesture.from.y) > 3 });
    } else setGesture({ ...gesture, spot: resizeFromHandle(gesture.start, gesture.handle, p.x - gesture.from.x, p.y - gesture.from.y) });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    const g = gesture;
    setGesture(null);
    if (!g) return;
    if (g.mode === 'pan') {
      if (!g.moved && !editing) onSelect(null);
      if (!g.moved && editing) setSelection(null);
      return;
    }
    if (g.mode === 'door') return commit({ ...map, spots: placed, door: doorOnWall(g.door, map.room) });
    if (g.mode === 'move' && !g.moved) return;
    const spot = g.mode === 'resize' ? (snapOn ? snapSpot(g.spot, map.room) : clampSpot(g.spot, map.room)) : snapIf(g.spot);
    const final = snapOn ? spot : clampFree(spot, map.room);
    commit(g.target.kind === 'case' ? withSpot(g.target.id, final) : withItem(g.target.id, final));
  };

  // ---- editing actions
  const selCase = selection?.kind === 'case' ? bookcases.find((c) => c.id === selection.id) : undefined;
  const selItem = selection?.kind === 'item' ? items.find((i) => i.id === selection.id) : undefined;
  const viewCenter = { x: v.x + v.w / 2, y: v.y + vh / 2 };

  const addItem = (type: MapItemType) => {
    const taken = [...Object.values(placed), ...items.filter((i) => ITEM_TYPES[i.type].blocks || i.type === 'window')];
    const item = newItem(type, viewCenter, map.room, taken);
    commit({ ...map, spots: placed, items: [...items, item] });
    setSelection({ kind: 'item', id: item.id });
  };
  const addBookcase = () => {
    const id = props.onAddBookcase?.();
    if (!id) return;
    const spot = freeSpotNear(150, 50, viewCenter, [...Object.values(placed), ...items.filter((i) => ITEM_TYPES[i.type].blocks)], map.room);
    commit({ ...map, spots: { ...placed, [id]: spot } });
    setSelection({ kind: 'case', id });
    onSelect(id);
  };
  const rotateSel = () => {
    if (selCase) commit(withSpot(selCase.id, rotateSpot(placed[selCase.id], map.room)));
    if (selItem) commit(withItem(selItem.id, rotateSpot(selItem, map.room)));
  };
  const duplicateSel = () => {
    if (!selItem) return;
    const copy = { ...selItem, id: `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, ...clampSpot({ ...selItem, x: selItem.x + GRID * 2, y: selItem.y + GRID * 2 }, map.room) };
    commit({ ...map, spots: placed, items: [...items, copy] });
    setSelection({ kind: 'item', id: copy.id });
  };
  const deleteSel = () => {
    if (selItem) {
      commit({ ...map, spots: placed, items: items.filter((i) => i.id !== selItem.id) });
      setSelection(null);
    }
  };
  const nudge = (dx: number, dy: number) => {
    if (selCase) commit(withSpot(selCase.id, clampSpot({ ...placed[selCase.id], x: placed[selCase.id].x + dx, y: placed[selCase.id].y + dy }, map.room)));
    if (selItem) commit(withItem(selItem.id, clampSpot({ ...selItem, x: selItem.x + dx, y: selItem.y + dy }, map.room)));
  };

  // Keyboard in the editor: arrows move, R turns, Delete removes, Ctrl+Z.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      if (!editing || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const step: Record<string, [number, number]> = { ArrowLeft: [-GRID, 0], ArrowRight: [GRID, 0], ArrowUp: [0, -GRID], ArrowDown: [0, GRID] };
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (step[e.key] && (selCase || selItem)) {
        e.preventDefault();
        nudge(...step[e.key]);
      } else if (e.key.toLowerCase() === 'r' && (selCase || selItem)) rotateSel();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selItem) deleteSel();
      else if (e.key === 'Escape') setSelection(null);
    };
  });
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  const openEditor = () => {
    setEditing(true);
    setView(null);
    setSelection(selectedId ? { kind: 'case', id: selectedId } : null);
  };
  const closeEditor = () => {
    setEditing(false);
    setView(null);
    setGesture(null);
  };

  // ---- drawing
  const selectedSpot = selection && selection.kind !== 'door' ? spotOf(selection.kind, selection.id) : undefined;
  const handleSize = clamp(v.w / 40, 12, 40);
  const preview = live && snapOn ? (live.mode === 'resize' ? snapSpot(live.spot, map.room) : clampSpot(live.spot, map.room)) : null;
  const caseActive = (id: string) => id === activeCase;

  const svg = (
    <svg
      ref={svgRef}
      data-testid="map-svg"
      viewBox={`${v.x} ${v.y} ${v.w} ${vh}`}
      className="block w-full h-full select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => onPointerDown(e)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        pinch.current = null;
        setGesture(null);
      }}
    >
      <defs>
        <pattern id="map-grid" width={GRID * 4} height={GRID * 4} patternUnits="userSpaceOnUse">
          <path d={`M${GRID * 4} 0H0V${GRID * 4}`} fill="none" className="stroke-slate-800" strokeWidth={1.5} />
          {editing && <path d={`M${GRID} 0V${GRID * 4}M${GRID * 2} 0V${GRID * 4}M${GRID * 3} 0V${GRID * 4}M0 ${GRID}H${GRID * 4}M0 ${GRID * 2}H${GRID * 4}M0 ${GRID * 3}H${GRID * 4}`} className="stroke-slate-900" strokeWidth={1} />}
        </pattern>
        <linearGradient id="map-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b45309" />
          <stop offset="1" stopColor="#78350f" />
        </linearGradient>
      </defs>

      <rect x={0} y={0} width={map.room.w} height={map.room.h} rx={6} className="fill-slate-950" />
      <rect x={0} y={0} width={map.room.w} height={map.room.h} fill="url(#map-grid)" pointerEvents="none" />

      {/* rugs and labels lie under everything else */}
      {[...items].sort((a, b) => Number(b.type === 'rug') - Number(a.type === 'rug')).map((item) => {
        const s = spotOf('item', item.id) || item;
        const look = ITEM_LOOK[item.type];
        const sel = selection?.kind === 'item' && selection.id === item.id;
        return (
          <g
            key={item.id}
            role={editing ? 'button' : undefined}
            aria-label={editing ? `${ITEM_TYPES[item.type].name}${item.label ? `: ${item.label}` : ''}` : undefined}
            onPointerDown={(e) => editing && onPointerDown(e, { kind: 'item', id: item.id })}
            className={editing ? 'cursor-grab' : ''}
            opacity={item.type === 'rug' ? 0.55 : 1}
          >
            {item.type === 'label' ? (
              <>
                {editing && <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={6} fill="transparent" stroke={sel ? '#fbbf24' : '#475569'} strokeDasharray="8 8" strokeWidth={2} />}
                <Label spot={s} text={item.label || 'Popisek'} fill={look.text} maxFont={36} />
              </>
            ) : item.type === 'plant' || item.type === 'column' || item.type === 'seat' ? (
              <>
                <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={Math.min(s.w, s.h) / 2} fill={look.fill} stroke={look.stroke} strokeWidth={4} />
                {item.label && <Label spot={s} text={item.label} fill={look.text} maxFont={16} />}
              </>
            ) : item.type === 'stairs' ? (
              <>
                <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={4} fill={look.fill} stroke={look.stroke} strokeWidth={4} />
                {Array.from({ length: Math.max(1, Math.floor(Math.max(s.w, s.h) / 25) - 1) }, (_, i) => {
                  const t = (i + 1) * 25;
                  return s.h >= s.w ? (
                    <line key={i} x1={s.x} x2={s.x + s.w} y1={s.y + t} y2={s.y + t} stroke={look.stroke} strokeWidth={2} />
                  ) : (
                    <line key={i} y1={s.y} y2={s.y + s.h} x1={s.x + t} x2={s.x + t} stroke={look.stroke} strokeWidth={2} />
                  );
                })}
              </>
            ) : (
              <>
                <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={item.type === 'wall' || item.type === 'window' ? 2 : 8} fill={look.fill} stroke={look.stroke} strokeWidth={4} />
                {item.type !== 'wall' && item.type !== 'window' && <Label spot={s} text={item.label || ITEM_TYPES[item.type].name} fill={look.text} maxFont={18} />}
              </>
            )}
          </g>
        );
      })}

      <rect x={0} y={0} width={map.room.w} height={map.room.h} rx={6} fill="none" className="stroke-slate-600" strokeWidth={10} pointerEvents="none" />

      {route && (
        <polyline
          data-testid="map-route"
          points={route.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#34d399"
          strokeWidth={9}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4 20"
          className="animate-route"
          pointerEvents="none"
        />
      )}

      {bookcases.map((c) => {
        const s = spotOf('case', c.id);
        if (!s) return null;
        const active = caseActive(c.id);
        const clash = editing && bookcases.some((o) => o.id !== c.id && placed[o.id] && overlaps(s, spotOf('case', o.id) || placed[o.id]));
        const n = counts.get(c.id) || 0;
        return (
          <g
            key={c.id}
            role="button"
            tabIndex={0}
            aria-label={`${c.name}, ${plural(n, ['kniha', 'knihy', 'knih'])}`}
            aria-pressed={active}
            className={`outline-none group ${editing ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
            onPointerDown={(e) => editing && onPointerDown(e, { kind: 'case', id: c.id })}
            onClick={() => !editing && onSelect(active ? null : c.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (editing) setSelection({ kind: 'case', id: c.id });
                else onSelect(active ? null : c.id);
              }
              if (editing && e.key.startsWith('Arrow')) {
                e.stopPropagation();
                e.preventDefault();
                const d: Record<string, [number, number]> = { ArrowLeft: [-GRID, 0], ArrowRight: [GRID, 0], ArrowUp: [0, -GRID], ArrowDown: [0, GRID] };
                const [dx, dy] = d[e.key] || [0, 0];
                setSelection({ kind: 'case', id: c.id });
                commit(withSpot(c.id, clampSpot({ ...placed[c.id], x: placed[c.id].x + dx, y: placed[c.id].y + dy }, map.room)));
              }
            }}
          >
            {active && !editing && <rect x={s.x - 14} y={s.y - 14} width={s.w + 28} height={s.h + 28} rx={18} fill="#f59e0b" className="animate-map-pulse" />}
            <rect
              x={s.x}
              y={s.y}
              width={s.w}
              height={s.h}
              rx={6}
              fill={active ? '#f59e0b' : 'url(#map-wood)'}
              stroke={clash ? '#ef4444' : active ? '#fde68a' : '#451a03'}
              strokeWidth={clash ? 8 : 4}
              className="group-focus-visible:stroke-indigo-400"
            />
            <Label spot={s} text={c.name} fill={active ? '#1c1917' : '#fffbeb'} />
          </g>
        );
      })}

      {/* snap preview while moving freely */}
      {editing && preview && (
        <rect
          x={preview.x}
          y={preview.y}
          width={preview.w}
          height={preview.h}
          rx={6}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={3}
          strokeDasharray="10 8"
          pointerEvents="none"
        />
      )}

      {/* resize handles */}
      {editing && selectedSpot && selection && selection.kind !== 'door' && !(live?.mode === 'move') &&
        HANDLES.map((h) => {
          const s = selectedSpot;
          const x = h.includes('w') ? s.x : h.includes('e') ? s.x + s.w : s.x + s.w / 2;
          const y = h.includes('n') ? s.y : h.includes('s') ? s.y + s.h : s.y + s.h / 2;
          return (
            <rect
              key={h}
              data-handle={h}
              x={x - handleSize / 2}
              y={y - handleSize / 2}
              width={handleSize}
              height={handleSize}
              rx={handleSize / 4}
              fill="#fef3c7"
              stroke="#b45309"
              strokeWidth={3}
              style={{ cursor: `${h}-resize` }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onPointerDown(e, selection, h);
              }}
            />
          );
        })}

      <g transform={`translate(${door.x} ${door.y})`} onPointerDown={(e) => editing && onPointerDown(e, 'door')} className={editing ? 'cursor-grab' : ''} role="img" aria-label="Vchod">
        <circle r={editing ? 34 : 26} fill="#059669" stroke={selection?.kind === 'door' ? '#fbbf24' : '#a7f3d0'} strokeWidth={4} />
        <DoorOpen x={-16} y={-16} width={32} height={32} color="#ecfdf5" />
      </g>
    </svg>
  );

  const zoomButtons = (
    <div className="absolute right-2 bottom-2 flex flex-col gap-1.5">
      <button aria-label="Přiblížit" onClick={() => zoomCenter(1 / 1.4)} className="p-2 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-200 hover:bg-slate-800 shadow-lg">
        <ZoomIn size={16} />
      </button>
      <button aria-label="Oddálit" onClick={() => zoomCenter(1.4)} className="p-2 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-200 hover:bg-slate-800 shadow-lg">
        <ZoomOut size={16} />
      </button>
      <button aria-label="Celá místnost" onClick={() => setView(null)} className="p-2 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-200 hover:bg-slate-800 shadow-lg">
        <Maximize2 size={16} />
      </button>
    </div>
  );

  const selected = bookcases.find((c) => c.id === selectedId) || null;

  if (!editing) {
    return (
      <section aria-label="Mapa knihovny" className="rounded-3xl border border-slate-800 bg-slate-900/70 overflow-hidden shadow-xl shadow-black/20">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800/80">
          <div className="text-xs text-slate-400 min-w-0" aria-live="polite">
            {selected ? (
              <>
                {bookTitle && <p className="text-slate-200 truncate">{bookTitle}</p>}
                <p className="text-sm font-semibold text-amber-200 leading-tight">
                  {selected.name}
                  {shelfName ? ` → ${shelfName}` : ''}
                </p>
                <p>{route ? `${Math.max(1, Math.round(routeLength(route) / 100))} m od vchodu` : 'Cesta od vchodu je zastavěná'}</p>
              </>
            ) : (
              'Klepni na regál, nebo vyhledej knihu'
            )}
          </div>
          <button onClick={openEditor} className={`shrink-0 ${TOOL}`}>
            <Pencil size={13} /> Upravit mapu
          </button>
        </div>
        <div ref={boxRef} className="relative h-[52dvh] min-h-64 max-h-[560px]">
          {svg}
          {zoomButtons}
        </div>
      </section>
    );
  }

  const editor = (
    <div role="dialog" aria-modal="true" aria-label="Editor mapy" className="fixed inset-0 z-50 flex flex-col bg-slate-950 animate-backdrop-in">
      {/* top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900">
        <button aria-label="Zpět" onClick={undo} disabled={!history.past.length} className={TOOL}>
          <Undo2 size={15} />
        </button>
        <button aria-label="Znovu" onClick={redo} disabled={!history.future.length} className={TOOL}>
          <Redo2 size={15} />
        </button>
        <button aria-pressed={snapOn} onClick={() => setSnapOn((s) => !s)} className={`${TOOL} ${snapOn ? '!bg-indigo-600 !text-white' : ''}`} title="Přichytávat k mřížce 25 cm">
          <Grid3x3 size={15} /> <span className="hidden sm:inline">Mřížka</span>
        </button>
        <div className="hidden md:flex items-center gap-3 ml-2">
          <MeterField label="Šířka" value={map.room.w} onChange={(w) => commit(resizeRoom({ ...map, spots: placed }, { w }))} />
          <MeterField label="Hloubka" value={map.room.h} onChange={(h) => commit(resizeRoom({ ...map, spots: placed }, { h }))} />
        </div>
        <div className="flex-1" />
        <button onClick={closeEditor} className={`${TOOL} !bg-amber-500 !text-slate-950 hover:!bg-amber-400 !px-4`}>
          <Check size={15} /> Hotovo
        </button>
      </div>

      {/* add palette */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800 bg-slate-900/60 overflow-x-auto scrollbar-none">
        <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-500 mr-1">Přidat</span>
        {props.onAddBookcase && (
          <button onClick={addBookcase} className={`${TOOL} shrink-0 !bg-amber-600 !text-white hover:!bg-amber-500`}>
            <Plus size={13} /> Regál
          </button>
        )}
        {ADDABLE.map((type) => (
          <button key={type} onClick={() => addItem(type)} className={`${TOOL} shrink-0`}>
            <span aria-hidden className="w-2.5 h-2.5 rounded-sm" style={{ background: ITEM_LOOK[type].fill === 'transparent' ? '#fbbf24' : ITEM_LOOK[type].fill }} />
            {ITEM_TYPES[type].name}
          </button>
        ))}
      </div>

      <div ref={boxRef} className="relative flex-1 min-h-0">
        {svg}
        {zoomButtons}
        <p className="absolute left-3 top-2 text-[11px] text-slate-500 pointer-events-none">
          {Math.round((map.room.w / v.w) * 100)} % · tahem posuneš, dvěma prsty přiblížíš
        </p>
      </div>

      {/* inspector */}
      <div className="border-t border-slate-800 bg-slate-900 px-3 py-2.5 flex flex-col gap-2 max-h-[40dvh] overflow-y-auto">
        {selCase ? (
          <>
            <div className="flex items-center gap-2">
              <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-amber-400 to-orange-600 shrink-0" aria-hidden />
              <NameField label="Název regálu" value={selCase.name} onSave={(n) => props.onRenameBookcase?.(selCase.id, n)} />
              <button onClick={rotateSel} className={TOOL} aria-label="Otočit">
                <RotateCw size={14} />
              </button>
              {props.onDeleteBookcase && (
                <button
                  onClick={() => {
                    if (window.confirm(`Smazat regál „${selCase.name}“? Knihy z něj zůstanou v knihovně bez umístění.`)) {
                      props.onDeleteBookcase?.(selCase.id);
                      setSelection(null);
                    }
                  }}
                  className={`${TOOL} hover:!bg-red-600`}
                  aria-label="Smazat regál"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {selCase.shelves.map((s) => (
                <span key={s.id} className="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300">
                  {s.name}
                  <span className="tabular-nums text-[10px] px-1.5 rounded-full bg-slate-800 text-slate-400">{shelfCounts?.get(s.id) || 0}</span>
                  {props.onScanShelf && (
                    <button aria-label={`Skenovat na ${s.name}`} onClick={() => props.onScanShelf?.(s.id)} className="p-1 rounded-md text-indigo-300 hover:bg-indigo-600 hover:text-white">
                      <ScanBarcode size={12} />
                    </button>
                  )}
                </span>
              ))}
              {props.onAddShelf && (
                <button onClick={() => props.onAddShelf?.(selCase.id)} className={TOOL}>
                  <Plus size={13} /> Police
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {(placed[selCase.id].w / 100).toLocaleString('cs')} × {(placed[selCase.id].h / 100).toLocaleString('cs')} m · táhni úchyty pro změnu velikosti
            </p>
          </>
        ) : selItem ? (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-semibold text-slate-400">{ITEM_TYPES[selItem.type].name}</span>
            <NameField
              label="Popisek"
              value={selItem.label || ''}
              onSave={(label) => commit(withItem(selItem.id, { label }))}
            />
            <button onClick={rotateSel} className={TOOL} aria-label="Otočit">
              <RotateCw size={14} />
            </button>
            <button onClick={duplicateSel} className={TOOL} aria-label="Zkopírovat">
              <Copy size={14} />
            </button>
            <button onClick={deleteSel} className={`${TOOL} hover:!bg-red-600`} aria-label="Odstranit">
              <Trash2 size={14} />
            </button>
          </div>
        ) : selection?.kind === 'door' ? (
          <p className="text-xs text-slate-400">Vchod: táhni ho podél stěn, odsud vede cesta ke knihám.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-slate-400">Klepni na regál nebo věc. Prázdné místo táhni pro posun, kolečkem nebo dvěma prsty přibliž.</p>
            <div className="flex md:hidden items-center gap-3">
              <MeterField label="Šířka" value={map.room.w} onChange={(w) => commit(resizeRoom({ ...map, spots: placed }, { w }))} />
              <MeterField label="Hloubka" value={map.room.h} onChange={(h) => commit(resizeRoom({ ...map, spots: placed }, { h }))} />
            </div>
          </div>
        )}
        {(selCase || selItem) && (
          <div className="flex items-center gap-1.5 md:hidden">
            {(
              [
                ['←', -GRID, 0],
                ['↑', 0, -GRID],
                ['↓', 0, GRID],
                ['→', GRID, 0],
              ] as const
            ).map(([label, dx, dy]) => (
              <button key={label} onClick={() => nudge(dx, dy)} className={`${TOOL} w-10`} aria-label={`Posunout ${label}`}>
                {label}
              </button>
            ))}
            <span className="text-[11px] text-slate-500 ml-1">posun o 25 cm</span>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document === 'undefined' ? editor : createPortal(editor, document.body);
}

// Without the grid things may stand anywhere, but still inside the room.
function clampFree(spot: Spot, room: LibraryMapData['room']): Spot {
  const w = Math.min(spot.w, room.w);
  const h = Math.min(spot.h, room.h);
  return { w, h, x: clamp(spot.x, 0, room.w - w), y: clamp(spot.y, 0, room.h - h) };
}

