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

- [ ] Add typed reference-vessel profiles with official source metadata.
- [ ] Add unit-safe helpers for knots, horsepower, Froude number, geometric ratios, and displacement/power metrics.
- [ ] Add deterministic tests for source completeness and derived quantities.
- [ ] Generate a machine-readable report comparing the current simulator proxies with the reference classes.
- [ ] Keep this checkpoint observational: do not silently alter runtime handling while establishing the independent baseline.

### 5E.2 — Propulsion and resistance calibration

- [ ] Replace the trawler's high-speed internal envelope with a displacement-regime Froude target based on the Nordhavn reference.
- [ ] Bring the speedboat's maximum Froude number and cruise region into the Axopar reference range.
- [ ] Calibrate rated power, propeller loading, resistance, ahead/astern ratio, acceleration, and stopping behavior.
- [ ] Preserve power-limited propulsion, signed water-relative flow, cavitation, ventilation, and reverse behavior.
- [ ] Record before/after dimensional and nondimensional metrics.

### 5E.3 — Hydrostatics and stability calibration

- [ ] Reconcile displacement, draft, waterplane area, center of mass, and center of buoyancy.
- [ ] Add static heel/righting-moment probes.
- [ ] Add roll-decay period and damping-ratio probes.
- [ ] Add pitch-decay and trim-response probes.
- [ ] Separate source-backed targets from engineering ranges where public manufacturer data is unavailable.

### 5E.4 — Maneuvering and sea-state calibration

- [ ] Calibrate forward and reverse turning-radius-to-length ratios.
- [ ] Calibrate stopping-distance-to-length ratios.
- [ ] Add head, following, and beam-sea scenarios with fixed wave spectra.
- [ ] Add crosswind and current scenarios using water-relative measurements.
- [ ] Confirm no false planing, unstable energy growth, or collision regression.

### 5E.5 — Exact-head validation

- [ ] Pass the expanded independent physical-reference suite.
- [ ] Pass all existing marine and collision regressions.
- [ ] Pass the complete browser calibration matrix.
- [ ] Pass visual smoke, product experience, and Chromium/Firefox/WebKit release validation.
- [ ] Document uncertainty, unresolved data gaps, and any intentionally deferred CFD or sea-trial work.

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
