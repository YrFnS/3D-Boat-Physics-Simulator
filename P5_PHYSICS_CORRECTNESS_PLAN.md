# Phase 5 — Physics Correctness Foundation

This document tracks the first physics overhaul after the validated Phase 4 release candidate. Phase 5A fixes incorrect reference frames, time accounting, damage/flooding direction, and non-physical state mutation before deeper hydrostatics, propulsion, and collision work begins.

## Goal

Preserve the stable fixed-step six-degree architecture and existing gameplay while ensuring that the core equations respond in the physically correct direction and remain deterministic across display frame rates.

## Phase 5A scope

### Fixed-step timing

- [ ] Make the substep budget capable of consuming the configured maximum frame delta.
- [ ] Account for time removed by frame-delta clamping as dropped simulation time.
- [ ] Account for discarded accumulator backlog without double counting.
- [ ] Add deterministic runner tests covering low-FPS frames, long stalls, interpolation, and reset behavior.

### Vessel reference frames

- [ ] Use complete body-space forward/right/up axes for hydrodynamic drag.
- [ ] Use complete body-space axes for thrust and rudder-force application.
- [ ] Keep horizontal projection only for navigation heading and presentation.
- [ ] Base planing and forward-flow decisions on signed water-relative surge speed.

### Damage, flooding, and environmental forces

- [ ] Correct the damage and winter draft-offset sign so reduced buoyancy lowers the vessel instead of lifting it.
- [ ] Replace direct ice, tornado, and whirlpool velocity edits with forces, torques, or explicit impulses.
- [ ] Keep random hazard behavior deterministic and timestep-scaled.
- [ ] Apply safety invariants after collision and environmental impulses.

### Invalid-state recovery

- [ ] Preserve the last valid transform and momentum state.
- [ ] Roll back to the last valid state when an invalid force poisons an integration step.
- [ ] Avoid teleporting an invalid vessel to the world origin.

### Regression validation

- [ ] Add pure deterministic physics-correctness tests.
- [ ] Extend CI so correctness tests run before browser calibration.
- [ ] Re-run lint, TypeScript, production build, physics calibration, collision calibration, visual smoke, and release validation.
- [ ] Record any intended calibration-envelope changes rather than silently widening targets.

## Exit criteria

Phase 5A is complete when:

1. A 10 FPS render cadence no longer makes simulation time run slower than the accepted frame-time budget.
2. A one-second frame stall reports all discarded time.
3. Pitching and rolling the hull changes the direction of body-relative drag, thrust, and rudder forces.
4. A following current cannot cause a stationary or reversing speedboat to plane.
5. Increasing flooding or winter loading lowers equilibrium freeboard.
6. Ice and vortex hazards respect vessel mass and fixed-step duration.
7. Invalid state restores the most recent valid vessel state rather than resetting to `(0, 0, 0)`.
8. Existing calibrated scenarios remain finite and bounded, with any changed envelopes justified by corrected physics.

## Deferred to later Phase 5 work

- Displaced-volume hydrostatics and a dynamic center of buoyancy.
- Water surface normals, orbital velocity, and acceleration samples.
- Added mass and coupled body-frame damping.
- Section-based slamming and compartment flooding.
- Power/torque, propeller advance-ratio, cavitation, and signed prop-wash models.
- A single authoritative dynamic collision body or a complete effective-mass contact solver.
- Independent calibration against measured vessel dimensions and maneuvering data.
