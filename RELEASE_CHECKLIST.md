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
- [ ] No unresolved pull-request review threads remain.

## 2. Automated release artifact review

Download the `release-validation` workflow artifact and review:

- [ ] `report.json` reports all Chromium, Firefox, and WebKit product flows as passed.
- [ ] Representative cross-engine calibration metrics remain inside the recorded tolerance.
- [ ] `visual-report.json` reports every expected 3D screenshot as nonblank.
- [ ] Desktop screenshots show the vessel, water, horizon/world detail, and readable UI.
- [ ] The mobile screenshot shows touch controls without viewport overflow.
- [ ] Unsupported-WebGL and context-loss screenshots show actionable recovery UI.
- [ ] Corrupted local-storage startup reaches the normal launch briefing.
- [ ] No unexpected external HTTP requests are present in the report.
- [ ] No severe console entries, page errors, or failed requests are present.

## 3. Physical hardware benchmark matrix

Software-rendered CI validates correctness and structural budgets, but it cannot provide representative hardware FPS. Record each physical run below.

| Device | OS | Browser | GPU | Scenario | Quality | Avg FPS | Min FPS | Avg frame time | Notes |
|---|---|---|---|---|---|---:|---:|---:|---|
| Target desktop |  |  |  | Calm | High |  |  |  |  |
| Target desktop |  |  |  | Storm | High |  |  |  |  |
| Integrated graphics |  |  |  | Calm | Medium |  |  |  |  |
| Integrated graphics |  |  |  | Storm | Medium |  |  |  |  |
| Physical phone/tablet |  |  |  | Calm | Auto |  |  |  | portrait |
| Physical phone/tablet |  |  |  | Storm | Auto |  |  |  | landscape |

For each run:

- [ ] The wake remains visible without excessive diffusion or clipping.
- [ ] Terrain and ocean LOD transitions are not distracting.
- [ ] Storm clouds, rain, fog, lightning, and tornado effects remain readable.
- [ ] Camera motion is comfortable in chase, helm, orbit, and cinematic modes.
- [ ] The HUD and navigation chart are readable at the tested interface scale.
- [ ] Touch controls remain reachable and do not overlap essential instruments.
- [ ] The device does not show severe thermal throttling during an extended storm run.
- [ ] Auto quality settles on a reasonable tier without repeated oscillation.

## 4. Gameplay and recovery sign-off

- [ ] Every scenario can be launched, paused, resumed, restarted, and exited to the briefing.
- [ ] Route waypoints, physical mission entities, completion, failure, and scoring work.
- [ ] Player-plotted free-navigation marks can be added, undone, cleared, and restarted.
- [ ] Checkpoint recovery recreates the vessel at the latest safe location.
- [ ] Best score, best time, attempts, completions, failures, and last-run history persist.
- [ ] A corrupted stored preference/history value does not prevent startup.
- [ ] Vessel reset and repair cannot leave controls stuck.
- [ ] WebGL context loss presents recovery guidance rather than a blank screen.

## 5. Release metadata

- [ ] Update `package.json` to the intended semantic version.
- [ ] Update README project status and known limitations.
- [ ] Confirm the version tag does not already exist.
- [ ] Confirm `main` points to the exact validated commit.
- [ ] Create the release tag from that commit.
- [ ] Publish release notes summarizing performance, physics, gameplay, validation, and known limitations.
- [ ] Attach or link the final validation artifact where appropriate.

## Known manual limitation

Actual GPU frame-rate and thermal behavior require physical hardware. Headless CI measurements are retained only for regression diagnosis and structural render budgets; they are not advertised as user-facing performance claims.
