'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useSimStore } from '@/store/useSimStore';

const SAMPLE_WINDOW_SECONDS = 0.5;

export default function PerformanceTelemetry() {
  const { gl } = useThree();
  const sampleTime = useRef(0);
  const frameCount = useRef(0);
  const drawCallTotal = useRef(0);
  const triangleTotal = useRef(0);

  useEffect(() => {
    const previousAutoReset = gl.info.autoReset;
    gl.info.autoReset = false;

    return () => {
      gl.info.autoReset = previousAutoReset;
    };
  }, [gl]);

  // Reset before offscreen work such as the wake texture pass begins.
  useFrame((state) => {
    state.gl.info.reset();
  }, -1000);

  // A positive priority intentionally owns the final scene render. This lets us
  // read complete counters after both offscreen passes and the visible render.
  useFrame((state, delta) => {
    state.gl.render(state.scene, state.camera);

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
  }, 1000);

  return null;
}
