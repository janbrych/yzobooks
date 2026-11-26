import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LibraryMap } from '@/components/LibraryMap';
import { getLibraryMap, resizeFromHandle, snapSpot } from '@/lib/libraryMap';

const cases = [{ id: 'a', name: 'Regál A', shelves: [{ id: 'a1', name: 'Police 1' }] }];

// jsdom has no layout: map client coordinates 1:1 onto room centimetres.
// jsdom has no PointerEvent: give mouse events a pointer id.
class FakePointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('PointerEvent', FakePointerEvent);
  Object.defineProperty(SVGElement.prototype, 'getScreenCTM', {
    configurable: true,
    value: () => ({ inverse: () => ({}) }),
  });
  vi.stubGlobal(
    'DOMPoint',
    class {
      constructor(public x: number, public y: number) {}
      matrixTransform() {
        return { x: this.x, y: this.y };
      }
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

function openEditor(extra: Partial<React.ComponentProps<typeof LibraryMap>> = {}) {
  render(<LibraryMap bookcases={cases} counts={new Map()} selectedId={null} onSelect={() => {}} {...extra} />);
  fireEvent.click(screen.getByRole('button', { name: 'Upravit mapu' }));
  return within(screen.getByRole('dialog', { name: 'Editor mapy' }));
}

describe('map editor', () => {
  it('adds furniture, renames it, and undoes and redoes', () => {
    const ed = openEditor();
    fireEvent.click(ed.getByRole('button', { name: /Pult/ }));
    expect(getLibraryMap().items?.map((i) => i.type)).toEqual(['desk']);
    const name = ed.getByLabelText('Popisek');
    fireEvent.change(name, { target: { value: 'Výpůjčky' } });
    fireEvent.blur(name);
    expect(getLibraryMap().items?.[0].label).toBe('Výpůjčky');

    fireEvent.click(ed.getByRole('button', { name: 'Zpět' }));
    expect(getLibraryMap().items?.[0].label).toBeUndefined();
    fireEvent.click(ed.getByRole('button', { name: 'Zpět' }));
    expect(getLibraryMap().items ?? []).toHaveLength(0);
    fireEvent.click(ed.getByRole('button', { name: 'Znovu' }));
    expect(getLibraryMap().items).toHaveLength(1);
  });

  it('moves a bookcase smoothly and snaps it on release', () => {
    const ed = openEditor();
    const bookcase = ed.getByRole('button', { name: 'Regál A, 0 knih' });
    const svg = (bookcase as unknown as SVGElement).ownerSVGElement!;
    fireEvent.pointerDown(bookcase, { pointerId: 1, clientX: 100, clientY: 40 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 211, clientY: 140 });
    // Mid-drag it follows the finger exactly (not snapped).
    expect(bookcase.querySelector('rect:not([class*="pulse"])')?.getAttribute('x')).toBe('136');
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 211, clientY: 140 });
    expect(getLibraryMap().spots.a).toMatchObject({ x: 125, y: 125 });
  });

  it('resizes from a handle, adds bookcases and shelves from the map', () => {
    const onAddBookcase = vi.fn(() => 'new');
    const onAddShelf = vi.fn();
    const ed = openEditor({ onAddBookcase, onAddShelf });
    fireEvent.pointerDown(ed.getByRole('button', { name: 'Regál A, 0 knih' }), { pointerId: 1, clientX: 30, clientY: 30 });
    fireEvent.pointerUp(screen.getByTestId('map-svg'), { pointerId: 1 });
    const handle = document.querySelector('[data-handle="e"]')!;
    const svg = handle.closest('svg')!;
    fireEvent.pointerDown(handle, { pointerId: 2, clientX: 175, clientY: 50 });
    fireEvent.pointerMove(svg, { pointerId: 2, clientX: 290, clientY: 50 });
    fireEvent.pointerUp(svg, { pointerId: 2 });
    expect(getLibraryMap().spots.a.w).toBe(275);
    fireEvent.click(ed.getByRole('button', { name: /Police/ }));
    expect(onAddShelf).toHaveBeenCalledWith('a');
    fireEvent.click(ed.getByRole('button', { name: /^Regál$/ }));
    expect(onAddBookcase).toHaveBeenCalled();
  });

  it('zooms with the buttons and back to the whole room', () => {
    render(<LibraryMap bookcases={cases} counts={new Map()} selectedId={null} onSelect={() => {}} />);
    const svg = screen.getByTestId('map-svg');
    const width = () => Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    const whole = width();
    fireEvent.click(screen.getByRole('button', { name: 'Přiblížit' }));
    expect(width()).toBeLessThan(whole);
    fireEvent.click(screen.getByRole('button', { name: 'Oddálit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Oddálit' }));
    expect(width()).toBeGreaterThan(whole);
    fireEvent.click(screen.getByRole('button', { name: 'Celá místnost' }));
    expect(width()).toBe(whole);
  });

  it('resizes by any edge and snaps sizes to the grid', () => {
    const start = { x: 100, y: 100, w: 150, h: 50 };
    expect(resizeFromHandle(start, 'nw', -40, -30)).toEqual({ x: 60, y: 70, w: 190, h: 80 });
    expect(resizeFromHandle(start, 'w', 500, 0).w).toBe(25);
    expect(snapSpot({ x: 101, y: 99, w: 163, h: 37 }, { w: 800, h: 600 })).toEqual({ x: 100, y: 100, w: 175, h: 25 });
  });
});
