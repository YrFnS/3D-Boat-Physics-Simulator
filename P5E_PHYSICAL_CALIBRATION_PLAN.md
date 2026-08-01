# Phase 5E — Independent Physical Vessel Calibration

Phase 5E moves the simulator from internally consistent, game-oriented envelopes to traceable vessel-class calibration. It begins from the fully automated-validated `v1.0.0` candidate at `a9ef7acb6365ddc229761e403c32c8fa249ee5a7` and remains isolated from that release branch until the new physical targets are independently validated.

## Goal

Calibrate each simulator vessel against an official real-world reference class using source-backed dimensions, mass, power, speed, and loading data. Compare vessels with nondimensional quantities where the procedural mesh is not a one-to-one full-scale model, then retune propulsion, resistance, hydrostatics, stability, and maneuvering without weakening correctness, collision, browser, or product gates.

## Reference classes

### Displacement trawler proxy — Nordhavn 41

Official Nordhavn material provides:

- length overall: 12.60 m;
- waterline length: 12.19 m;
- beam: 4.24 m;
- draft: approximately 1.42 m;
- displacement: approximately 19.33 metric tonnes;
- twin 75 hp engines on current examples;
- approximately 8 knots local cruising speed;
- approximately 10 knots maximum speed on the official brokerage specification.

Sources:

- https://nordhavn.com/nordhavn-yacht-models/n41/
- https://nordhavn.com/seatrials-of-nordhavn-41-reveal-efficient-passagemaker/
- https://nordhavn.com/brokerage/nordhavn-trawlers-for-sale/nordhavn-41sea-escape/

### Planing speedboat proxy — Axopar 22 Spyder

Official Axopar material provides:

- length overall: 7.20 m;
- beam: 2.23 m;
- draft at maximum load: approximately 0.95 m in the owner manual;
- hull weight excluding engine: 1,100 kg in the owner manual;
- maximum loaded boat mass: 2,620 kg;
- maximum recommended engine power: 149 kW / 200 hp in the owner manual;
- representative cruise: 27 knots with a 200 hp engine;
- advertised maximum speed: up to 45 knots.

Sources:

- https://manuals.axopar.com/content/p19len/1.8.1.0/en/350.html
- https://www.axopar.com/boat-models/axopar-22/axopar-22-spyder/

## Calibration method

The current procedural vessels are visual and gameplay proxies, not literal full-scale CAD models. Phase 5E therefore uses both dimensional and nondimensional checks:

- Froude number for speed regime and wave-making similarity;
- beam-to-length and draft-to-length ratios;
- power-to-displacement ratio;
- displacement-to-waterplane consistency;
- turning radius divided by vessel length;
- stopping distance divided by vessel length;
- ahead-to-astern speed ratio;
- roll and pitch response normalized by forcing and vessel scale;
- energy, momentum, and finite-state bounds retained from earlier phases.

Official manufacturer values are stored separately from engineering assumptions. Every target records its source type and uncertainty so derived ranges cannot be mistaken for direct sea-trial measurements.

## Scope

### 5E.1 — Reference data and derived-target foundation

- [x] Add typed reference-vessel profiles with official source metadata.
- [x] Add unit-safe helpers for knots, horsepower, Froude number, geometric ratios, and displacement/power metrics.
- [x] Add deterministic tests for source completeness and derived quantities.
- [x] Generate a machine-readable report comparing the current simulator proxies with the reference classes.
- [x] Keep the first checkpoint observational and preserve the exact pre-tuning baseline.

### 5E.2 — Propulsion and resistance calibration

- [x] Replace the trawler's high-speed internal envelope with a displacement-regime Froude target based on the Nordhavn reference.
- [x] Bring the speedboat's maximum Froude number and cruise region into the Axopar reference range.
- [x] Calibrate rated power, propeller loading, resistance, ahead/astern ratio, acceleration, and stopping behavior.
- [x] Preserve power-limited propulsion, signed water-relative flow, cavitation, ventilation, and reverse behavior.
- [x] Record before/after dimensional and nondimensional metrics.

