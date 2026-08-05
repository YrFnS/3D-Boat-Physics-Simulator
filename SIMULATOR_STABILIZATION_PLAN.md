# Simulator Stabilization Plan

This branch stabilizes the cumulative simulator from `integration/all-branches-20260804` before any further calibration, visual expansion, or release promotion.

## P0A — Exact-head validation

- [x] Create one cumulative stabilization branch from the latest integration head.
- [ ] Open one draft pull request back into `integration/all-branches-20260804`.
- [ ] Require CI, product experience, visual smoke, physics calibration, and release validation on the exact stabilization head.
- [ ] Treat previous Phase 4 release evidence as historical rather than evidence for this branch.

## P0B — Runtime authority

- [ ] Prevent all vessel, flooding, collision, mission, and environmental frame callbacks from advancing while paused.
- [ ] Keep the render loop stopped while the authoritative collision runtime is unavailable.
- [ ] Block launch, controls, mission time, and reset recovery until the matching Rapier world is ready.
- [ ] Present a visible recovery path when collision initialization stalls.
- [ ] Separate menu-only visual animation from authoritative simulation time.

## P0C — World consistency

- [ ] Define one heading-to-world-vector convention for wind, rain, waves, flags, audio, current, and navigation.
- [ ] Make wave direction respond to wind direction.
- [ ] Remove moving whirlpool state from cached terrain and collision generation.
- [ ] Share immutable terrain data between rendering, shoreline dampening, route safety, and Rapier collision.

## P0D — Collision lifecycle and scoring

- [ ] Replace per-step contact-point accumulation with collider-pair contact-start events.
- [ ] Count one sustained grounding/contact as one gameplay collision.
- [ ] Preserve separate impact telemetry for damage and diagnostics.
- [ ] Add regressions for sustained contact, contact separation, and repeated impact.

## P1 — Mission and damage fairness

- [ ] Drive mission time and travelled distance from fixed simulation steps.
- [ ] Lock scenario environment presets during scored missions or mark modified runs as assisted.
- [ ] Replace generic radius completion with typed gate, relay, cargo, and rescue interactions.
- [ ] Remove unexplained normal-operation hull wear.
- [ ] Rebalance field repair and account for repair use in scoring.

## P2 — Architecture and performance

- [ ] Split vessel runtime, physics, collision, damage, telemetry, audio, and rendering responsibilities out of `Boat.tsx`.
- [ ] Version obstacle data and synchronize Rapier colliders only when obstacle state changes.
- [ ] Align visible terrain detail and collision detail near the vessel.
- [ ] Complete the physical desktop, integrated-GPU, and touch-device benchmark matrix.

## Release rule

No release checklist item may be marked complete from an older commit. Every automated and physical result must identify the exact tested stabilization head.