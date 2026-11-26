'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, DoorOpen, Minus, Pencil, Plus, RotateCw } from 'lucide-react';
import { plural, type Bookcase } from '@/lib/locations';
import {
  EMPTY_MAP,
  GRID,
  clampSpot,
  doorOnWall,
  findRoute,
  getLibraryMap,
  overlaps,
  resizeRoom,
  resizeSpot,
  resolveSpots,
  rotateSpot,
  routeLength,
  saveLibraryMap,
  subscribeLibraryMap,
  type LibraryMapData,
  type Point,
  type Spot,
} from '@/lib/libraryMap';

interface LibraryMapProps {
  bookcases: Bookcase[];
  // Books standing in each bookcase, shown under its name.
  counts: Map<string, number>;
  selectedId: string | null;
  // What the user is looking for in the selected bookcase.
  shelfName?: string | null;
  bookTitle?: string | null;
  onSelect: (bookcaseId: string | null) => void;
}

type Drag = { kind: 'case'; id: string; spot: Spot; dx: number; dy: number } | { kind: 'door'; door: Point };

const MARGIN = 45;
const TOOL_BUTTON =
  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all';

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

// The name in one or two lines, whichever lets the letters be larger.
export function fitLabel(name: string, along: number): { lines: string[]; font: number } {
  const CHAR = 0.58; // average letter width relative to the font size
  const size = (lines: string[]) => {
    const longest = Math.max(4, ...lines.map((l) => l.length));
    return Math.min(lines.length > 1 ? 19 : 24, (along - 14) / longest / CHAR);
  };
  const words = name.split(' ');
  let best = [name];
  for (let i = 1; i < words.length; i++) {
    const split = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    if (size(split) > size(best)) best = split;
  }
  const font = Math.max(12, size(best));
  const max = Math.max(3, Math.floor((along - 10) / (font * CHAR)));
  return { font, lines: best.map((l) => (l.length > max ? `${l.slice(0, max - 1)}…` : l)) };
}

