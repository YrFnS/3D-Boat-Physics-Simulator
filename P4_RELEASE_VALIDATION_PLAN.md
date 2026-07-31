# Phase 4 — Release Validation

Phase 4 turns the merged simulator into a defensible release candidate. It does not add major gameplay scope; it verifies that the performance, physics, collision, and product systems from Phases 1–3 remain stable together.

## P4.1 — Automated release matrix

- [x] Create `agent/phase-4-release-validation` from the merged Phase 3 commit.
- [ ] Add a permanent Chromium, Firefox, and WebKit production-browser matrix.
- [ ] Validate the normal launch, scenario start, navigation, camera, pause/resume, settings, and full-viewport layout in each desktop browser engine.
- [ ] Validate touch controls in a mobile Chromium profile.
- [ ] Reject page errors, severe console messages, failed requests, unexpected external HTTP requests, and viewport overflow.
- [ ] Add basic accessible-name and dialog-label checks for all tested product states.

## P4.2 — Simulation consistency

- [ ] Run representative deterministic calibration scenarios in Chromium, Firefox, and WebKit.
- [ ] Compare cross-engine calibration metrics within a strict numeric tolerance.
- [ ] Validate finite position, velocity, angular velocity, quaternion, heading, submersion, collision, and damage state after held input.
- [ ] Record fixed-step advance, dropped simulation time, draw calls, triangles, and measured FPS for release artifacts.
- [ ] Keep the existing full 16-scenario calibration and Rapier contact suites mandatory.

## P4.3 — Runtime and deployment integrity

- [ ] Confirm the production build serves all required assets from the application origin.
- [ ] Confirm no runtime dependency on mutable external branches, CDNs, or third-party textures.
- [ ] Validate WebGL unsupported and context-loss recovery states.
- [ ] Validate local-storage corruption does not prevent startup.
- [ ] Confirm clean install, lint, typecheck, production build, and full dependency audit.
- [ ] Document the Vercel rate-limit status separately from source-code validation.

## P4.4 — Physical-device sign-off

- [ ] Run Calm and Storm benchmarks on the target desktop GPU.
- [ ] Run the same matrix on integrated graphics.
- [ ] Test a physical touch device in portrait and landscape.
- [ ] Verify keyboard, mouse, touch, and available gamepad behavior on real hardware.
- [ ] Review wake visibility, storm readability, camera comfort, HUD scale, and thermal performance.
- [ ] Record device, browser, quality tier, average FPS, minimum FPS, and visual observations.

## P4.5 — Release closeout

- [ ] Resolve any release-blocking validation findings.
- [ ] Update the README from development-phase language to release-candidate status.
- [ ] Add a concise release checklist and known-limitations section.
- [ ] Set the release version only after all automated gates are green.
- [ ] Merge the Phase 4 PR and create the first stable tag/release.

## Exit criteria

Phase 4 is complete when every repository-owned workflow is green on the exact release commit, representative deterministic metrics agree across browser engines, no release-blocking runtime/accessibility/layout issue remains, and the physical-device benchmark sheet has been reviewed. Physical GPU measurements are the only intentionally manual gate because software-rendered CI cannot provide representative hardware FPS.
