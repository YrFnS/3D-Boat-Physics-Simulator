# Phase 5E — Reference Selection and Initial Gap Report

This checkpoint selects two traceable manufacturer references, compares their published quantities with the current abstract v1 vessels, and records how much source data is still missing before matched trials or fitting may begin. It does **not** claim that either simulator vessel already represents the selected boat.

## Selected references

### Displacement workboat: De Wit Tomboy 26

Official source: <https://dewitworkboats.com/tomboy-26/>

The manufacturer publishes:

| Quantity | Published value |
|---|---:|
| Length overall | 7.96 m |
| Beam overall | 2.39 m |
| Draft | 1.22 m |
| Lightship weight | 5,670 kg |
| Deadweight | 1,500 kg |
| Maximum load | 1,200 kg |
| Standard engine | 90 kW |
| Fuel capacity | 2 × 110 L |
| Speed | 7.5 kn / 3.85833 m/s |
| Bollard pull | 1,200 kgf |

The page does not define one matched trial inventory. Lightship, deadweight, maximum load, and fuel capacity are stored independently rather than being summed into an invented displacement. Water density, center of gravity, trim, engine mass, gearbox, propeller, rudder geometry, wind, waves, depth, instrumentation, repeatability, and uncertainty remain unknown. The profile therefore stays `provisional`.

### Planing speedboat: Axopar 22 Spyder

Current product source: <https://www.axopar.com/boat-models/axopar-22/axopar-22-spyder/>

The current product page publishes:

| Quantity | Published value |
|---|---:|
| Hull | Twin-stepped 20-degree V |
| Length overall excluding engine | 7.2 m |
| Beam | 2.23 m |
| Weight excluding engine | 1,200 kg |
| Draft to propellers | 0.8 m |
| Engine range | 115–250 hp / approximately 85.8–186.4 kW |
| Maximum-speed statement | Up to 45 kn / 23.14998 m/s |
| Cruise example | 27 kn with one 200 hp Mercury |

“Up to 45 knots” is represented only as a maximum ceiling. It is not treated as a guaranteed lower-bound sea-trial result.

### Axopar model-year loading source

Owner manual: <https://manuals.axopar.com/content/p19len/1.7.1.0/en/index.html>

The model-year 2021–2023 manual supplies a separate maximum-load context:

| Quantity | Published value |
|---|---:|
| Hull weight excluding engine | 1,100 kg |
| Maximum engine weight | 261 kg |
| Boat weight at maximum load | 2,620 kg |
| Maximum recommended load | 823 kg |
| Persons mass | 525 kg |
| Consumable liquids | 203 kg |
| Fuel tank | 230 L |
| Draft at maximum load | 0.95 m |
| Maximum recommended power | 149 kW / 200 hp |

These model-year values differ from the current product page. They remain a separate loading-case record; they are not averaged or blended into one fictional Axopar configuration. The manual still omits CG, trim, test water density, propeller, steering geometry, and the inventory and environmental conditions behind the published speed statements.

## Current measured comparison

The branch calibration still passes all 20 v1 regression scenarios. The external profiles intentionally fail because the current v1 boats are abstract gameplay vessels with different scale, loading, and power.

### Current trawler versus Tomboy 26

| Quantity | Current simulator | Reference | Difference |
|---|---:|---:|---:|
| Length | 4.00 m | 7.96 m | −49.7% |
| Beam | 2.00 m | 2.39 m | −16.3% |
| Configured mass | 1,500 kg | 5,670 kg lightship | −73.5% |
| Draft | 0.60 m | 1.22 m | −50.8% |
| Rated power | 240 kW | 90 kW standard | +166.7% |
| Steady speed | 9.58263 m/s | 3.85833 m/s | +148.4% |
| Bollard pull | Not measured | 1,200 kgf | Missing trial |

Result: comparison score **0/100**, measurement coverage **92%**, external evidence coverage **100%**, certification **false**.

