export type RuntimeSessionPhase = 'menu' | 'running' | 'paused';
export type SimulatorFrameLoop = 'always' | 'demand' | 'never';

export interface ResolveSimulatorFrameLoopOptions {
  collisionRuntimeReady: boolean;
  automationMode: boolean;
  sessionPhase: RuntimeSessionPhase;
}

/**
 * Resolves the React Three Fiber frame-loop authority for the current runtime.
 *
 * A vessel generation without a ready collision world must never execute frame
 * callbacks. Paused sessions also use `never` rather than `demand`, because a
 * demand render still executes `useFrame` callbacks and could otherwise advance
 * vessel, flooding, collision, mission, or environmental state.
 */
export function resolveSimulatorFrameLoop({
  collisionRuntimeReady,
  automationMode,
  sessionPhase,
}: ResolveSimulatorFrameLoopOptions): SimulatorFrameLoop {
  if (!collisionRuntimeReady) return 'never';
  if (automationMode || sessionPhase === 'running') return 'always';
  if (sessionPhase === 'paused') return 'never';
  return 'demand';
}

/** Vessel controls and recovery actions require both a running session and the
 * authoritative collision world for the active vessel generation. */
export function canAcceptVesselInput(
  collisionRuntimeReady: boolean,
  sessionPhase: RuntimeSessionPhase,
) {
  return collisionRuntimeReady && sessionPhase === 'running';
}
