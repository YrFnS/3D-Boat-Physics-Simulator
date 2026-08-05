# Scored environment authority repair diagnostic

## Migration output
```text
```

## Validation output
```text

> 3d-boat-physics-simulator@1.0.0 validate
> npm run test:physics && npm run lint && npm run typecheck && npm run build && npm run audit


> 3d-boat-physics-simulator@1.0.0 test:physics
> npm run test:runtime-authority && npm run test:world-environment && npm run test:world-direction && npm run test:collision-lifecycle && npm run test:mission-runtime && npm run test:scored-environment && node --experimental-strip-types --no-warnings scripts/physics-correctness.mjs && node --no-warnings scripts/collision-authority.mjs && npm run test:physical-calibration && node --experimental-strip-types --no-warnings scripts/reference-vessel-validation.mjs && node --experimental-strip-types --no-warnings scripts/hydrostatic-stability-validation.mjs


> 3d-boat-physics-simulator@1.0.0 test:runtime-authority
> node --experimental-strip-types --no-warnings scripts/runtime-authority-contract.mjs

Runtime authority contract passed.

> 3d-boat-physics-simulator@1.0.0 test:world-environment
> node --experimental-strip-types --no-warnings scripts/world-environment-contract.mjs

World environment contract passed.

> 3d-boat-physics-simulator@1.0.0 test:world-direction
> node --experimental-strip-types --no-warnings scripts/world-direction-contract.mjs

World direction contract passed.

> 3d-boat-physics-simulator@1.0.0 test:collision-lifecycle
> node --experimental-strip-types --no-warnings scripts/collision-contact-lifecycle-contract.mjs

Collision contact lifecycle contract passed.

> 3d-boat-physics-simulator@1.0.0 test:mission-runtime
> node --experimental-strip-types --no-warnings scripts/mission-runtime-statistics-contract.mjs

Mission runtime statistics contract passed.

> 3d-boat-physics-simulator@1.0.0 test:scored-environment
> node --experimental-strip-types --no-warnings scripts/scored-scenario-environment-contract.mjs

Scored scenario environment authority contract passed.
Physics correctness regression tests passed.
using deprecated parameters for the initialization function; pass a single object instead
{
  "centered": {
    "position": {
      "x": -0.000012277534551685676,
      "y": -0.000009003500963444822,
      "z": 3.110541820526123
    },
    "linearVelocity": {
      "x": -0.000005566082563746022,
      "y": -0.000004081796305399621,
      "z": 0.35999998450279236
    },
    "angularVelocity": {
      "x": 0.000002809417765092803,
      "y": -0.000003831021786027122,
      "z": -1.3925221652860698e-18
    },
    "angularSpeedRadPerSecond": 0.00000475074268971005,
    "maximumImpulseNs": 11232.0009765625,
    "geometricContactCount": 2,
    "solverContactCount": 2,
    "initialEnergyJ": 48600,
    "finalEnergyJ": 77.75999334394811
  },
  "offCenter": {
    "position": {
      "x": -5.442623615264893,
      "y": 0.000002566594275776879,
      "z": 0.8171908855438232
    },
    "linearVelocity": {
      "x": -2.4726617336273193,
      "y": 0.000001163505203294335,
      "z": -0.6798382997512817
    },
    "angularVelocity": {
      "x": -0.0000010810624644363998,
      "y": -1.6497626304626465,
      "z": -9.057396255229833e-8
    },
    "angularSpeedRadPerSecond": 1.6497626304630033,
    "maximumImpulseNs": 10165.953125,
    "geometricContactCount": 8,
    "solverContactCount": 3,
    "initialEnergyJ": 48600,
    "finalEnergyJ": 5170.51422924545
  },
  "highInertia": {
    "position": {
      "x": -3.498432159423828,
      "y": 0.0000016191870599868707,
      "z": 1.7388746738433838
    },
    "linearVelocity": {
      "x": -1.5895495414733887,
      "y": 7.333422900046571e-7,
      "z": -0.2615976929664612
    },
    "angularVelocity": {
      "x": -5.458236955746543e-7,
      "y": -0.9732581973075867,
      "z": -1.7610140901069826e-8
    },
    "angularSpeedRadPerSecond": 0.9732581973077399,
    "maximumImpulseNs": 10593.1298828125,
    "geometricContactCount": 6,
    "solverContactCount": 3,
    "initialEnergyJ": 48600,
    "finalEnergyJ": 3262.077392186585
  },
  "reversedOrder": {
    "position": {
      "x": -5.442623615264893,
      "y": 0.000002566594275776879,
      "z": 0.8171908855438232
    },
    "linearVelocity": {
      "x": -2.4726617336273193,
      "y": 0.000001163505203294335,
      "z": -0.6798382997512817
    },
    "angularVelocity": {
      "x": -0.0000010810624644363998,
      "y": -1.6497626304626465,
      "z": -9.057396255229833e-8
    },
    "angularSpeedRadPerSecond": 1.6497626304630033,
    "maximumImpulseNs": 10165.953125,
    "geometricContactCount": 8,
    "solverContactCount": 3,
    "initialEnergyJ": 48600,
    "finalEnergyJ": 5170.51422924545
  },
  "orderDifferences": {
    "positionDifferenceM": 0,
    "linearVelocityDifferenceMps": 0,
    "angularVelocityDifferenceRadPerSecond": 0,
    "impulseDifferenceRatio": 0
  }
}
Dynamic collision-authority regression tests passed.

> 3d-boat-physics-simulator@1.0.0 test:physical-calibration
> node --experimental-strip-types --no-warnings scripts/physical-calibration-contract.mjs && node --experimental-strip-types --no-warnings scripts/external-reference-contract.mjs && node --experimental-strip-types --no-warnings scripts/reference-configuration-contract.mjs && node --experimental-strip-types --no-warnings scripts/reference-loading-case-contract.mjs

Physical calibration contract tests passed.
External vessel reference contract tests passed.
Reference vessel configuration contract tests passed.
Reference loading-case contract tests passed.
{
  "version": 1,
  "phase": "5E.1-reference-baseline",
  "generatedAt": "2026-08-05T19:40:41.150Z",
  "releaseCandidateCommit": "a9ef7acb6365ddc229761e403c32c8fa249ee5a7",
  "status": "retuning-required",
  "comparisons": [
    {
      "profile": {
        "id": "nordhavn-41",
        "vesselType": "trawler",
        "label": "Nordhavn 41 displacement passagemaker",
        "regime": "displacement",
        "dimensions": {
          "lengthOverallM": 12.6,
          "characteristicLengthM": 12.19,
          "beamM": 4.24,
          "draftM": 1.42
        },
        "mass": {
          "displacementKg": {
            "min": 19000,
            "max": 19700
          },
          "basis": "Official Nordhavn quick specifications list approximately 19.33 metric tonnes; the range preserves published rounding differences."
        },
        "propulsion": {
          "ratedPowerW": {
            "min": 111854.98073734053,
            "max": 126768.97816898594
          },
          "cruiseSpeedMps": {
            "min": 3.6011111111111114,
            "max": 4.115555555555556
          },
          "maximumSpeedMps": {
            "min": 4.630000000000001,
            "max": 5.144444444444445
          },
          "basis": "Official current examples use twin 75 hp or 85 hp Beta diesels. Nordhavn sea-trial and brokerage material reports approximately 7-8 knot cruise and up to 10 knots."
        },
        "engineeringEnvelope": {
          "aheadToAsternSpeedRatio": {
            "min": 0.3,
            "max": 0.65
          },
          "stoppingDistanceLengthRatio": {
            "min": 2,
            "max": 10
          },
          "turnRadiusLengthRatio": {
            "min": 1,
            "max": 4.5
          },
          "notes": "Public manufacturer data does not provide standardized astern, crash-stop, or turning-circle trials. These deliberately broad engineering envelopes are secondary diagnostics, not manufacturer claims."
        },
        "evidence": [
          {
            "id": "nordhavn-41-model-specification",
            "title": "Nordhavn 41 model quick specifications",
            "url": "https://nordhavn.com/nordhavn-yacht-models/n41/",
            "kind": "manufacturer-specification",
            "accessedOn": "2026-08-01",
            "notes": "Provides LOA, LWL, beam, draft, and displacement for the reference class."
          },
          {
            "id": "nordhavn-41-sea-trial",
            "title": "Sea trials of Nordhavn 41 reveal efficient passagemaker",
            "url": "https://nordhavn.com/seatrials-of-nordhavn-41-reveal-efficient-passagemaker/",
            "kind": "manufacturer-sea-trial",
            "accessedOn": "2026-08-01",
            "notes": "Reports local cruising speed at approximately 8 knots."
          },
          {
            "id": "nordhavn-41-sea-escape",
            "title": "Nordhavn 41 Sea Escape official brokerage specification",
            "url": "https://nordhavn.com/brokerage/nordhavn-trawlers-for-sale/nordhavn-41sea-escape/",
            "kind": "manufacturer-brokerage-specification",
            "accessedOn": "2026-08-01",
            "notes": "Provides 7 knot cruise, 10 knot maximum speed, displacement, and twin 85 hp engine data for a completed vessel."
          }
        ]
      },
      "baseline": {
        "commitSha": "a9ef7acb6365ddc229761e403c32c8fa249ee5a7",
        "artifactLabel": "v1.0.0 exact-head physics calibration",
        "steadyAheadSpeedMps": 9.58263,
        "maximumAheadSpeedMps": 9.58264,
        "steadyAsternSpeedMps": 5.83685,
        "stoppingDistanceM": 31.29862,
        "stoppingTimeSeconds": 14.15,
        "turnRadiusM": 6.30528,
        "reverseTurnRadiusM": 7.4107,
        "stabilityRecoveryTimeSeconds": 0.86667
      },
      "comparison": {
        "vesselType": "trawler",
        "referenceId": "nordhavn-41",
        "proxyLengthM": 4,
        "proxyBeamM": 2,
        "proxyDraftM": 0.6,
        "proxyMassKg": 1500,
        "proxyRatedPowerW": 10000,
        "referenceCruiseFroudeRange": {
          "min": 0.32936263690009043,
          "max": 0.3764144421715319
        },
        "referenceMaximumFroudeRange": {
          "min": 0.42346624744297345,
          "max": 0.47051805271441494
        },
        "proxySteadyFroude": 1.5300104118744384,
        "proxyMaximumFroude": 1.5300120085242221,
        "referenceBeamLengthRatio": 0.33650793650793653,
        "proxyBeamLengthRatio": 0.5,
        "referenceDraftLengthRatio": 0.1126984126984127,
        "proxyDraftLengthRatio": 0.15,
        "referencePowerMassWPerKg": {
          "min": 5.677917803925915,
          "max": 6.672051482578207
        },
        "proxyPowerMassWPerKg": 6.666666666666667,
        "referenceEquivalentCruiseSpeedMps": {
          "min": 2.0628358217322553,
          "max": 2.357526653408292
        },
        "referenceEquivalentMaximumSpeedMps": {
          "min": 2.6522174850843285,
          "max": 2.946908316760365
        },
        "aheadToAsternSpeedRatio": 0.6091073118757585,
        "stoppingDistanceLengthRatio": 7.824655,
        "turnRadiusLengthRatio": 1.57632,
        "reverseTurnRadiusLengthRatio": 1.852675,
        "gaps": [
          "maximum-froude-number"
        ],
        "withinReferenceSpeedRegime": false,
        "withinReferenceSpecificPower": true
      }
    },
    {
      "profile": {
        "id": "axopar-22-spyder",
        "vesselType": "speedboat",
        "label": "Axopar 22 Spyder planing craft",
        "regime": "planing",
        "dimensions": {
          "lengthOverallM": 7.2,
          "characteristicLengthM": 7.2,
          "beamM": 2.23,
          "draftM": 0.95
        },
        "mass": {
          "displacementKg": {
            "min": 1361,
            "max": 2620
          },
          "basis": "The owner manual lists 1,100 kg hull mass excluding engine, a maximum engine mass of 261 kg, and a maximum loaded boat mass of 2,620 kg."
        },
        "propulsion": {
          "ratedPowerW": {
            "min": 149000,
            "max": 186424.96789556756
          },
          "cruiseSpeedMps": {
            "min": 12.861111111111112,
            "max": 14.91888888888889
          },
          "maximumSpeedMps": {
            "min": 20.57777777777778,
            "max": 23.150000000000002
          },
          "basis": "The owner manual lists 149 kW / 200 hp as its maximum recommended engine power for the referenced manual. Current manufacturer material lists 115-250 hp, a 27 knot 200 hp cruise example, and maximum speed up to 45 knots."
        },
        "engineeringEnvelope": {
          "aheadToAsternSpeedRatio": {
            "min": 0.2,
            "max": 0.55
          },
          "stoppingDistanceLengthRatio": {
            "min": 3,
            "max": 14
          },
          "turnRadiusLengthRatio": {
            "min": 1.5,
            "max": 7
          },
          "notes": "Public manufacturer material does not publish standardized astern, crash-stop, or turning-circle trials. These broad bounds are engineering review ranges only."
        },
        "evidence": [
          {
            "id": "axopar-22-owner-manual",
            "title": "Axopar 22 owner manual — dimensions, weight, and power",
            "url": "https://manuals.axopar.com/content/p19len/1.8.1.0/en/350.html",
            "kind": "manufacturer-owner-manual",
            "accessedOn": "2026-08-01",
            "notes": "Provides hull length, beam, draft, hull weight, engine power, engine weight, and maximum loaded mass."
          },
          {
            "id": "axopar-22-spyder-product",
            "title": "Axopar 22 Spyder technical specifications",
            "url": "https://www.axopar.com/boat-models/axopar-22/axopar-22-spyder/",
            "kind": "manufacturer-specification",
            "accessedOn": "2026-08-01",
            "notes": "Provides current engine range, 27 knot cruise example, and maximum speed up to 45 knots."
          }
        ]
      },
      "baseline": {
        "commitSha": "a9ef7acb6365ddc229761e403c32c8fa249ee5a7",
        "artifactLabel": "v1.0.0 exact-head physics calibration",
        "steadyAheadSpeedMps": 22.01584,
        "maximumAheadSpeedMps": 22.0764,
        "steadyAsternSpeedMps": 7.03294,
        "stoppingDistanceM": 52.54029,
        "stoppingTimeSeconds": 13.16667,
        "turnRadiusM": 31.04722,
        "reverseTurnRadiusM": 4.01243,
        "stabilityRecoveryTimeSeconds": 2.18333
      },
      "comparison": {
        "vesselType": "speedboat",
        "referenceId": "axopar-22-spyder",
        "proxyLengthM": 3.2,
        "proxyBeamM": 1.2,
        "proxyDraftM": 0.3,
        "proxyMassKg": 800,
        "proxyRatedPowerW": 109500,
        "referenceCruiseFroudeRange": {
          "min": 1.5305654451598218,
          "max": 1.7754559163853934
        },
        "referenceMaximumFroudeRange": {
          "min": 2.4489047122557146,
          "max": 2.7550178012876794
        },
        "proxySteadyFroude": 3.9300668106026784,
        "proxyMaximumFroude": 3.940877429050582,
        "referenceBeamLengthRatio": 0.30972222222222223,
        "proxyBeamLengthRatio": 0.37499999999999994,
        "referenceDraftLengthRatio": 0.13194444444444445,
        "proxyDraftLengthRatio": 0.09374999999999999,
        "referencePowerMassWPerKg": {
          "min": 56.87022900763359,
          "max": 136.97646428770577
        },
        "proxyPowerMassWPerKg": 136.875,
        "referenceEquivalentCruiseSpeedMps": {
          "min": 8.574074074074074,
          "max": 9.945925925925927
        },
        "referenceEquivalentMaximumSpeedMps": {
          "min": 13.718518518518518,
          "max": 15.433333333333335
        },
        "aheadToAsternSpeedRatio": 0.31944908756604334,
        "stoppingDistanceLengthRatio": 16.418840624999998,
        "turnRadiusLengthRatio": 9.70225625,
        "reverseTurnRadiusLengthRatio": 1.253884375,
        "gaps": [
          "maximum-froude-number",
          "stopping-distance-length-ratio",
          "turn-radius-length-ratio"
        ],
        "withinReferenceSpeedRegime": false,
        "withinReferenceSpecificPower": true
      }
    }
  ],
  "summary": {
    "references": 2,
    "sourceRecords": 5,
    "proxiesWithinReferenceSpeedRegime": 0,
    "proxiesWithinReferenceSpecificPower": 2,
    "detectedGaps": 4
  }
}
Physical reference baseline validation passed.
{
  "version": 1,
  "phase": "5E.3-hydrostatic-stability-foundation",
  "generatedAt": "2026-08-05T19:40:44.045Z",
  "evidenceClass": "engineering-derived",
  "vessels": [
    {
      "version": 1,
      "vessel": "trawler",
      "evidenceClass": "engineering-derived",
      "methodology": {
        "description": "Static heave equilibrium and sectional righting moments derived from the simulator hydrostatic cells; linearized periods and damping ratios use the configured inertia, added inertia, angular drag, and body damping.",
        "waterSurface": "flat",
        "waterHeightM": -1,
        "rightingOffsetsDeg": [
          -10,
          -5,
          -2,
          2,
          5,
          10
        ],
        "limitations": [
          "This is simulator-model evidence, not a manufacturer hydrostatic table or full-scale inclining experiment.",
          "The equilibrium solver holds yaw fixed and evaluates one angular axis at a time.",
          "Roll uses a strict port-starboard symmetry check; pitch permits bounded fore-aft asymmetry from the configured hull stations.",
          "The time-domain decay probe uses the same nonlinear sectional righting moment with configured linear, quadratic, and body angular damping; it is still simulator-model evidence rather than a full-scale decay trial."
        ]
      },
      "upright": {
        "axis": "roll",
        "angleDeg": 0,
        "originYM": -0.502082,
        "displacedVolumeM3": 1.463415,
        "displacementBalanceErrorRatio": 0,
        "deepestImmersedDraftM": 0.302082,
        "centerOfMassWorld": {
          "x": 0,
          "y": -0.652082,
          "z": 0.2
        },
        "centerOfBuoyancyWorld": {
          "x": 0,
          "y": -1.129062,
          "z": 0.249756
        },
        "hydrostaticTorqueNm": {
          "x": -732.164906,
          "y": 0,
          "z": 0
        },
        "axisTorqueNm": 0
      },
      "roll": {
        "axis": "roll",
        "equilibriumAngleDeg": 0,
        "equilibriumTorqueNm": 0,
        "equilibriumOriginYM": -0.502082,
        "equilibriumDraftM": 0.302082,
        "rightingSamples": [
          {
            "offsetDeg": -10,
            "absoluteAngleDeg": -10,
            "axisTorqueNm": 2625.577334,
            "rightingMomentNm": 2625.577334,
            "normalizedRightingMoment": 0.089214,
            "restoring": true,
            "originYM": -0.511721,
            "deepestImmersedDraftM": 0.473216
          },
          {
            "offsetDeg": -5,
            "absoluteAngleDeg": -5,
            "axisTorqueNm": 1350.407026,
            "rightingMomentNm": 1350.407026,
            "normalizedRightingMoment": 0.045885,
            "restoring": true,
            "originYM": -0.504515,
            "deepestImmersedDraftM": 0.388627
          },
          {
            "offsetDeg": -2,
            "absoluteAngleDeg": -2,
            "axisTorqueNm": 544.326611,
            "rightingMomentNm": 544.326611,
            "normalizedRightingMoment": 0.018496,
            "restoring": true,
            "originYM": -0.502473,
            "deepestImmersedDraftM": 0.336885
          },
          {
            "offsetDeg": 2,
            "absoluteAngleDeg": 2,
            "axisTorqueNm": -544.326611,
            "rightingMomentNm": 544.326611,
            "normalizedRightingMoment": 0.018496,
            "restoring": true,
            "originYM": -0.502473,
            "deepestImmersedDraftM": 0.336885
          },
          {
            "offsetDeg": 5,
            "absoluteAngleDeg": 5,
            "axisTorqueNm": -1350.407026,
            "rightingMomentNm": 1350.407026,
            "normalizedRightingMoment": 0.045885,
            "restoring": true,
            "originYM": -0.504515,
            "deepestImmersedDraftM": 0.388627
          },
          {
            "offsetDeg": 10,
            "absoluteAngleDeg": 10,
            "axisTorqueNm": -2625.577334,
            "rightingMomentNm": 2625.577334,
            "normalizedRightingMoment": 0.089214,
            "restoring": true,
            "originYM": -0.511721,
            "deepestImmersedDraftM": 0.473216
          }
        ],
        "linearizedStiffnessNmPerRad": 15534.166689,
        "effectiveInertiaKgM2": 1970,
        "effectiveLinearDampingNmPerRadPerSecond": 6359.5,
        "undampedNaturalPeriodSeconds": 2.237531,
        "dampingRatio": 0.574799,
        "dampedNaturalPeriodSeconds": 2.734382,
        "behavior": "underdamped",
        "maximumSymmetryErrorRatio": 0,
        "symmetryLimitRatio": 0.05,
        "decay": {
          "initialOffsetDeg": 10,
          "durationSeconds": 36,
          "timeStepSeconds": 0.008333,
          "finalOffsetDeg": 0,
          "maximumAbsoluteOffsetDeg": 10,
          "recoveryTimeSeconds": 0.975,
          "zeroCrossingTimesSeconds": [
            0.995635,
            2.36088,
            3.723717,
            5.086333,
            6.448899,
            7.811488,
            9.174049,
            10.53664,
            11.899198,
            13.261791,
            14.624348,
            15.986944,
            17.349499,
            18.711486,
            20.083333,
            21.816667
          ],
          "signedPeakOffsetsDeg": [
            10,
            -0.948618,
            0.102861,
            -0.011275,
            0.001237,
            -0.000136,
            0.000015,
            -0.000002,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "measuredPeriodSeconds": 2.753106,
          "measuredDampingRatio": 0.579018,
          "behavior": "oscillatory",
          "checks": {
            "finite": true,
            "amplitudeBounded": true,
            "recovered": true,
            "finalOffsetSettled": true,
            "periodPlausible": true,
            "dampingPlausible": true
          },
          "passed": true
        },
        "checks": {
          "equilibriumFound": true,
          "equilibriumTorqueBounded": true,
          "allSamplesRestoring": true,
          "symmetryBounded": true,
          "positiveStiffness": true,
          "finiteLinearizedDynamics": true,
          "decayPassed": true
        },
        "passed": true
      },
      "pitch": {
        "axis": "pitch",
        "equilibriumAngleDeg": -0.534919,
        "equilibriumTorqueNm": 0,
        "equilibriumOriginYM": -0.504109,
        "equilibriumDraftM": 0.297539,
        "rightingSamples": [
          {
            "offsetDeg": -10,
            "absoluteAngleDeg": -10.534919,
            "axisTorqueNm": 11386.968882,
            "rightingMomentNm": 11386.968882,
            "normalizedRightingMoment": 0.193459,
            "restoring": true,
            "originYM": -0.52578,
            "deepestImmersedDraftM": 0.52342
          },
          {
            "offsetDeg": -5,
            "absoluteAngleDeg": -5.534919,
            "axisTorqueNm": 6793.349006,
            "rightingMomentNm": 6793.349006,
            "normalizedRightingMoment": 0.115415,
            "restoring": true,
            "originYM": -0.523906,
            "deepestImmersedDraftM": 0.374349
          },
          {
            "offsetDeg": -2,
            "absoluteAngleDeg": -2.534919,
            "axisTorqueNm": 2739.109455,
            "rightingMomentNm": 2739.109455,
            "normalizedRightingMoment": 0.046536,
            "restoring": true,
            "originYM": -0.511863,
            "deepestImmersedDraftM": 0.322059
          },
          {
            "offsetDeg": 2,
            "absoluteAngleDeg": 1.465081,
            "axisTorqueNm": -2728.160123,
            "rightingMomentNm": 2728.160123,
            "normalizedRightingMoment": 0.04635,
            "restoring": true,
            "originYM": -0.496628,
            "deepestImmersedDraftM": 0.314264
          },
          {
            "offsetDeg": 5,
            "absoluteAngleDeg": 4.465081,
            "axisTorqueNm": -6701.450073,
            "rightingMomentNm": 6701.450073,
            "normalizedRightingMoment": 0.113854,
            "restoring": true,
            "originYM": -0.485606,
            "deepestImmersedDraftM": 0.340439
          },
          {
            "offsetDeg": 10,
            "absoluteAngleDeg": 9.465081,
            "axisTorqueNm": -10323.98693,
            "rightingMomentNm": 10323.98693,
            "normalizedRightingMoment": 0.175399,
            "restoring": true,
            "originYM": -0.44733,
            "deepestImmersedDraftM": 0.446954
          }
        ],
        "linearizedStiffnessNmPerRad": 77816.185665,
        "effectiveInertiaKgM2": 4080,
        "effectiveLinearDampingNmPerRadPerSecond": 7892,
        "undampedNaturalPeriodSeconds": 1.438716,
        "dampingRatio": 0.221458,
        "dampedNaturalPeriodSeconds": 1.475349,
        "behavior": "underdamped",
        "maximumSymmetryErrorRatio": 0.013528,
        "symmetryLimitRatio": 0.35,
        "decay": {
          "initialOffsetDeg": 10,
          "durationSeconds": 36,
          "timeStepSeconds": 0.008333,
          "finalOffsetDeg": 0,
          "maximumAbsoluteOffsetDeg": 10,
          "recoveryTimeSeconds": 1.4,
          "zeroCrossingTimesSeconds": [
            0.470407,
            1.207425,
            1.944071,
            2.679079,
            3.414351,
            4.149324,
            4.884393,
            5.619401,
            6.354424,
            7.089427,
            7.82443,
            8.559441,
            9.294458,
            10.029468,
            10.764472,
            11.499472,
            12.234484,
            12.9695,
            13.70451,
            14.439514,
            15.174514,
            15.909527,
            16.644542,
            17.379552,
            18.114556,
            18.849555,
            19.584569,
            20.319584,
            21.054594,
            21.789598,
            22.524597,
            23.259611,
            23.994627,
            24.729635,
            25.464642,
            26.199636,
            26.934665,
            27.669656,
            28.404699,
            29.13959,
            29.874827,
            30.609188,
            31.345497,
            32.083333,
            32.816667,
            33.55,
            34.291667,
            35.008333,
            35.841667
          ],
          "signedPeakOffsetsDeg": [
            10,
            -4.31887,
            2.07287,
            -1.004764,
            0.490735,
            -0.240134,
            0.117728,
            -0.057739,
            0.028327,
            -0.013898,
            0.00682,
            -0.003347,
            0.001643,
            -0.000806,
            0.000396,
            -0.000194,
            0.000095,
            -0.000047,
            0.000023,
            -0.000011,
            0.000006,
            -0.000003,
            0.000001,
            -0.000001,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "measuredPeriodSeconds": 1.471748,
          "measuredDampingRatio": 0.223263,
          "behavior": "oscillatory",
          "checks": {
            "finite": true,
            "amplitudeBounded": true,
            "recovered": true,
            "finalOffsetSettled": true,
            "periodPlausible": true,
            "dampingPlausible": true
          },
          "passed": true
        },
        "checks": {
          "equilibriumFound": true,
          "equilibriumTorqueBounded": true,
          "allSamplesRestoring": true,
          "symmetryBounded": true,
          "positiveStiffness": true,
          "finiteLinearizedDynamics": true,
          "decayPassed": true
        },
        "passed": true
      },
      "checks": {
        "finite": true,
        "displacementBalanced": true,
        "configuredDraftPlausible": true,
        "rollStable": true,
        "pitchStable": true
      },
      "passed": true
    },
    {
      "version": 1,
      "vessel": "speedboat",
      "evidenceClass": "engineering-derived",
      "methodology": {
        "description": "Static heave equilibrium and sectional righting moments derived from the simulator hydrostatic cells; linearized periods and damping ratios use the configured inertia, added inertia, angular drag, and body damping.",
        "waterSurface": "flat",
        "waterHeightM": -1,
        "rightingOffsetsDeg": [
          -10,
          -5,
          -2,
          2,
          5,
          10
        ],
        "limitations": [
          "This is simulator-model evidence, not a manufacturer hydrostatic table or full-scale inclining experiment.",
          "The equilibrium solver holds yaw fixed and evaluates one angular axis at a time.",
          "Roll uses a strict port-starboard symmetry check; pitch permits bounded fore-aft asymmetry from the configured hull stations.",
          "The time-domain decay probe uses the same nonlinear sectional righting moment with configured linear, quadratic, and body angular damping; it is still simulator-model evidence rather than a full-scale decay trial."
        ]
      },
      "upright": {
        "axis": "roll",
        "angleDeg": 0,
        "originYM": -0.874108,
        "displacedVolumeM3": 0.780488,
        "displacementBalanceErrorRatio": 0,
        "deepestImmersedDraftM": 0.274108,
        "centerOfMassWorld": {
          "x": 0,
          "y": -1.094108,
          "z": 0.35
        },
        "centerOfBuoyancyWorld": {
          "x": 0,
          "y": -1.109481,
          "z": 0.252725
        },
        "hydrostaticTorqueNm": {
          "x": 763.412538,
          "y": 0,
          "z": 0
        },
        "axisTorqueNm": 0
      },
      "roll": {
        "axis": "roll",
        "equilibriumAngleDeg": 0,
        "equilibriumTorqueNm": 0,
        "equilibriumOriginYM": -0.874108,
        "equilibriumDraftM": 0.274108,
        "rightingSamples": [
          {
            "offsetDeg": -10,
            "absoluteAngleDeg": -10,
            "axisTorqueNm": 758.922466,
            "rightingMomentNm": 758.922466,
            "normalizedRightingMoment": 0.080586,
            "restoring": true,
            "originYM": -0.878099,
            "deepestImmersedDraftM": 0.376211
          },
          {
            "offsetDeg": -5,
            "absoluteAngleDeg": -5,
            "axisTorqueNm": 387.798064,
            "rightingMomentNm": 387.798064,
            "normalizedRightingMoment": 0.041178,
            "restoring": true,
            "originYM": -0.875112,
            "deepestImmersedDraftM": 0.325883
          },
          {
            "offsetDeg": -2,
            "absoluteAngleDeg": -2,
            "axisTorqueNm": 156.054911,
            "rightingMomentNm": 156.054911,
            "normalizedRightingMoment": 0.016571,
            "restoring": true,
            "originYM": -0.874269,
            "deepestImmersedDraftM": 0.294965
          },
          {
            "offsetDeg": 2,
            "absoluteAngleDeg": 2,
            "axisTorqueNm": -156.054911,
            "rightingMomentNm": 156.054911,
            "normalizedRightingMoment": 0.016571,
            "restoring": true,
            "originYM": -0.874269,
            "deepestImmersedDraftM": 0.294965
          },
          {
            "offsetDeg": 5,
            "absoluteAngleDeg": 5,
            "axisTorqueNm": -387.798064,
            "rightingMomentNm": 387.798064,
            "normalizedRightingMoment": 0.041178,
            "restoring": true,
            "originYM": -0.875112,
            "deepestImmersedDraftM": 0.325883
          },
          {
            "offsetDeg": 10,
            "absoluteAngleDeg": 10,
            "axisTorqueNm": -758.922466,
            "rightingMomentNm": 758.922466,
            "normalizedRightingMoment": 0.080586,
            "restoring": true,
            "originYM": -0.878099,
            "deepestImmersedDraftM": 0.376211
          }
        ],
        "linearizedStiffnessNmPerRad": 4457.241172,
        "effectiveInertiaKgM2": 2010,
        "effectiveLinearDampingNmPerRadPerSecond": 5668,
        "undampedNaturalPeriodSeconds": 4.219343,
        "dampingRatio": 0.946823,
        "dampedNaturalPeriodSeconds": 13.113519,
        "behavior": "underdamped",
        "maximumSymmetryErrorRatio": 0,
        "symmetryLimitRatio": 0.05,
        "decay": {
          "initialOffsetDeg": 10,
          "durationSeconds": 36,
          "timeStepSeconds": 0.008333,
          "finalOffsetDeg": 0,
          "maximumAbsoluteOffsetDeg": 10,
          "recoveryTimeSeconds": 1.958333,
          "zeroCrossingTimesSeconds": [
            6.182981,
            12.799819,
            19.416651,
            25.816667
          ],
          "signedPeakOffsetsDeg": [
            10,
            -0.000671,
            0,
            0
          ],
          "measuredPeriodSeconds": 13.125259,
          "measuredDampingRatio": null,
          "behavior": "oscillatory",
          "checks": {
            "finite": true,
            "amplitudeBounded": true,
            "recovered": true,
            "finalOffsetSettled": true,
            "periodPlausible": true,
            "dampingPlausible": true
          },
          "passed": true
        },
        "checks": {
          "equilibriumFound": true,
          "equilibriumTorqueBounded": true,
          "allSamplesRestoring": true,
          "symmetryBounded": true,
          "positiveStiffness": true,
          "finiteLinearizedDynamics": true,
          "decayPassed": true
        },
        "passed": true
      },
      "pitch": {
        "axis": "pitch",
        "equilibriumAngleDeg": 1.356684,
        "equilibriumTorqueNm": 0,
        "equilibriumOriginYM": -0.869646,
        "equilibriumDraftM": 0.280898,
        "rightingSamples": [
          {
            "offsetDeg": -10,
            "absoluteAngleDeg": -8.643316,
            "axisTorqueNm": 5271.141233,
            "rightingMomentNm": 5271.141233,
            "normalizedRightingMoment": 0.209892,
            "restoring": true,
            "originYM": -0.890547,
            "deepestImmersedDraftM": 0.329265
          },
          {
            "offsetDeg": -5,
            "absoluteAngleDeg": -3.643316,
            "axisTorqueNm": 2845.949993,
            "rightingMomentNm": 2845.949993,
            "normalizedRightingMoment": 0.113323,
            "restoring": true,
            "originYM": -0.884811,
            "deepestImmersedDraftM": 0.269689
          },
          {
            "offsetDeg": -2,
            "absoluteAngleDeg": -0.643316,
            "axisTorqueNm": 1129.941954,
            "rightingMomentNm": 1129.941954,
            "normalizedRightingMoment": 0.044993,
            "restoring": true,
            "originYM": -0.876123,
            "deepestImmersedDraftM": 0.270709
          },
          {
            "offsetDeg": 2,
            "absoluteAngleDeg": 3.356684,
            "axisTorqueNm": -1033.070613,
            "rightingMomentNm": 1033.070613,
            "normalizedRightingMoment": 0.041136,
            "restoring": true,
            "originYM": -0.861654,
            "deepestImmersedDraftM": 0.289072
          },
          {
            "offsetDeg": 5,
            "absoluteAngleDeg": 6.356684,
            "axisTorqueNm": -2024.586143,
            "rightingMomentNm": 2024.586143,
            "normalizedRightingMoment": 0.080617,
            "restoring": true,
            "originYM": -0.841676,
            "deepestImmersedDraftM": 0.299265
          },
          {
            "offsetDeg": 10,
            "absoluteAngleDeg": 11.356684,
            "axisTorqueNm": -3576.052259,
            "rightingMomentNm": 3576.052259,
            "normalizedRightingMoment": 0.142395,
            "restoring": true,
            "originYM": -0.807936,
            "deepestImmersedDraftM": 0.385621
          }
        ],
        "linearizedStiffnessNmPerRad": 29444.49462,
        "effectiveInertiaKgM2": 1940,
        "effectiveLinearDampingNmPerRadPerSecond": 4075,
        "undampedNaturalPeriodSeconds": 1.612793,
        "dampingRatio": 0.269584,
        "dampedNaturalPeriodSeconds": 1.6748,
        "behavior": "underdamped",
        "maximumSymmetryErrorRatio": 0.288608,
        "symmetryLimitRatio": 0.35,
        "decay": {
          "initialOffsetDeg": 10,
          "durationSeconds": 36,
          "timeStepSeconds": 0.008333,
          "finalOffsetDeg": 0,
          "maximumAbsoluteOffsetDeg": 10,
          "recoveryTimeSeconds": 1.5,
          "zeroCrossingTimesSeconds": [
            0.600402,
            1.396762,
            2.208773,
            3.010477,
            3.815384,
            4.618728,
            5.422688,
            6.22636,
            7.030158,
            7.833885,
            8.637659,
            9.441394,
            10.245165,
            11.048908,
            11.85267,
            12.65642,
            13.460174,
            14.263931,
            15.067676,
            15.87144,
            16.675178,
            17.478948,
            18.282688,
            19.086454,
            19.890201,
            20.693959,
            21.497713,
            22.301462,
            23.105223,
            23.908964,
            24.712735,
            25.516455,
            26.320252,
            27.123951,
            27.927767,
            28.731129,
            29.541667,
            30.341667,
            31.158333,
            31.941667,
            32.866667,
            33.816667,
            34.383333,
            34.766667,
            35.275,
            35.508333
          ],
          "signedPeakOffsetsDeg": [
            10,
            -3.116662,
            1.338249,
            -0.563645,
            0.242161,
            -0.103665,
            0.044517,
            -0.019106,
            0.008204,
            -0.003523,
            0.001513,
            -0.000649,
            0.000279,
            -0.00012,
            0.000051,
            -0.000022,
            0.000009,
            -0.000004,
            0.000002,
            -0.000001,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "measuredPeriodSeconds": 1.563322,
          "measuredDampingRatio": 0.264201,
          "behavior": "oscillatory",
          "checks": {
            "finite": true,
            "amplitudeBounded": true,
            "recovered": true,
            "finalOffsetSettled": true,
            "periodPlausible": true,
            "dampingPlausible": true
          },
          "passed": true
        },
        "checks": {
          "equilibriumFound": true,
          "equilibriumTorqueBounded": true,
          "allSamplesRestoring": true,
          "symmetryBounded": true,
          "positiveStiffness": true,
          "finiteLinearizedDynamics": true,
          "decayPassed": true
        },
        "passed": true
      },
      "checks": {
        "finite": true,
        "displacementBalanced": true,
        "configuredDraftPlausible": true,
        "rollStable": true,
        "pitchStable": true
      },
      "passed": true
    }
  ],
  "summary": {
    "total": 2,
    "passed": 2,
    "failed": 0
  }
}
Hydrostatic stability validation passed.

> 3d-boat-physics-simulator@1.0.0 lint
> eslint . --max-warnings=0


/home/runner/work/3D-Boat-Physics-Simulator/3D-Boat-Physics-Simulator/store/useScenarioHistory.ts
  12:18  error  An interface declaring no members is equivalent to its supertype  @typescript-eslint/no-empty-object-type

✖ 1 problem (1 error, 0 warnings)

```
