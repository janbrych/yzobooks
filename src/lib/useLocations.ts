'use client';

import { useCallback, useEffect, useState } from 'react';
import { getLocations, saveLocations, subscribeLocations, type Bookcase } from '@/lib/locations';

/** Bookcases + shelves from storage, kept in sync across components and tabs. */
export function useLocations(): [Bookcase[], (next: Bookcase[]) => void, boolean] {
  const [locations, setLocations] = useState<Bookcase[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = () => setLocations(getLocations());
    load();
    setLoaded(true);
    return subscribeLocations(load);
  }, []);

  const update = useCallback((next: Bookcase[]) => {
    setLocations(next);
    saveLocations(next);
  }, []);

  return [locations, update, loaded];
}
