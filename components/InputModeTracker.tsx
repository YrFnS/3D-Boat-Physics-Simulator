'use client';

import { useEffect } from 'react';
import { useExperienceSettings } from '@/store/useExperienceSettings';

function preferredInputMode() {
  if (typeof window === 'undefined') return 'keyboard' as const;
  return window.matchMedia('(pointer: coarse)').matches
    ? ('touch' as const)
    : ('keyboard' as const);
}

export default function InputModeTracker() {
  const setInputMode = useExperienceSettings((state) => state.setInputMode);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(pointer: coarse)');
    setInputMode(preferredInputMode());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt') {
        return;
      }
      setInputMode('keyboard');
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        setInputMode('touch');
      }
    };
    const handlePointerPreference = () => {
      setInputMode(mediaQuery.matches ? 'touch' : 'keyboard');
    };

    window.addEventListener('keydown', handleKeyDown, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, {
      passive: true,
    });
    mediaQuery.addEventListener('change', handlePointerPreference);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
      mediaQuery.removeEventListener('change', handlePointerPreference);
    };
  }, [setInputMode]);

  return null;
}
