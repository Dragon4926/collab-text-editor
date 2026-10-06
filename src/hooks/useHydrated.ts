import { useEffect, useState } from 'react';
import { useWorkspace } from '@/store/workspace';

/**
 * IndexedDB is asynchronous, so on startup there is a short moment where the
 * store still holds its default (empty) state. Rendering then would flash an
 * empty workspace and — worse — could let the seeding logic run against
 * not-yet-loaded data. This hook reports when rehydration has finished.
 */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(() => useWorkspace.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    return useWorkspace.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);
  return hydrated;
}
