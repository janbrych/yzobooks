import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  EMPTY_MAP,
  clampSpot,
  doorOnWall,
  findRoute,
  getLibraryMap,
  overlaps,
  resizeRoom,
  resizeSpot,
  resolveSpots,
  rotateSpot,
  saveLibraryMap,
  type LibraryMapData,
} from '@/lib/libraryMap';
import { saveLocations, type Bookcase } from '@/lib/locations';
import { addOrUpdateLocalBook } from '@/lib/localStorage';
import { LocationsScreen } from '@/components/LocationsScreen';

const cases = (n: number): Bookcase[] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `Regál ${i}`, shelves: [] }));
const room = { w: 800, h: 600 };

describe('floor plan', () => {
  it('finds every bookcase a place inside the room without overlaps', () => {
    const spots = Object.values(resolveSpots(cases(12), EMPTY_MAP));
    expect(spots).toHaveLength(12);
    spots.forEach((a, i) => {
      expect(a.x >= 0 && a.y >= 0 && a.x + a.w <= room.w && a.y + a.h <= room.h).toBe(true);
      spots.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false));
    });
  });

  it('keeps saved places and fits them into a smaller room', () => {
    const map: LibraryMapData = { ...EMPTY_MAP, spots: { c0: { x: 600, y: 500, w: 150, h: 50 } } };
    expect(resolveSpots(cases(1), map).c0).toEqual({ x: 600, y: 500, w: 150, h: 50 });
    const small = resizeRoom(map, { w: 400, h: 300 });
    expect(small.spots.c0).toEqual({ x: 250, y: 250, w: 150, h: 50 });
    expect(small.door.y).toBe(300);
  });

  it('turns, resizes and clamps bookcases', () => {
    const turned = rotateSpot({ x: 100, y: 100, w: 150, h: 50 }, room);
    expect([turned.w, turned.h]).toEqual([50, 150]);
    expect(resizeSpot(turned, 25, room).h).toBe(175);
    expect(resizeSpot({ x: 0, y: 0, w: 50, h: 50 }, -25, room).w).toBe(50);
    expect(clampSpot({ x: -80, y: 9999, w: 150, h: 50 }, room)).toEqual({ x: 0, y: 550, w: 150, h: 50 });
  });

  it('puts the entrance on the nearest wall', () => {
    expect(doorOnWall({ x: 390, y: 520 }, room)).toEqual({ x: 400, y: 600 });
    expect(doorOnWall({ x: 30, y: 300 }, room)).toEqual({ x: 0, y: 300 });
  });

  it('routes around other bookcases and never through them', () => {
    const spots = {
      wall: { x: 100, y: 300, w: 600, h: 50 },
      target: { x: 350, y: 50, w: 150, h: 50 },
    };
    const route = findRoute({ room, door: { x: 400, y: 600 }, spots }, spots, 'target')!;
    expect(route[0]).toEqual({ x: 400, y: 600 });
    const end = route[route.length - 1];
    expect(end.x >= 350 && end.x <= 500 && end.y >= 50 && end.y <= 100).toBe(true);
    for (let i = 1; i < route.length; i++) {
      for (let t = 0; t <= 1; t += 0.01) {
        const x = route[i - 1].x + (route[i].x - route[i - 1].x) * t;
        const y = route[i - 1].y + (route[i].y - route[i - 1].y) * t;
        expect(x > 100 && x < 700 && y > 300 && y < 350).toBe(false);
      }
    }
  });

  it('says so when the bookcase cannot be reached', () => {
    const spots = { wall: { x: 0, y: 300, w: 800, h: 50 }, target: { x: 350, y: 50, w: 150, h: 50 } };
    expect(findRoute({ room, door: { x: 400, y: 600 }, spots }, spots, 'target')).toBeNull();
  });

  it('round-trips through storage and ignores corrupt data', () => {
    localStorage.clear();
    const map = { ...EMPTY_MAP, spots: { c0: { x: 25, y: 50, w: 150, h: 50 } } };
    saveLibraryMap(map);
    expect(getLibraryMap()).toEqual(map);
    localStorage.setItem('yzobooks_map', '{"room":{"w":"x"}}');
    expect(getLibraryMap()).toEqual(EMPTY_MAP);
  });
});

describe('finding a book on the map', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    saveLocations([
      { id: 'a', name: 'Regál A', shelves: [{ id: 'a1', name: 'Police 1' }, { id: 'a2', name: 'Police 2' }] },
      { id: 'b', name: 'Poezie', shelves: [{ id: 'b1', name: 'Horní' }] },
    ]);
    addOrUpdateLocalBook({ title: 'Válka s mloky', author: 'Karel Čapek', shelfId: 'a2' });
    addOrUpdateLocalBook({ title: 'Máj', author: 'Karel Hynek Mácha', shelfId: 'b1' });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('searches by book together with its place and lights it up', async () => {
    render(<LocationsScreen />);
    const search = await screen.findByLabelText('Najít umístění knihy');
    await screen.findByRole('button', { name: 'Regál A, 1 kniha' });
    fireEvent.change(search, { target: { value: 'capek police 2' } });
    const results = screen.getByTestId('finder-results');
    expect(within(results).queryByText('Máj')).toBeNull();
    fireEvent.click(within(results).getByText('Válka s mloky'));

    expect(screen.getByRole('button', { name: 'Regál A, 1 kniha' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('map-route')).toBeInTheDocument();
    expect(screen.getByTitle('Válka s mloky – Karel Čapek')).toHaveAttribute('aria-current', 'true');
    // Only the bookcase in question is shown below the map.
    expect(screen.queryByRole('group', { name: 'Poezie → Horní' })).toBeNull();
  });

  it('searches bookcases and shelves by name', async () => {
    render(<LocationsScreen />);
    await screen.findByRole('button', { name: 'Poezie, 1 kniha' });
    fireEvent.change(screen.getByLabelText('Najít umístění knihy'), { target: { value: 'poezie' } });
    fireEvent.click(within(screen.getByTestId('finder-results')).getAllByText('Poezie')[0]);
    expect(screen.getByRole('button', { name: 'Poezie, 1 kniha' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('group', { name: 'Poezie → Horní' })).toBeInTheDocument();
  });

  it('moves a bookcase with the keyboard in edit mode and remembers it', async () => {
    render(<LocationsScreen />);
    const target = await screen.findByRole('button', { name: 'Regál A, 1 kniha' });
    fireEvent.click(screen.getByRole('button', { name: 'Upravit mapu' }));
    const before = resolveSpots([{ id: 'a', name: '', shelves: [] }], EMPTY_MAP).a;
    fireEvent.keyDown(target, { key: 'ArrowDown' });
    await waitFor(() => expect(getLibraryMap().spots.a.y).toBe(before.y + 25));
    // The other one is stored too, so it stays where it was drawn.
    expect(getLibraryMap().spots.b).toBeDefined();
  });

  it('opens on a book linked from elsewhere in the app', async () => {
    const id = JSON.parse(localStorage.getItem('yzobooks_library_items')!).find((b: { title: string }) => b.title === 'Máj').id;
    window.history.replaceState(null, '', `/regaly?kniha=${id}`);
    render(<LocationsScreen />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Poezie, 1 kniha' })).toHaveAttribute('aria-pressed', 'true'));
    window.history.replaceState(null, '', '/');
  });
});
