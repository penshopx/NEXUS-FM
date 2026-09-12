import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Repeat,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';

const SCENE_DETAILS: Record<string, { title: string; filePath: string }> = {
  intro: { title: 'Intro', filePath: 'src/components/video/video_scenes/Scene0.tsx' },
  principle1: { title: 'Facility First', filePath: 'src/components/video/video_scenes/Scene1.tsx' },
  principle2: { title: 'Verified Work', filePath: 'src/components/video/video_scenes/Scene2.tsx' },
  principle3: { title: 'Critical Issues', filePath: 'src/components/video/video_scenes/Scene3.tsx' },
  principle4: { title: 'Domain Logic', filePath: 'src/components/video/video_scenes/Scene4.tsx' },
  principle5: { title: 'AI and Audit', filePath: 'src/components/video/video_scenes/Scene5.tsx' },
  foundation: { title: 'Secure Foundation', filePath: 'src/components/video/video_scenes/Scene6.tsx' },
  outro: { title: 'Outro', filePath: 'src/components/video/video_scenes/Scene7.tsx' },
};

const PROGRESS_TICK_MS = 60;

function formatTime(durationMs: number) {
  const seconds = Math.max(0, Math.floor(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function PlaybackStatus({
  sceneKeys, activeIndex, activeDuration, activeStartTime, totalDuration,
  tick, paused, onJumpTo,
}: {
  sceneKeys: string[]; activeIndex: number; activeDuration: number;
  activeStartTime: number; totalDuration: number; tick: number; paused: boolean;
  onJumpTo: (index: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const elapsedBase = useRef(0);

  useEffect(() => {
    setElapsed(0);
    elapsedBase.current = 0;
  }, [tick]);

  useEffect(() => {
    if (paused) return;
    const start = performance.now();
    const id = window.setInterval(
      () => setElapsed(elapsedBase.current + performance.now() - start),
      PROGRESS_TICK_MS,
    );
    return () => {
      window.clearInterval(id);
      elapsedBase.current += performance.now() - start;
    };
  }, [paused, tick]);

  const progress = activeDuration ? Math.min(1, elapsed / activeDuration) : 0;
  const totalElapsed = Math.min(totalDuration, activeStartTime + Math.min(elapsed, activeDuration));

  return (
    <>
      <div className="flex flex-1 items-center gap-1.5">
        {sceneKeys.map((key, index) => (
          <button
            key={key}
            onClick={() => onJumpTo(index)}
            className="relative h-3 min-h-[12px] flex-1 cursor-pointer overflow-hidden rounded-full bg-white/20 transition-all hover:h-4 hover:bg-white/25"
            aria-label={`Jump to scene ${index + 1}`}
            aria-current={index === activeIndex ? 'true' : undefined}
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-white/90 transition-[width] duration-100"
              style={{ width: `${index === activeIndex ? progress * 100 : 0}%` }}
            />
          </button>
        ))}
      </div>
      <span className="shrink-0 font-mono text-xl text-white/60">{activeIndex + 1}/{sceneKeys.length}</span>
      <span className="min-w-[11ch] shrink-0 text-right font-mono text-xl text-white/80">
        {formatTime(totalElapsed)} / {formatTime(totalDuration)}
      </span>
    </>
  );
}

export default function VideoWithControls() {
  const isIframed = typeof window !== 'undefined' && window.self !== window.top;
  const controls = useSceneControls(SCENE_DURATIONS);
  const [muted, setMuted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);
  const sensorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!controls.paused) return;
    const frozen = document.getAnimations().filter((animation) => animation.playState === 'running');
    frozen.forEach((animation) => animation.pause());
    return () => frozen.forEach((animation) => animation.play());
  }, [controls.paused]);

  const jumpTo = useCallback((index: number) => {
    controls.jumpTo(index);
    const key = controls.sceneKeys[index];
    const details = SCENE_DETAILS[key];
    if (!details) return;
    window.parent.postMessage({
      type: 'REPLIT_VIDEO_SCENE_SELECTED',
      payload: {
        sceneIndex: index,
        sceneCount: controls.sceneKeys.length,
        sceneTitle: details.title,
        filePath: details.filePath,
        lineNumber: 1,
      },
    }, '*');
  }, [controls]);

  useEffect(() => {
    if (!(collapsed && tapPinned)) return;
    const handleOutsideTap = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && !sensorRef.current?.contains(event.target as Node)) {
        setTapPinned(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideTap);
    return () => document.removeEventListener('pointerdown', handleOutsideTap);
  }, [collapsed, tapPinned]);

  if (!isIframed) return <VideoTemplate />;
  const visible = !collapsed || hovering || tapPinned;

  return (
    <div className="relative h-screen w-full">
      <VideoTemplate
        key={controls.mountKey}
        durations={controls.durations}
        paused={controls.paused}
        muted={muted}
        onSceneChange={controls.onSceneChange}
      />
      <div
        ref={sensorRef}
        className="absolute inset-x-0 bottom-0 z-50 flex h-1/4 flex-col justify-end"
        onPointerEnter={(event) => event.pointerType === 'mouse' && setHovering(true)}
        onPointerLeave={(event) => event.pointerType === 'mouse' && setHovering(false)}
        onPointerDown={(event) => event.pointerType !== 'mouse' && collapsed && setTapPinned(true)}
      >
        <div className="flex-1" />
        <div className={`flex items-center gap-3 bg-black/50 px-5 py-4 backdrop-blur-sm transition-all duration-200 ${visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'}`}>
          <button onClick={controls.togglePause} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white" aria-label={controls.paused ? 'Play' : 'Pause'}>
            {controls.paused ? <Play className="h-8 w-8" /> : <Pause className="h-8 w-8" />}
          </button>
          <button onClick={controls.toggleLock} className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg ${controls.locked ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'}`} aria-label="Loop current scene" aria-pressed={controls.locked}>
            <Repeat className="h-8 w-8" />
          </button>
          <button onClick={() => setMuted((value) => !value)} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white" aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX className="h-8 w-8" /> : <Volume2 className="h-8 w-8" />}
          </button>
          <div className="w-px self-stretch bg-white/15" />
          <PlaybackStatus
            sceneKeys={controls.sceneKeys}
            activeIndex={controls.activeIndex}
            activeDuration={controls.activeDuration}
            activeStartTime={controls.activeStartTime}
            totalDuration={controls.totalDuration}
            tick={controls.tick}
            paused={controls.paused}
            onJumpTo={jumpTo}
          />
          <button
            onClick={() => setCollapsed((value) => {
              if (!value) { setHovering(false); setTapPinned(false); }
              return !value;
            })}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
            aria-label={collapsed ? 'Show controls' : 'Hide controls'}
          >
            {collapsed ? <ChevronUp className="h-10 w-10" /> : <ChevronDown className="h-10 w-10" />}
          </button>
        </div>
      </div>
    </div>
  );
}