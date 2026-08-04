# v1.0.0 Release Checklist

Use this checklist for the first stable simulator release and for later release candidates. A release commit must be validated exactly; do not combine results from different heads. PR #12 records the exact validated branch head for the current candidate.

## Current status

- [x] `package.json` and `package-lock.json` use version `1.0.0`.
- [x] The README describes the completed Phase 5A–5D architecture and current limitations.
- [x] `RELEASE_NOTES_v1.0.0.md` is prepared.
- [x] The `v1.0.0` tag name is currently unused.
- [x] Repository-owned automated release validation is green on the prepared candidate.
- [ ] Physical desktop, integrated-graphics, and touch-device benchmark evidence is recorded.
- [ ] PR #12 is promoted from draft after the manual evidence is attached.
- [ ] PR #12 is merged into `main`.
- [ ] `v1.0.0` is tagged from the final validated `main` commit and the GitHub release is published.

## 1. Repository gates

- [x] `npm ci` completes from the committed lockfile.
- [x] Deterministic marine and dynamic collision-authority regressions pass.
- [x] ESLint completes with zero warnings.
- [x] TypeScript `--noEmit` completes successfully.
- [x] The Next.js production build completes successfully.
- [x] The full committed dependency audit reports zero advisories.
- [x] The permanent CI workflow is green on the candidate head.
- [x] The desktop, mobile, and real collision visual-smoke workflow is green.
- [x] The complete 20-scenario trawler and speedboat calibration workflow is green.
- [x] The product-experience workflow is green.
- [x] The Chromium, Firefox, and WebKit release-validation workflow is green.
- [x] The physical benchmark harness smoke test completes and exports a valid schema-version-1 report.
- [x] No unresolved pull-request review threads or submitted review blockers remain.

## 2. Automated release artifact review

The release-validation artifact for the prepared candidate was downloaded and inspected:

- [x] `report.json` reports all Chromium, Firefox, and WebKit product flows as passed.
- [x] All four representative cross-engine calibration comparisons pass.
- [x] Mobile held-touch input, layout, accessibility, and runtime checks pass.
- [x] Unsupported-WebGL and context-loss recovery pass.
- [x] Corrupted local-storage startup reaches the normal product flow.
- [x] No unexpected external requests, page errors, or failed requests are present.
- [x] `visual-report.json` reports every required desktop, physics, and mobile screenshot as nonblank and nonuniform.
- [x] `hardware-benchmark-smoke.json` confirms a complete visible-tab warmup, measurement, metadata capture, and JSON export.
- [x] The software-rendered benchmark result is retained only as structural evidence and is not presented as physical-GPU performance.

Automated summary:

```text
Desktop browser engines passed:     3 / 3
Cross-engine comparisons passed:    4 / 4
Physics calibration scenarios:      20 / 20
Mobile touch flow:                   passed
WebGL recovery:                      passed
Corrupted-storage recovery:          passed
Screenshot integrity:               passed
Benchmark harness and export:        passed
Overall automated candidate:         passed
```

## 3. Physical hardware benchmark procedure

Software-rendered CI validates correctness and structural budgets, but it cannot provide representative hardware FPS or thermal behavior. Use the built-in release harness for every physical run.

1. Open the exact final preview or local production build with `?benchmark=1` appended to the URL.
2. Close unnecessary applications, connect laptops to their intended power source, and note the power or performance mode.
3. Enter a clear device label. The harness records browser, OS, GPU renderer, CPU concurrency, reported memory, touch capability, viewport, DPR, and orientation.
4. Select the required quality tier. Auto mode remains adaptive and records every observed quality tier and quality change.
5. Add room temperature, power mode, and visual observations to **Run notes**.
6. Run **Calm** and keep the tab visible for the full 10-second warmup and 30-second measurement.
7. Set the required orientation or quality, then run **Storm**. A hidden tab invalidates the run automatically.
8. Review average FPS, minimum FPS, fifth-percentile FPS, frame time, draw calls, triangles, quality changes, and first-half versus second-half FPS drift.
9. Repeat any result marked **Review run**. A second-half drop of 15% or more is flagged as possible thermal or power throttling.
10. Use **Export JSON** to preserve the evidence and **Copy checklist rows** to generate Markdown rows for the table below.

The harness stores the most recent 24 results locally so Calm and Storm runs can be exported together.

## 4. Physical hardware benchmark matrix

| Device | OS | Browser | GPU | Scenario | Quality | Avg FPS | Min FPS | Avg frame time | Notes |
|---|---|---|---|---|---|---:|---:|---:|---|
| Target desktop |  |  |  | Calm | High |  |  |  |  |
| Target desktop |  |  |  | Storm | High |  |  |  |  |
| Integrated graphics |  |  |  | Calm | Medium |  |  |  |  |
| Integrated graphics |  |  |  | Storm | Medium |  |  |  |  |
| Physical phone or tablet |  |  |  | Calm | Auto |  |  |  | portrait |
| Physical phone or tablet |  |  |  | Storm | Auto |  |  |  | landscape |

For every physical run:

- [ ] The benchmark report is valid and contains no hidden samples.
- [ ] The wake remains visible without excessive diffusion or clipping.
- [ ] Terrain and ocean LOD transitions are not distracting.
- [ ] Storm clouds, rain, fog, lightning, and tornado effects remain readable.
- [ ] Camera motion is comfortable in chase, helm, orbit, and cinematic modes.
- [ ] The HUD and navigation chart are readable at the tested interface scale.
- [ ] Touch controls remain reachable and do not overlap essential instruments where applicable.
- [ ] The device does not show severe thermal throttling during the extended storm run.
- [ ] Auto quality settles on a reasonable tier without repeated oscillation where applicable.
- [ ] The exported JSON report is attached to or linked from PR #12.

## 5. Gameplay and recovery sign-off

The permanent product workflows validate these flows on the automated candidate:

- [x] Every scenario can be launched, paused, resumed, restarted, and exited to the briefing.
- [x] Route waypoints, physical mission entities, completion, failure, and scoring work.
- [x] Player-plotted free-navigation marks can be added, undone, cleared, and restarted.
- [x] Checkpoint recovery recreates the vessel at the latest safe location.
- [x] Best score, best time, attempts, completions, failures, and last-run history persist.
- [x] A corrupted stored preference or history value does not prevent startup.
- [x] Vessel reset and repair do not leave controls stuck.
- [x] WebGL context loss presents recovery guidance rather than a blank screen.

Physical-device observations still required:

- [ ] Keyboard and mouse controls feel responsive on the target desktop.
- [ ] Touch controls remain comfortable on the selected phone or tablet.
- [ ] Any available gamepad behavior is recorded as an observation; full gamepad mapping is not a v1.0 blocker.

## 6. Release metadata

- [x] Update `package.json` and `package-lock.json` to `1.0.0`.
- [x] Update the README project status, architecture, and known limitations.
- [x] Prepare `RELEASE_NOTES_v1.0.0.md`.
- [x] Confirm the `v1.0.0` tag name is unused.
- [ ] Confirm `main` points to the exact candidate that passed automated and physical sign-off.
- [ ] Create the `v1.0.0` tag from that commit.
- [ ] Publish the GitHub release using the prepared release notes.
- [ ] Attach or link the final automated and physical benchmark artifacts.

## Known manual limitation

Actual GPU frame rate, sustained thermals, visual comfort, and touch ergonomics require representative physical hardware. Headless CI measurements are retained only for regression diagnosis and structural render budgets; they are not advertised as user-facing performance claims.
