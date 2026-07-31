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
- [x] Add keyboard shortcuts for pause, camera cycling, vessel reset, HUD visibility, settings, and fullscreen.
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
- [x] Add player-placed free-navigation waypoints with safe-water correction, undo, clear, restart, and mission/free switching.
- [x] Add physical rescue targets, delivery cargo, navigation gates, and emergency-relay mission entities.
- [x] Require mission-task completion before route progression and final success.
- [x] Add restart checkpoints and scenario-specific safe respawn locations.
- [x] Recreate the authoritative six-degree vessel body at the latest recovery checkpoint.
- [x] Add best-time, best-score, completion, failure, and attempt history per scenario.
- [ ] Add a dedicated river-navigation passage and richer harbor-approach scenery.

## P3.3 — Input and settings

- [ ] Add gamepad detection, mapping, dead zones, and vibration feedback where supported.
- [ ] Add remappable keyboard controls.
- [ ] Add adjustable touch-control size, placement, and steering sensitivity.
- [x] Add camera field-of-view and follow-smoothing settings.
- [ ] Add independent master, engine, water, weather, and interface volume controls.
- [x] Persist camera, interface, accessibility, onboarding, and control-hint preferences.
- [x] Add a settings overlay that safely pauses and resumes an active simulation.
- [x] Add a reset-to-defaults action without clearing completed onboarding state.

## P3.4 — Onboarding, accessibility, and polish

- [x] Add a short interactive first-launch tutorial.
- [x] Add contextual control hints that adapt to keyboard and touch input.
- [x] Add reduced-motion, high-contrast, and larger-interface options.
- [x] Add a collapsible HUD and refined responsive desktop/tablet/phone layouts.
- [x] Add loading progress, recoverable WebGL-context handling, and unsupported-device guidance.
- [x] Allow software and integrated WebGL renderers instead of rejecting performance-caveat devices.
- [ ] Add camera transitions, scenario introductions, completion moments, and refined sound cues.
- [ ] Run final product-level browser, mobile, integrated-GPU, and real-device review before Phase 4.

## Permanent validation

- [x] Validate desktop launch, navigation, camera, HUD, pause, reset, restart, and preference persistence.
- [x] Validate mobile navigation, pause/resume, HUD behavior, and touch controls.
- [x] Validate mission-completion and mission-failure result flows.
- [x] Validate first-run onboarding, guide replay, settings application, and settings persistence.
- [x] Validate free-route plotting, editing, mission/free switching, and clearing.
- [x] Validate checkpoint activation and authoritative vessel recovery.
- [x] Validate mission-task completion and persistent scenario records.
- [x] Preserve the deterministic vessel calibration and Rapier contact suites.

## Phase 3 exit criteria

Phase 3 is complete when a first-time user can select a vessel and scenario, understand the controls, navigate an objective, pause or recover safely, use keyboard/touch/gamepad input, adjust persistent settings, and complete a scenario without developer knowledge or debug controls.
