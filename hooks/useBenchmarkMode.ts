'use client';

import { useState } from 'react';

function readBenchmarkMode() {
  if (typeof window === 'undefined') return false;

  const value = new URLSearchParams(window.location.search).get('benchmark');
  return value === '1' || value === 'true' || value === 'release';
}

/**
 * Enables the physical-device release harness without persisting developer
 * diagnostics or exposing the normal product shell during a benchmark run.
 */
export function useBenchmarkMode() {
  const [benchmarkMode] = useState(readBenchmarkMode);
  return benchmarkMode;
}
