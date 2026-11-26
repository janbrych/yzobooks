'use client';

import { useEffect, useState } from 'react';
import { getCloudState, startCloud, subscribeCloud, type CloudState } from '@/lib/cloud';

/** The account and sync state, starting the cloud connection on first use. */
export function useCloud(): CloudState {
  const [s, setS] = useState<CloudState>(getCloudState);
  useEffect(() => {
    startCloud();
    setS(getCloudState());
    return subscribeCloud(setS);
  }, []);
  return s;
}
