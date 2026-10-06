import { useCallback, useRef, useState } from 'react';

/**
 * Snapshot-based undo / redo for a value.
 *
 * Because our state is immutable, a "snapshot" is just a reference to the
 * previous value — unchanged parts are shared between snapshots (structural
 * sharing), so keeping 100 steps of a whiteboard costs little memory.
 *
 *   past: [v0, v1]   present: v2   future: [v3]
 *
 *   commit(v)  → past.push(present), present = v, future = []
 *   undo()     → future.unshift(present), present = past.pop()
 *   redo()     → past.push(present), present = future.shift()
 *
 * The owner keeps the real value (e.g. in the store). `commit` records the
 * value *before* a change; undo/redo return the value to restore.
 */
export function useHistory<T>(limit = 100) {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  // a counter so components re-render when canUndo / canRedo change
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  const record = useCallback(
    (before: T) => {
      past.current.push(before);
      if (past.current.length > limit) past.current.shift();
      future.current = [];
      bump();
    },
    [limit],
  );

  const undo = useCallback((current: T): T | undefined => {
    const prev = past.current.pop();
    if (prev === undefined) return undefined;
    future.current.unshift(current);
    bump();
    return prev;
  }, []);

  const redo = useCallback((current: T): T | undefined => {
    const next = future.current.shift();
    if (next === undefined) return undefined;
    past.current.push(current);
    bump();
    return next;
  }, []);

  return {
    record,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
