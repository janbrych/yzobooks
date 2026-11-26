import { beforeEach, describe, expect, it } from 'vitest';
import { clearLocalLibrary, syncOnce, type RemoteItem, type RemoteStore } from '@/lib/sync';
import { addOrUpdateLocalBook, deleteLocalBook, getLocalBooks, saveLocalBooks, type LocalBook } from '@/lib/localStorage';
import { getLocations, saveLocations } from '@/lib/locations';
import { getLibraryMap, saveLibraryMap, EMPTY_MAP } from '@/lib/libraryMap';

// An in-memory account shared by "devices"; each device is a saved snapshot
// of localStorage that the test swaps in and out.
class FakeAccount implements RemoteStore {
  rows = new Map<string, RemoteItem & { user: string }>();
  clock = 0;
  constructor(public user = 'u1') {}
  async pull(since: string | null) {
    return [...this.rows.values()]
      .filter((r) => r.user === this.user && (!since || r.serverUpdatedAt > since))
      .sort((a, b) => a.serverUpdatedAt.localeCompare(b.serverUpdatedAt));
  }
  async push(items: Omit<RemoteItem, 'serverUpdatedAt'>[]) {
    for (const it of items) {
      this.clock += 1000;
      this.rows.set(`${this.user}/${it.kind}/${it.id}`, { ...it, user: this.user, serverUpdatedAt: new Date(Date.UTC(2026, 0, 1) + this.clock * 100).toISOString() });
    }
  }
}

const device = () => ({ ...localStorage });
function useDevice(snapshot: Record<string, string>) {
  localStorage.clear();
  Object.entries(snapshot).forEach(([k, v]) => localStorage.setItem(k, v));
}
const titles = () => getLocalBooks().map((b) => b.title).sort();
const tick = () => new Promise((r) => setTimeout(r, 5));

describe('syncOnce', () => {
  let account: FakeAccount;
  beforeEach(() => {
    localStorage.clear();
    account = new FakeAccount();
  });

  it('brings books, bookcases and the map to a second device', async () => {
    addOrUpdateLocalBook({ title: 'Krakatit' });
    saveLocations([{ id: 'a', name: 'Regál A', shelves: [] }]);
    saveLibraryMap({ ...EMPTY_MAP, room: { w: 1000, h: 500 } });
    await syncOnce(account, 'u1');

    localStorage.clear();
    const result = await syncOnce(account, 'u1');
    expect(result.pulled).toBe(3);
    expect(titles()).toEqual(['Krakatit']);
    expect(getLocations()[0].name).toBe('Regál A');
    expect(getLibraryMap().room.w).toBe(1000);
  });

  it('adds the library made before signing in to the account', async () => {
    addOrUpdateLocalBook({ title: 'Na tomto zařízení' });
    const res = await syncOnce(account, 'u1');
    expect(res.pushed).toBeGreaterThan(0);
    expect([...account.rows.values()].some((r) => (r.data as LocalBook)?.title === 'Na tomto zařízení')).toBe(true);
  });

  it('sends only what changed since the last round', async () => {
    addOrUpdateLocalBook({ title: 'A' });
    await syncOnce(account, 'u1');
    await tick();
    expect((await syncOnce(account, 'u1')).pushed).toBe(0);
    await tick();
    addOrUpdateLocalBook({ title: 'B' });
    expect((await syncOnce(account, 'u1')).pushed).toBe(1);
  });

  it('carries deletions to other devices', async () => {
    const book = addOrUpdateLocalBook({ title: 'Smazat' });
    await syncOnce(account, 'u1');
    const phone = device();

    await tick();
    deleteLocalBook(book.id);
    await syncOnce(account, 'u1');

    useDevice(phone);
    await syncOnce(account, 'u1');
    expect(titles()).toEqual([]);
  });

  it('keeps the later edit when two devices change the same book', async () => {
    const book = addOrUpdateLocalBook({ title: 'Původní' });
    await syncOnce(account, 'u1');
    const phone = device();

    await tick();
    addOrUpdateLocalBook({ id: book.id, title: 'Z počítače' });
    const laptop = device();
    useDevice(phone);
    await tick();
    addOrUpdateLocalBook({ id: book.id, title: 'Z telefonu (později)' });
    await syncOnce(account, 'u1');

    useDevice(laptop);
    await syncOnce(account, 'u1');
    expect(titles()).toEqual(['Z telefonu (později)']);
  });

  it('never shows one account’s library to another', async () => {
    addOrUpdateLocalBook({ title: 'Cizí kniha' });
    await syncOnce(account, 'u1');
    const other = new FakeAccount('u2');
    await syncOnce(other, 'u2');
    expect(titles()).toEqual([]);
    expect([...other.rows.values()]).toHaveLength(0);
  });

  it('clearLocalLibrary empties the device', async () => {
    saveLocalBooks([addOrUpdateLocalBook({ title: 'X' })]);
    saveLocations([{ id: 'a', name: 'A', shelves: [] }]);
    clearLocalLibrary();
    expect(getLocalBooks()).toEqual([]);
    expect(getLocations()).toEqual([]);
  });
});
