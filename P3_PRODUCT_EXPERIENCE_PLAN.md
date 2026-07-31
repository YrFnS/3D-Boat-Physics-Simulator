# Phase 3 — Product Experience

This document tracks the work required to turn the calibrated marine simulation into a complete, approachable product experience.

## P3.1 — Session shell and camera system

- [x] Merge the completed Phase 2 physics branch into `main`.
- [x] Create `agent/phase-3-product-experience` from the merged Phase 2 commit.
- [x] Add a launch briefing with scenario and vessel selection.
- [x] Add reusable environment presets for open water, harbor training, storm passage, and winter rescue.
- [x] Add running, paused, and briefing session states.
- [x] Add pause, resume, restart, reset-vessel, and return-to-briefing actions.
- [x] Add chase, helm, orbit, and cinematic camera modes.
- [x] Add keyboard shortcuts for pause, camera cycling, and vessel reset.
- [x] Preserve calibration, smoke-test, benchmark, and debug automation entry points.
- [x] Add persistent vessel, scenario, camera, and HUD preferences.
- [x] Add HUD visibility and fullscreen controls.
- [x] Complete desktop/mobile browser validation for the session shell.

## P3.2 — Navigation, objectives, and scenario progression

- [x] Add a responsive marine chart/minimap with vessel heading and route markers.
- [x] Add data-driven mission waypoints, world-space beacons, distance, bearing, and route guidance.
- [x] Resolve authored waypoints onto safe navigable water using the procedural terrain field.
- [x] Add scenario objectives, progress tracking, operational time limits, success conditions, and failure conditions.
- [x] Add route gameplay for open water, harbor training, storm passage, and winter rescue.
- [x] Add mission scoring based on time, damage, contacts, and vessel resets.
- [x] Add scenario-completion and failure summaries with retry, briefing, and next-passage actions.
- [ ] Add player-placed free-navigation waypoints.
- [ ] Add rescue targets, delivery cargo, obstacle-course gates, river navigation, and harbor-approach mission entities.
- [ ] Add restart checkpoints and scenario-specific safe respawn locations.
- [ ] Add best-time, best-score, and per-scenario history persistence.

## P3.3 — Input and settings

- [ ] Add gamepad detection, mapping, dead zones, and vibration feedback where supported.
- [ ] Add remappable keyboard controls.
- [ ] Add adjustable touch-control size, placement, and steering sensitivity.
- [ ] Add camera sensitivity, field-of-view, and motion-smoothing settings.
- [ ] Add independent master, engine, water, weather, and interface volume controls.
- [ ] Persist control, camera, audio, accessibility, and scenario preferences.

## P3.4 — Onboarding, accessibility, and polish

- [ ] Add a short interactive first-launch tutorial.
- [ ] Add contextual control hints that adapt to keyboard, touch, and gamepad input.
- [ ] Add reduced-motion, high-contrast, and larger-interface options.
- [ ] Add a collapsible desktop HUD and refined tablet/phone layouts.
- [ ] Add loading progress, recoverable WebGL errors, and unsupported-device guidance.
- [ ] Add camera transitions, scenario introductions, completion moments, and refined sound cues.
- [ ] Run final product-level browser, mobile, integrated-GPU, and real-device review before Phase 4.

## Phase 3 exit criteria

Phase 3 is complete when a first-time user can select a vessel and scenario, understand the controls, navigate an objective, pause or recover safely, use keyboard/touch/gamepad input, adjust persistent settings, and complete a scenario without developer knowledge or debug controls.
