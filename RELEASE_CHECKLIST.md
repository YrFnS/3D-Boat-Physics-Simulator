# Release Checklist

Use this checklist for the first stable simulator release and for later release candidates. A release commit must be validated exactly; do not combine results from different heads.

## 1. Repository gates

- [ ] `npm ci` completes from the committed lockfile.
- [ ] ESLint completes with zero warnings.
- [ ] TypeScript `--noEmit` completes successfully.
- [ ] The Next.js production build completes successfully.
- [ ] The full committed dependency audit reports zero advisories.
- [ ] The permanent CI workflow is green on the exact release commit.
- [ ] The desktop/mobile/Rapier visual smoke workflow is green.
- [ ] The complete deterministic trawler and speedboat calibration workflow is green.
- [ ] The product-experience workflow is green.
- [ ] The Phase 4 cross-browser release-validation workflow is green.
- [ ] The physical benchmark harness smoke test is green.
- [ ] No unresolved pull-request review threads remain.

## 2. Automated release artifact review

Download the `release-validation` workflow artifact and review:

- [ ] `report.json` reports all Chromium, Firefox, and WebKit product flows as passed.
- [ ] Representative cross-engine calibration metrics remain inside the recorded tolerance.
- [ ] `visual-report.json` reports every expected 3D screenshot as nonblank.
- [ ] `hardware-benchmark-smoke.json` confirms the physical benchmark interface can complete and export a valid report.
- [ ] Desktop screenshots show the vessel, water, horizon/world detail, and readable UI.
- [ ] The mobile screenshot shows touch controls without viewport overflow.
- [ ] Unsupported-WebGL and context-loss screenshots show actionable recovery UI.
- [ ] Corrupted local-storage startup reaches the normal launch briefing.
- [ ] No unexpected external HTTP requests are present in the report.
- [ ] No severe console entries, page errors, or failed requests are present.

## 3. Physical hardware benchmark procedure

Software-rendered CI validates correctness and structural budgets, but it cannot provide representative hardware FPS. Use the built-in release harness for every physical run.

1. Open the exact final preview or local production build with `?benchmark=1` appended to the URL.
2. Close unnecessary applications, connect laptops to their intended power source, and note the power/performance mode.
3. Enter a clear device label. The harness automatically records browser, OS, GPU renderer, CPU concurrency, reported memory, touch capability, viewport, DPR, and orientation.
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
| Physical phone/tablet |  |  |  | Calm | Auto |  |  |  | portrait |
| Physical phone/tablet |  |  |  | Storm | Auto |  |  |  | landscape |

For each run:

- [ ] The benchmark report is marked valid and contains no hidden samples.
- [ ] The wake remains visible without excessive diffusion or clipping.
- [ ] Terrain and ocean LOD transitions are not distracting.
- [ ] Storm clouds, rain, fog, lightning, and tornado effects remain readable.
- [ ] Camera motion is comfortable in chase, helm, orbit, and cinematic modes.
- [ ] The HUD and navigation chart are readable at the tested interface scale.
- [ ] Touch controls remain reachable and do not overlap essential instruments.
- [ ] The device does not show severe thermal throttling during the extended storm run.
- [ ] Auto quality settles on a reasonable tier without repeated oscillation.
- [ ] The exported JSON report is attached to or linked from the release PR.

## 5. Gameplay and recovery sign-off

- [ ] Every scenario can be launched, paused, resumed, restarted, and exited to the briefing.
- [ ] Route waypoints, physical mission entities, completion, failure, and scoring work.
- [ ] Player-plotted free-navigation marks can be added, undone, cleared, and restarted.
- [ ] Checkpoint recovery recreates the vessel at the latest safe location.
- [ ] Best score, best time, attempts, completions, failures, and last-run history persist.
- [ ] A corrupted stored preference/history value does not prevent startup.
- [ ] Vessel reset and repair cannot leave controls stuck.
- [ ] WebGL context loss presents recovery guidance rather than a blank screen.

## 6. Release metadata

- [ ] Update `package.json` to the intended semantic version.
- [ ] Update README project status and known limitations.
- [ ] Confirm the version tag does not already exist.
- [ ] Confirm `main` points to the exact validated commit.
- [ ] Create the release tag from that commit.
- [ ] Publish release notes summarizing performance, physics, gameplay, validation, and known limitations.
- [ ] Attach or link the final automated and physical benchmark artifacts where appropriate.

## Known manual limitation

Actual GPU frame-rate and thermal behavior require physical hardware. Headless CI measurements are retained only for regression diagnosis and structural render budgets; they are not advertised as user-facing performance claims.
