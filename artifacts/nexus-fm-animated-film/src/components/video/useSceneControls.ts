import { useCallback, useMemo, useState } from 'react';

const REPEAT_SUFFIX_RE = /_r[12]$/;

export function stripRepeatSuffix(key: string) {
  return key.replace(REPEAT_SUFFIX_RE, '');
}

function rotateFromIndex(durations: Record<string, number>, startIndex: number) {
  const keys = Object.keys(durations);
  if (startIndex <= 0) return durations;
  return keys.reduce<Record<string, number>>((result, _, index) => {
    const key = keys[(startIndex + index) % keys.length];
    result[key] = durations[key];
    return result;
  }, {});
}

export function useSceneControls(baseDurations: Record<string, number>) {
  const sceneKeys = useMemo(() => Object.keys(baseDurations), [baseDurations]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [locked, setLocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const [tick, setTick] = useState(0);

  const durations = useMemo(() => {
    if (locked) {
      const key = sceneKeys[activeIndex];
      return { [`${key}_r1`]: baseDurations[key], [`${key}_r2`]: baseDurations[key] };
    }
    return rotateFromIndex(baseDurations, activeIndex);
  }, [activeIndex, baseDurations, locked, sceneKeys]);

  const totalDuration = useMemo(
    () => Object.values(baseDurations).reduce((sum, duration) => sum + duration, 0),
    [baseDurations],
  );
  const activeStartTime = useMemo(
    () => sceneKeys.slice(0, activeIndex).reduce((sum, key) => sum + baseDurations[key], 0),
    [activeIndex, baseDurations, sceneKeys],
  );

  const onSceneChange = useCallback((rawKey: string) => {
    const index = sceneKeys.indexOf(stripRepeatSuffix(rawKey));
    if (index >= 0) setActiveIndex(index);
    setTick((value) => value + 1);
  }, [sceneKeys]);

  const jumpTo = useCallback((index: number) => {
    setActiveIndex(index);
    setPaused(false);
    setMountKey((value) => value + 1);
    setTick((value) => value + 1);
  }, []);

  const toggleLock = useCallback(() => {
    setLocked((value) => !value);
    setPaused(false);
    setMountKey((value) => value + 1);
    setTick((value) => value + 1);
  }, []);

  return {
    sceneKeys,
    activeIndex,
    locked,
    paused,
    mountKey,
    tick,
    durations,
    activeDuration: baseDurations[sceneKeys[activeIndex]] ?? 0,
    activeStartTime,
    totalDuration,
    onSceneChange,
    jumpTo,
    toggleLock,
    togglePause: () => setPaused((value) => !value),
  };
}