## Validated propulsion and maneuvering checkpoint

The permanent source was promoted in commit `c0c2d72527d67133f8c1f50d2a06935e9459af51` after an exact candidate passed all source-level checks and all 20 deterministic browser scenarios. Temporary payload and export workflows were deleted in the same commit.

No acceptance range was widened to make the candidate pass. The official reference profiles and scale-normalized target ranges were established before tuning, and the runtime parameters were then moved into those ranges.

### Final calibrated measurements

| Metric | Original trawler | Calibrated trawler | Original speedboat | Calibrated speedboat |
|---|---:|---:|---:|---:|
| Rated power | 240.0 kW | 10.0 kW | 360.0 kW | 109.5 kW |
| Steady ahead speed | 9.58263 m/s | 2.69166 m/s | 22.01584 m/s | 13.51715 m/s |
| Steady astern speed | 5.83685 m/s | 1.74166 m/s | 7.03294 m/s | 5.48741 m/s |
| Stopping time | 14.15000 s | 10.61667 s | 13.16667 s | 12.66667 s |
| Stopping distance | 31.29862 m | 15.02133 m | 52.54029 m | 38.74196 m |
| Forward turn radius | 6.30528 m | 5.49847 m | 31.04722 m | 20.94066 m |
| Reverse turn radius | 7.41070 m | 3.62499 m | 4.01243 m | 3.50750 m |

### Permanent physical changes

- The trawler is power-limited to the Nordhavn-derived specific-power regime instead of being driven by a 240 kW gameplay engine.
- The speedboat remains inside the Axopar-derived upper specific-power boundary while using a physically plausible planing onset.
- Powered planing and throttle-off coasting use separate wetted-resistance states, so cutting power restores drag rather than preserving the minimum powered-planing drag indefinitely.
- Astern rudder authority is explicit and independently bounded instead of reusing full ahead-flow steering authority.
- Grounding uses underwater terrain friction and a longer reverse-release probe rather than dry-contact friction that could trap a vessel indefinitely.
- The power, cavitation, reverse-flow, collision, finite-state, and reference-profile tests remain independent permanent gates.

### Evidence boundary

This checkpoint proves that the procedural proxies operate in plausible reference-class power and speed regimes and pass the deterministic maneuvering matrix. It does not claim that either mesh reproduces a specific Nordhavn 41 or Axopar 22 hull, and it does not replace proprietary hydrostatic tables, CFD, or instrumented full-scale trials.

### 5E.3 — Hydrostatics and stability calibration

- [x] Reconcile simulator-model displacement, draft, configured waterplane cells, center of mass, and center of buoyancy.
- [x] Add static heel and righting-moment probes at ±2°, ±5°, and ±10°.
- [x] Add nonlinear roll-decay recovery, period, and damping probes.
- [x] Add nonlinear pitch-decay, equilibrium-trim, period, and damping probes.
- [x] Separate source-backed vessel targets from engineering-derived simulator evidence.
- [ ] Replace or supplement engineering-derived envelopes with manufacturer hydrostatic tables, inclining-test data, or full-scale decay trials when traceable data becomes available.

## Validated hydrostatic and stability checkpoint

Commit `e069742244908d5d68b141d1b4920e40815a778b` promotes the permanent hydrostatic evaluator and nonlinear decay probes after the one-use transfer job verified source hashes, ran the complete source test command, linted, typechecked, built the production application, audited dependencies, generated the evidence artifact, and removed its own transfer files.

The evaluator uses the same sectional hydrostatic cells as runtime. It solves heave equilibrium by displaced volume, finds zero-torque roll and pitch equilibrium, samples nonlinear righting moments, derives small-angle stiffness and linearized periods, and then independently integrates a 36-second nonlinear decay response at 120 Hz with the configured linear, quadratic, and body angular damping.

### Static equilibrium

| Vessel | Upright origin Y | Deepest immersed draft | Displaced volume | Balance error |
|---|---:|---:|---:|---:|
| Trawler | −0.502082 m | 0.302082 m | 1.463415 m³ | ≤1×10⁻⁹ |
| Speedboat | −0.874108 m | 0.274108 m | 0.780488 m³ | ≤1×10⁻⁹ |

