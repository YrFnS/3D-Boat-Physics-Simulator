'use client';

import { useEffect, useState } from 'react';

const AUTOMATION_QUERY_KEYS = [
  'calibration',
  'collisionCalibration',
  'collisionTest',
  'autostart',
] as const;

export function useAutomationMode() {
  const [automationMode, setAutomationMode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const enabled =
      params.get('debug') === '1' ||
      AUTOMATION_QUERY_KEYS.some((key) => params.has(key));
    setAutomationMode(enabled);
  }, []);

  return automationMode;
}