// Floor plan of the library. Tapping a bookcase selects it and draws the way
// to it from the entrance; in edit mode bookcases and the entrance are dragged.
export function LibraryMap({ bookcases, counts, selectedId, shelfName, bookTitle, onSelect }: LibraryMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [map, setMap] = useState<LibraryMapData>(EMPTY_MAP);
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);

  useEffect(() => {
    const load = () => setMap(getLibraryMap());
    load();
    return subscribeLibraryMap(load);
  }, []);

  const placed = useMemo(() => resolveSpots(bookcases, map), [bookcases, map]);
  const spots = drag?.kind === 'case' ? { ...placed, [drag.id]: clampSpot(drag.spot, map.room) } : placed;
  const door = drag?.kind === 'door' ? doorOnWall(drag.door, map.room) : map.door;
  const route = useMemo(
    () => (selectedId && !editing ? findRoute(map, placed, selectedId) : null),
    [map, placed, selectedId, editing]
  );

  // Every change stores all positions, so automatically placed bookcases
  // don't jump elsewhere when another one is moved.
  const save = (next: LibraryMapData) => {
    setMap(next);
    saveLibraryMap(next);
  };
  const saveSpot = (id: string, spot: Spot) => save({ ...map, spots: { ...placed, [id]: clampSpot(spot, map.room) } });

  const toRoom = (e: React.PointerEvent): Point | null => {
    const matrix = svgRef.current?.getScreenCTM?.();
    if (!matrix) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  };

  const startCaseDrag = (e: React.PointerEvent, id: string) => {
    if (!editing) return;
    const p = toRoom(e);
    if (!p) return;
    e.preventDefault();
    onSelect(id);
    svgRef.current?.setPointerCapture(e.pointerId);
    setDrag({ kind: 'case', id, spot: placed[id], dx: p.x - placed[id].x, dy: p.y - placed[id].y });
  };

  const startDoorDrag = (e: React.PointerEvent) => {
    if (!editing) return;
    const p = toRoom(e);
    if (!p) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    setDrag({ kind: 'door', door: p });
  };

  const moveDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toRoom(e);
    if (!p) return;
    if (drag.kind === 'door') setDrag({ kind: 'door', door: p });
    else setDrag({ ...drag, spot: { ...drag.spot, x: p.x - drag.dx, y: p.y - drag.dy } });
  };

  const endDrag = () => {
    if (!drag) return;
    if (drag.kind === 'door') save({ ...map, spots: placed, door: doorOnWall(drag.door, map.room) });
    else saveSpot(drag.id, drag.spot);
    setDrag(null);
  };

  const onCaseKey = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(id === selectedId && !editing ? null : id);
      return;
    }
    if (!editing) return;
    const step: Record<string, [number, number]> = { ArrowLeft: [-GRID, 0], ArrowRight: [GRID, 0], ArrowUp: [0, -GRID], ArrowDown: [0, GRID] };
    const move = step[e.key];
    if (!move) return;
    e.preventDefault();
    saveSpot(id, { ...placed[id], x: placed[id].x + move[0], y: placed[id].y + move[1] });
  };

  const selected = bookcases.find((c) => c.id === selectedId) || null;
  const { room } = map;

  return (
    <section aria-label="Mapa knihovny" className="rounded-3xl border border-slate-800 bg-slate-900/70 overflow-hidden shadow-xl shadow-black/20">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800/80">
        <div className="text-xs text-slate-400 min-w-0" aria-live="polite">
          {editing ? (
            'Přetáhni regály a vchod na jejich místo'
          ) : selected ? (
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
        <button
          onClick={() => setEditing((v) => !v)}
          aria-pressed={editing}
          className={`shrink-0 ${TOOL_BUTTON} ${editing ? '!bg-amber-500 !text-slate-950 hover:!bg-amber-400' : ''}`}
        >
          {editing ? <Check size={14} /> : <Pencil size={13} />}
          {editing ? 'Hotovo' : 'Upravit mapu'}
        </button>
      </div>

      {editing && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 border-b border-slate-800/80 bg-slate-950/40 animate-rise">
          <div className="flex items-center gap-3">
            <MeterField label="Šířka" value={room.w} onChange={(w) => save(resizeRoom({ ...map, spots: placed }, { w }))} />
            <MeterField label="Hloubka" value={room.h} onChange={(h) => save(resizeRoom({ ...map, spots: placed }, { h }))} />
          </div>
          {selected && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-amber-200 max-w-28 truncate">{selected.name}</span>
              <button className={TOOL_BUTTON} onClick={() => saveSpot(selected.id, rotateSpot(placed[selected.id], room))}>
                <RotateCw size={13} /> Otočit
              </button>
              <button className={TOOL_BUTTON} aria-label="Zkrátit regál" onClick={() => saveSpot(selected.id, resizeSpot(placed[selected.id], -GRID, room))}>
                <Minus size={13} />
              </button>
              <button className={TOOL_BUTTON} aria-label="Prodloužit regál" onClick={() => saveSpot(selected.id, resizeSpot(placed[selected.id], GRID, room))}>
                <Plus size={13} />
              </button>
            </div>
          )}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`${-MARGIN} ${-MARGIN} ${room.w + 2 * MARGIN} ${room.h + 2 * MARGIN}`}
        className="block w-full max-h-[58dvh] select-none"
        style={{ touchAction: editing ? 'none' : 'manipulation' }}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={() => setDrag(null)}
      >
        <defs>
          <pattern id="map-grid" width={100} height={100} patternUnits="userSpaceOnUse">
            <path d="M100 0H0V100" fill="none" className="stroke-slate-800" strokeWidth={1.5} />
          </pattern>
          <linearGradient id="map-wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b45309" />
            <stop offset="1" stopColor="#78350f" />
          </linearGradient>
        </defs>

        <rect x={0} y={0} width={room.w} height={room.h} rx={6} className="fill-slate-950" onClick={() => !editing && onSelect(null)} />
        <rect x={0} y={0} width={room.w} height={room.h} fill="url(#map-grid)" pointerEvents="none" />
        <rect x={0} y={0} width={room.w} height={room.h} rx={6} fill="none" className="stroke-slate-600" strokeWidth={10} pointerEvents="none" />

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
          const s = spots[c.id];
          if (!s) return null;
          const active = c.id === selectedId;
          const clash = editing && bookcases.some((o) => o.id !== c.id && spots[o.id] && overlaps(s, spots[o.id]));
          const vertical = s.h > s.w;
          const cx = s.x + s.w / 2;
          const cy = s.y + s.h / 2;
          const along = Math.max(s.w, s.h);
          const { lines, font } = fitLabel(c.name, along);
          const n = counts.get(c.id) || 0;
          return (
            <g
              key={c.id}
              role="button"
              tabIndex={0}
              aria-label={`${c.name}, ${plural(n, ['kniha', 'knihy', 'knih'])}`}
              aria-pressed={active}
              className={`outline-none group ${editing ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
              onClick={() => !editing && onSelect(active ? null : c.id)}
              onPointerDown={(e) => startCaseDrag(e, c.id)}
              onKeyDown={(e) => onCaseKey(e, c.id)}
            >
              {active && (
                <rect x={s.x - 14} y={s.y - 14} width={s.w + 28} height={s.h + 28} rx={18} fill="#f59e0b" className={editing ? 'opacity-25' : 'animate-map-pulse'} />
              )}
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
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={font}
                fontWeight={700}
                fill={active ? '#1c1917' : '#fffbeb'}
                transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
                pointerEvents="none"
              >
                {lines.map((line, i) => (
                  <tspan key={i} x={cx} y={cy + (i - (lines.length - 1) / 2) * font * 1.15}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}

        <g
          transform={`translate(${door.x} ${door.y})`}
          onPointerDown={startDoorDrag}
          className={editing ? 'cursor-grab' : ''}
          role="img"
          aria-label="Vchod"
        >
          <circle r={editing ? 34 : 26} fill="#059669" stroke="#a7f3d0" strokeWidth={4} />
          <DoorOpen x={-16} y={-16} width={32} height={32} color="#ecfdf5" />
        </g>
      </svg>
    </section>
  );
}
