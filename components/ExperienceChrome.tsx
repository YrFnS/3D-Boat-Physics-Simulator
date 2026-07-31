'use client';

import { useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useSimStore } from '@/store/useSimStore';

interface ExperienceChromeProps {
  automationMode: boolean;
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Fullscreen can be blocked by browser policy or embedding settings.
  }
}

export default function ExperienceChrome({
  automationMode,
}: ExperienceChromeProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const state = useSimStore(
    useShallow((store) => ({
      sessionPhase: store.sessionPhase,
      hudVisible: store.hudVisible,
      toggleHud: store.toggleHud,
    })),
  );

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(document.fullscreenElement !== null);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        isEditableTarget(event.target) ||
        useSimStore.getState().sessionPhase !== 'running'
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'h') {
        event.preventDefault();
        useSimStore.getState().toggleHud();
      } else if (key === 'f') {
        event.preventDefault();
        void toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (automationMode || state.sessionPhase !== 'running') return null;

  return (
    <div className="pointer-events-auto absolute right-3 top-[13.25rem] z-[70] flex flex-col gap-2 sm:bottom-4 sm:left-1/2 sm:right-auto sm:top-auto sm:-translate-x-1/2 sm:flex-row">
      <button
        type="button"
        aria-label={state.hudVisible ? 'Hide instrument HUD' : 'Show instrument HUD'}
        title={`${state.hudVisible ? 'Hide' : 'Show'} HUD (H)`}
        onClick={state.toggleHud}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-950/75 text-slate-200 shadow-xl backdrop-blur-xl transition hover:border-white/20 hover:bg-slate-900 sm:h-10 sm:w-auto sm:gap-2 sm:px-3"
      >
        {state.hudVisible ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
        <span className="hidden text-xs font-semibold sm:inline">
          {state.hudVisible ? 'Hide HUD' : 'Show HUD'}
        </span>
      </button>
      <button
        type="button"
        aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        title={`${fullscreen ? 'Exit' : 'Enter'} fullscreen (F)`}
        onClick={() => void toggleFullscreen()}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-950/75 text-slate-200 shadow-xl backdrop-blur-xl transition hover:border-white/20 hover:bg-slate-900 sm:h-10 sm:w-auto sm:gap-2 sm:px-3"
      >
        {fullscreen ? (
          <Minimize2 className="h-4 w-4" />
        ) : (
          <Maximize2 className="h-4 w-4" />
        )}
        <span className="hidden text-xs font-semibold sm:inline">
          {fullscreen ? 'Windowed' : 'Fullscreen'}
        </span>
      </button>
    </div>
  );
}
