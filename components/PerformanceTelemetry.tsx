'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { useSimStore } from '@/store/useSimStore';

const SAMPLE_WINDOW_SECONDS = 0.5;

export default function PerformanceTelemetry() {
  const sampleTime = useRef(0);
  const frameCount = useRef(0);
  const drawCallTotal = useRef(0);
  const triangleTotal = useRef(0);

  useFrame((state, delta) => {
    const safeDelta = Math.min(delta, 0.25);

    sampleTime.current += safeDelta;
    frameCount.current += 1;
    drawCallTotal.current += state.gl.info.render.calls;
    triangleTotal.current += state.gl.info.render.triangles;

    if (sampleTime.current < SAMPLE_WINDOW_SECONDS) return;

    const elapsed = sampleTime.current;
    const frames = Math.max(1, frameCount.current);

    useSimStore.getState().setPerformanceTelemetry({
      fps: frames / elapsed,
      frameTimeMs: (elapsed / frames) * 1000,
      drawCalls: Math.round(drawCallTotal.current / frames),
      triangles: Math.round(triangleTotal.current / frames),
    });

    sampleTime.current = 0;
    frameCount.current = 0;
    drawCallTotal.current = 0;
    triangleTotal.current = 0;
  });

  return null;
}
