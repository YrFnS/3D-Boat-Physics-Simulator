'use client';

import { useState } from 'react';

const AUTOMATION_QUERY_KEYS = [
  'calibration',
  'collisionCalibration',
  'collisionTest',
  'autostart',
] as const;

function readAutomationMode() {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  return (
    params.get('debug') === '1' ||
    AUTOMATION_QUERY_KEYS.some((key) => params.has(key))
  );
}

export function useAutomationMode() {
  const [automationMode] = useState(readAutomationMode);
  return automationMode;
}
