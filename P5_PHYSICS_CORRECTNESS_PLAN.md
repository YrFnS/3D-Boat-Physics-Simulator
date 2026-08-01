# Phase 5 — Physics Correctness Foundation

This document tracks the first physics overhaul after the validated Phase 4 release candidate. Phase 5A fixes incorrect reference frames, time accounting, damage/flooding direction, and non-physical state mutation before deeper hydrostatics, propulsion, and collision work begins.

## Goal

Preserve the stable fixed-step six-degree architecture and existing gameplay while ensuring that the core equations respond in the physically correct direction and remain deterministic across display frame rates.

## Phase 5A scope

### Fixed-step timing

- [x] Make the substep budget capable of consuming the configured maximum frame delta.
- [x] Account for time removed by frame-delta clamping as dropped simulation time.
- [x] Account for discarded accumulator backlog without double counting.
- [x] Add deterministic runner tests covering low-FPS frames, long stalls, interpolation, and reset behavior.

### Vessel reference frames

- [x] Use complete body-space forward/right/up axes for hydrodynamic drag.
- [x] Use complete body-space axes for thrust and rudder-force application.
- [x] Keep horizontal projection only for navigation heading and presentation.
- [x] Base planing and forward-flow decisions on signed water-relative surge speed.

### Damage, flooding, and environmental forces

- [x] Correct the damage and winter draft-offset sign so reduced buoyancy lowers the vessel instead of lifting it.
- [x] Replace direct ice, tornado, and whirlpool velocity edits with forces, torques, or explicit impulses.
- [x] Keep random hazard behavior deterministic and timestep-scaled.
- [x] Apply safety invariants after collision and environmental impulses.

### Invalid-state recovery

- [x] Preserve the last valid transform and momentum state.
- [x] Roll back to the last valid state when an invalid force poisons an integration step.
- [x] Avoid teleporting an invalid vessel to the world origin.

### Regression validation

- [x] Add pure deterministic physics-correctness tests.
- [x] Extend CI so correctness tests run before browser calibration.
- [x] Re-run lint, TypeScript, production build, physics calibration, collision calibration, visual smoke, product experience, and release validation.
- [x] Preserve every existing calibration envelope; restore the representative speedboat turn-entry fixture from `0.21` to `0.24` throttle after corrected body-relative forces reduced its approach speed.

## Validated checkpoint

Phase 5A passed the complete repository validation matrix at commit `cc07a5df0f5867ed2c940b5a09907abf3f9e0ccb`:

- CI, deterministic correctness tests, lint, TypeScript, production build, and dependency audit.
- 16 of 16 trawler, speedboat, grounding, glancing, and impact calibration scenarios.
- Desktop and mobile visual smoke.
- Session, navigation, gameplay, onboarding, settings, and persistence flows.
- Chromium, Firefox, and WebKit release validation, physical benchmark harness checks, screenshot integrity, and recovery paths.

The speedboat turn calibration entered at `17.52758 m/s` against the unchanged `14–37 m/s` envelope, completed `180.53515°` of heading change, produced a `20.16159 m` turn radius, and remained below the existing roll limit.

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
