# Phase 4 — Release Validation

Phase 4 turns the merged simulator into a defensible release candidate. It does not add major gameplay scope; it verifies that the performance, physics, collision, and product systems from Phases 1–3 remain stable together.

## P4.1 — Automated release matrix

- [x] Create `agent/phase-4-release-validation` from the merged Phase 3 commit.
- [x] Add a permanent Chromium, Firefox, and WebKit production-browser matrix.
- [x] Validate the normal launch, scenario start, navigation, camera, pause/resume, settings, and full-viewport layout in each desktop browser engine.
- [x] Validate held touch controls and responsive layout in a mobile Chromium profile.
- [x] Reject page errors, severe console messages, failed requests, unexpected external HTTP requests, and viewport overflow.
- [x] Add accessible-name, dialog-label, and duplicate-ID checks for tested product states.
- [x] Add central-viewport screenshot entropy, deviation, dynamic-range, and dominant-color checks to reject blank, uniform, or camera-obstructed 3D output.

## P4.2 — Simulation consistency

- [x] Run representative deterministic calibration scenarios in Chromium, Firefox, and WebKit.
- [x] Compare cross-engine calibration metrics within a strict numeric tolerance.
- [x] Confirm the tested trawler-rest and speedboat-turn metrics are numerically identical across all three engines.
- [x] Validate finite position, velocity, angular velocity, quaternion, heading, submersion, collision, and vessel-condition state after held input.
- [x] Record fixed-step advance, dropped simulation time, draw calls, triangles, and software-rendered FPS in release artifacts.
- [x] Keep the existing complete calibration and Rapier contact suites mandatory.

## P4.3 — Runtime and deployment integrity

- [x] Confirm the production build serves tested runtime assets from the application origin.
- [x] Reject unexpected external HTTP requests during the release matrix.
- [x] Validate unsupported-WebGL and context-loss recovery states.
- [x] Validate corrupted settings, experience, and gameplay storage does not prevent startup.
- [x] Confirm clean install, lint, typecheck, production build, and full dependency audit.
- [x] Document the Vercel build-rate-limit status separately from source-code validation.

## P4.4 — Physical-device sign-off

- [ ] Run Calm and Storm benchmarks on the target desktop GPU.
- [ ] Run the same matrix on integrated graphics.
- [ ] Test a physical touch device in portrait and landscape.
- [ ] Verify keyboard, mouse, touch, and any available gamepad behavior on real hardware.
- [ ] Review wake visibility, storm readability, camera comfort, HUD scale, and thermal performance.
- [ ] Record device, browser, quality tier, average FPS, minimum FPS, and visual observations in `RELEASE_CHECKLIST.md`.

## P4.5 — Release closeout

- [x] Resolve the Firefox Linux CI WebGL issue by running headed Firefox under Xvfb while keeping the same product and calibration assertions.
- [x] Remove the obsolete camera tracker from `Boat.tsx` so `CameraRig.tsx` is the sole camera authority.
- [x] Add a concise release checklist and physical-hardware benchmark matrix.
- [x] Update the README from Phase 3 language to release-candidate status.
- [ ] Review the generated Phase 4 artifact on the exact final PR head.
- [ ] Set the release version only after the physical-device gate is reviewed.
- [ ] Merge the Phase 4 PR and create the first stable tag/release.

## Current automated result

The permanent release matrix covers all three desktop engines, four cross-engine calibration comparisons, mobile touch, WebGL recovery, corrupted-storage recovery, source validation, deterministic physics calibration, product flows, and screenshot-integrity checks. Headless FPS is retained only as diagnostic data; it is not used as a physical-GPU performance claim.

The final source layout has one camera owner: `CameraRig.tsx`. `Boat.tsx` now publishes vessel state and updates vessel visuals/audio without moving the active camera or OrbitControls target.

## Exit criteria

Phase 4 is complete when every repository-owned workflow is green on the exact release commit, representative deterministic metrics agree across browser engines, no release-blocking runtime/accessibility/layout issue remains, and the physical-device benchmark sheet has been reviewed. Physical GPU measurements are the only intentionally manual gate because software-rendered CI cannot provide representative hardware FPS.