### Restoring and decay measurements

| Vessel / axis | Equilibrium angle | Stiffness | Linearized damping ratio | Linearized damped period | Measured recovery | Measured period | Measured decay ratio |
|---|---:|---:|---:|---:|---:|---:|---:|
| Trawler roll | 0.000000° | 15,534.166689 Nm/rad | 0.574799 | 2.734382 s | 0.975000 s | 2.753106 s | 0.579018 |
| Trawler pitch | −0.534919° | 77,816.185665 Nm/rad | 0.221458 | 1.475349 s | 1.400000 s | 1.471748 s | 0.223263 |
| Speedboat roll | 0.000000° | 4,457.241172 Nm/rad | 0.946823 | 13.113519 s | 1.958333 s | 13.125259 s | Not resolved after later peaks reached numerical zero |
| Speedboat pitch | 1.356684° | 29,444.494620 Nm/rad | 0.269584 | 1.674800 s | 1.500000 s | 1.563322 s | 0.264201 |

All sampled offsets produce restoring moments. Roll port/starboard symmetry stays within 5%. Pitch permits a documented 35% fore-aft asymmetry limit because the configured bow, cockpit, and transom stations are intentionally not longitudinally symmetric. The measured trawler and speedboat pitch behavior and trawler roll behavior closely agree with the independently linearized periods and damping ratios. The speedboat roll response is near critically damped: it settles successfully, but later same-sign extrema become too small for a meaningful logarithmic-decrement ratio.

### Evidence boundary

These results are classified `engineering-derived`. They validate the simulator's own hydrostatic geometry, static equilibrium, restoring signs, stiffness, damping configuration, and nonlinear settling behavior. They are not Nordhavn or Axopar hydrostatic tables, inclining experiments, model-basin measurements, or full-scale decay trials. External hydrostatic evidence remains an explicit unresolved data requirement rather than being inferred from passing simulator probes.

The machine-readable report is generated at `artifacts/physics-calibration/hydrostatic-stability.json` and is part of the permanent `npm run test:physics` gate.

### 5E.4 — Maneuvering and sea-state calibration

- [x] Calibrate forward and reverse turning-radius-to-length ratios.
- [x] Calibrate stopping-distance-to-length ratios.
- [ ] Add head, following, and beam-sea scenarios with fixed wave spectra.
- [ ] Add crosswind and current scenarios using water-relative measurements.
- [x] Confirm no false planing, unstable energy growth, or collision regression in the propulsion checkpoint.

### 5E.5 — Exact-head validation

- [ ] Pass the expanded independent physical-reference suite on the final checkpoint head.
- [ ] Pass all existing marine and collision regressions on the final checkpoint head.
- [ ] Pass the complete browser calibration matrix on the final checkpoint head.
- [ ] Pass visual smoke, product experience, and Chromium/Firefox/WebKit release validation on the final checkpoint head.
- [x] Document uncertainty, unresolved data gaps, and intentionally deferred CFD or sea-trial work.

## Exit criteria

Phase 5E is complete when:

1. Every vessel has an official reference profile with traceable source metadata.
2. Runtime speed regimes are plausible in Froude-number terms for their reference classes.
3. Power-to-displacement, draft, and hydrostatic balance are documented rather than implicit tuning values.
4. Acceleration, maximum speed, astern speed, stopping, and turning are evaluated dimensionally and by vessel length.
5. Static stability and decay behavior have independent tests.
6. Sea-state response includes head, following, and beam-wave cases.
7. Existing physics correctness, collision authority, product, visual, and browser gates remain green.
8. No acceptance range is widened merely to preserve a pre-reference result.

## Deliberately deferred

- Manufacturer-proprietary hull offsets and hydrostatic tables.
- CFD-resolved resistance and propulsor interaction.
- Instrumented full-scale sea-trial datasets not publicly released by the manufacturer.
- Multiple vessels, dynamic floating obstacles, and vessel-to-vessel interaction.