This is not a coefficient-level mismatch. A Tomboy-calibrated vessel requires dedicated full-scale geometry, mass, propulsion, hydrostatics, and collision properties rather than modifying the v1 trawler in place.

### Current speedboat versus Axopar 22 Spyder

| Quantity | Current simulator | Current product reference | Difference |
|---|---:|---:|---:|
| Length | 3.20 m | 7.20 m | −55.6% |
| Beam | 1.20 m | 2.23 m | −46.2% |
| Configured mass | 800 kg | 1,200 kg excluding engine | −33.3% |
| Draft | 0.30 m | 0.80 m to propellers | −62.5% |
| Rated power | 360 kW | 85.8–186.4 kW range | 93.1% above published maximum |
| Planing-hull classification | Yes | Twin-stepped planing hull | Match |
| Steady speed | 22.01584 m/s / 42.80 kn | Up to 23.14998 m/s / 45 kn | Below ceiling |
| Matched 27 kn cruise trial | Not measured | Published example | Missing trial |

Result: comparison score **21.74/100**, measurement coverage **92%**, external evidence coverage **100%**, certification **false**.

The apparent top-speed agreement is not sufficient validation because the simulated vessel is much smaller, lighter, shallower, and more powerful. Phase 5E must match a specific model-year configuration and loading state before speed can be used as a calibration target.

## Reference-configuration coverage

| Configuration | Known fields | Published coverage | Required matched-trial fields | Trial readiness | Trial ready |
|---|---:|---:|---:|---:|---:|
| Tomboy 26 | 9 / 30 | 30.0% | 4 / 15 | 26.7% | No |
| Axopar 22 Spyder | 13 / 30 | 43.3% | 4 / 15 | 26.7% | No |

Both configurations still need matched displacement, water density, longitudinal and vertical CG, trim, gear ratio, propeller diameter and pitch, shaft angle, and steering geometry.

## Loading-case coverage

| Loading case | Known fields | Published coverage | Required static fields | Readiness | Trial ready |
|---|---:|---:|---:|---:|---:|
| Tomboy published capacity data | 5 / 14 | 35.7% | 1 / 6 | 16.7% | No |
| Axopar 22 MY2021–2023 maximum load | 8 / 14 | 57.1% | 2 / 6 | 33.3% | No |

The Tomboy case lacks one internally defined displacement. The Axopar manual supplies displacement and draft, but both cases still lack water density, longitudinal CG, vertical CG, and static trim. Neither can yet drive a matched static-equilibrium calibration.

## Architecture decision

The v1 `trawler` and `speedboat` remain unchanged as release and gameplay baselines. Phase 5E now has separate evidence-oriented profile, configuration, and loading-case records. Runtime calibration-only `VesselConfig` instances will be created only after their required input coverage is sufficient.

The next implementation checkpoint is:

1. acquire or derive a traceable CG and trim range for each selected loading case;
2. identify the exact engine, gearbox, propeller, shaft, and steering setup used by a matched trial;
3. add a matched static-draft test using displacement, water density, CG, and trim;
4. add a Tomboy bollard-pull trial and an Axopar 27-knot cruise-condition trial;
5. add acceleration, stopping, turning, roll-decay, and seakeeping holdouts only when traceable data exists;
6. run sensitivity analysis before fitting any coefficient;
7. keep every v1 regression and release gate unchanged.

## Generated files

The physics-calibration artifact now includes:

- `physical-comparison.json` — external target scores, measurement coverage, evidence coverage, and certification state;
- `reference-configurations.json` — configuration coverage and missing matched-trial fields;
- `reference-loading-cases.json` — published load-case coverage and missing static-trial fields.

## Trust boundary

Manufacturer specifications certify only the quantities they state. They do not certify the simulator's maneuvering, stability, acceleration, stopping, collision, or sea-state response. Those claims require matched full-scale or model-test evidence with uncertainty and operating conditions.
