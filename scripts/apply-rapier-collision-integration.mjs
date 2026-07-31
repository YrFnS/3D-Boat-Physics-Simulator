import fs from 'node:fs/promises';

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Unable to find ${label}.`);
  }
  return source.replace(search, replacement);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Unable to find ${label}.`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

const boatPath = 'components/Boat.tsx';
let boat = await fs.readFile(boatPath, 'utf8');

boat = replaceOnce(
  boat,
  "import { getTerrainHeight } from '@/lib/terrain';\n",
  '',
  'legacy terrain import',
);
boat = replaceOnce(
  boat,
  "import { DistributedHullForces } from '@/sim/vessels/DistributedHullForces';\n",
  "import { DistributedHullForces } from '@/sim/vessels/DistributedHullForces';\nimport { RapierCollisionWorld } from '@/sim/collision/RapierCollisionWorld';\n",
  'Rapier collision import anchor',
);
boat = replaceOnce(
  boat,
  '  const distributedHullForces = useRef(new DistributedHullForces());\n',
  `  const distributedHullForces = useRef(new DistributedHullForces());
  const rapierCollisionWorld = useRef<RapierCollisionWorld | null>(null);
  const collisionTestEnabled = useRef(false);
  const lastTerrainImpactTime = useRef(Number.NEGATIVE_INFINITY);
  const lastObstacleImpactTime = useRef(Number.NEGATIVE_INFINITY);
`,
  'collision refs anchor',
);
boat = replaceOnce(
  boat,
  '      terrainNormal: new Vector3(),\n',
  '',
  'legacy terrain scratch vector',
);
boat = replaceOnce(
  boat,
  '    const halfW = vessel.halfWidthM;\n',
  '',
  'legacy obstacle half-width local',
);

const collisionLifecycle = `  useEffect(() => {
    let cancelled = false;
    collisionTestEnabled.current =
      new URLSearchParams(window.location.search).get('collisionTest') === '1';

    sharedPhysics.collisionReady = 0;
    sharedPhysics.collisionSequence = 0;
    sharedPhysics.terrainCollisionSequence = 0;
    sharedPhysics.obstacleCollisionSequence = 0;
    sharedPhysics.debugProbeCollisionSequence = 0;
    sharedPhysics.collisionMaxImpactSpeed = 0;
    sharedPhysics.collisionMaxImpulse = 0;
    sharedPhysics.collisionMaxPenetration = 0;

    void RapierCollisionWorld.create()
      .then((collisionWorld) => {
        if (cancelled) {
          collisionWorld.dispose();
          return;
        }
        rapierCollisionWorld.current = collisionWorld;
        sharedPhysics.collisionReady = 1;
      })
      .catch((error: unknown) => {
        console.error('Failed to initialize Rapier collision world.', error);
      });

    return () => {
      cancelled = true;
      rapierCollisionWorld.current?.dispose();
      rapierCollisionWorld.current = null;
      sharedPhysics.collisionReady = 0;
    };
  }, []);

`;
boat = replaceOnce(
  boat,
  '  // Apparent wind flag rotation\n',
  `${collisionLifecycle}  // Apparent wind flag rotation\n`,
  'collision lifecycle insertion point',
);

boat = replaceSection(
  boat,
  '    // --- PHASE 4: OBSTACLE COLLISION DETECTION ---',
  '    // Extreme physics safety clamp to prevent space launches (Flying Boat Bug fix)',
  `    // Rapier resolves compound-hull obstacle and terrain contacts after
    // the custom marine forces have been integrated for this fixed step.

`,
  'legacy circular obstacle collision block',
);

const integrationAnchor = `    // --- Integrate the accumulated six-degree-of-freedom forces ---
    body.integrate(dt);

`;
const collisionIntegration = `${integrationAnchor}    const collisionSummary = rapierCollisionWorld.current?.step(
      body,
      vessel,
      dt,
      sharedPhysics.obstacles,
      collisionTestEnabled.current && Math.abs(thrustRaw) > 0.1,
    );

    if (collisionSummary) {
      sharedPhysics.collisionReady = 1;
      sharedPhysics.collisionMaxImpactSpeed = Math.max(
        sharedPhysics.collisionMaxImpactSpeed,
        collisionSummary.maxTerrainImpactSpeedMps,
        collisionSummary.maxObstacleImpactSpeedMps,
      );
      sharedPhysics.collisionMaxImpulse = Math.max(
        sharedPhysics.collisionMaxImpulse,
        collisionSummary.maxTerrainImpulseNs,
        collisionSummary.maxObstacleImpulseNs,
      );
      sharedPhysics.collisionMaxPenetration = Math.max(
        sharedPhysics.collisionMaxPenetration,
        collisionSummary.maxPenetrationM,
      );

      if (collisionSummary.contactCount > 0) {
        sharedPhysics.collisionSequence += collisionSummary.contactCount;
      }
      if (collisionSummary.terrainContactCount > 0) {
        sharedPhysics.terrainCollisionSequence +=
          collisionSummary.terrainContactCount;
      }
      if (collisionSummary.obstacleContactCount > 0) {
        sharedPhysics.obstacleCollisionSequence +=
          collisionSummary.obstacleContactCount;
      }
      if (collisionSummary.debugProbeContactCount > 0) {
        sharedPhysics.debugProbeCollisionSequence +=
          collisionSummary.debugProbeContactCount;
      }

      const terrainImpact = collisionSummary.maxTerrainImpactSpeedMps;
      if (
        terrainImpact > 1.8 &&
        time - lastTerrainImpactTime.current >= 0.25
      ) {
        lastTerrainImpactTime.current = time;
        const normalizedImpulse =
          collisionSummary.maxTerrainImpulseNs / vessel.massKg;
        const severity = terrainImpact - 1.8;
        const damage = Math.min(
          24,
          severity * 3.6 + normalizedImpulse * 0.42,
        );
        hullHealth.current = Math.max(0, hullHealth.current - damage);
        if (severity > 2.5) {
          engineHealth.current = Math.max(
            0,
            engineHealth.current - damage * 0.22,
          );
          rudderHealth.current = Math.max(
            0,
            rudderHealth.current - damage * 0.32,
          );
        }
        audio.playImpact(terrainImpact, 'terrain');
      }

      const obstacleImpact = collisionSummary.maxObstacleImpactSpeedMps;
      if (
        obstacleImpact > 0.65 &&
        time - lastObstacleImpactTime.current >= 0.2
      ) {
        lastObstacleImpactTime.current = time;
        const normalizedImpulse =
          collisionSummary.maxObstacleImpulseNs / vessel.massKg;
        const severity = obstacleImpact - 0.65;
        const damage = Math.min(
          9,
          severity * 1.45 + normalizedImpulse * 0.16,
        );
        hullHealth.current = Math.max(0, hullHealth.current - damage);
        if (severity > 2.5) {
          rudderHealth.current = Math.max(
            0,
            rudderHealth.current - damage * 0.25,
          );
        }
        audio.playImpact(obstacleImpact, 'obstacle');
      }
    }

`;
boat = replaceOnce(
  boat,
  integrationAnchor,
  collisionIntegration,
  'post-integration collision anchor',
);

boat = replaceSection(
  boat,
  '    // --- PHASE 3: TERRAIN COLLISION & BEACHING ---',
  '    // --- PHASE 5: TORNADO / WATERSPOUT PHYSICS ---',
  '',
  'legacy procedural terrain collision block',
);

await fs.writeFile(boatPath, boat);

const smokePath = 'scripts/visual-smoke.mjs';
let smoke = await fs.readFile(smokePath, 'utf8');

smoke = replaceOnce(
  smoke,
  "    name: 'desktop',\n",
  "    name: 'desktop',\n    path: '/?debug=1',\n",
  'desktop smoke scenario',
);
smoke = replaceOnce(
  smoke,
  "    name: 'mobile',\n",
  "    name: 'mobile',\n    path: '/?debug=1',\n",
  'mobile smoke scenario',
);
smoke = replaceOnce(
  smoke,
  `  },
];

const browser`,
  `  },
  {
    name: 'collision',
    path: '/?debug=1&collisionTest=1',
    context: {
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
  },
];

const browser`,
  'collision smoke scenario insertion point',
);
smoke = replaceOnce(
  smoke,
  `      snapshot.submergedRatio,
      snapshot.droppedTime,
    ])`,
  `      snapshot.submergedRatio,
      snapshot.droppedTime,
      snapshot.hullHealth,
      snapshot.collision.sequence,
      snapshot.collision.terrainSequence,
      snapshot.collision.obstacleSequence,
      snapshot.collision.debugProbeSequence,
      snapshot.collision.maxImpactSpeed,
      snapshot.collision.maxImpulse,
      snapshot.collision.maxPenetration,
    ])`,
  'finite collision snapshot fields',
);
smoke = replaceOnce(
  smoke,
  `    snapshot.submergedRatio <= 1 &&
    snapshot.droppedTime >= 0
`,
  `    snapshot.submergedRatio <= 1 &&
    snapshot.droppedTime >= 0 &&
    snapshot.hullHealth >= 0 &&
    snapshot.hullHealth <= 100 &&
    snapshot.collision.ready &&
    snapshot.collision.sequence >= 0 &&
    snapshot.collision.terrainSequence >= 0 &&
    snapshot.collision.obstacleSequence >= 0 &&
    snapshot.collision.debugProbeSequence >= 0 &&
    snapshot.collision.maxImpactSpeed >= 0 &&
    snapshot.collision.maxImpactSpeed < 80 &&
    snapshot.collision.maxImpulse >= 0 &&
    snapshot.collision.maxPenetration >= 0 &&
    snapshot.collision.maxPenetration < 5
`,
  'bounded collision snapshot checks',
);
smoke = replaceOnce(
  smoke,
  `      submergedRatio: readNumber('simSubmergedRatio'),
      droppedTime: readNumber('simDroppedTime'),
`,
  `      submergedRatio: readNumber('simSubmergedRatio'),
      droppedTime: readNumber('simDroppedTime'),
      hullHealth: readNumber('simHullHealth'),
      collision: {
        ready: dataset.simCollisionReady === '1',
        sequence: readNumber('simCollisionSequence'),
        terrainSequence: readNumber('simTerrainCollisionSequence'),
        obstacleSequence: readNumber('simObstacleCollisionSequence'),
        debugProbeSequence: readNumber('simDebugProbeCollisionSequence'),
        maxImpactSpeed: readNumber('simCollisionMaxImpactSpeed'),
        maxImpulse: readNumber('simCollisionMaxImpulse'),
        maxPenetration: readNumber('simCollisionMaxPenetration'),
      },
`,
  'collision snapshot reader',
);
smoke = replaceOnce(
  smoke,
  `async function exerciseVesselControls(page, scenarioName) {
  if (scenarioName === 'desktop') {
`,
  `async function exerciseVesselControls(page, scenarioName) {
  if (scenarioName === 'collision') {
    await page.keyboard.down('w');
    try {
      await page.waitForTimeout(2_400);
    } finally {
      await page.keyboard.up('w');
    }
    return;
  }

  if (scenarioName === 'desktop') {
`,
  'collision control exercise',
);
smoke = replaceOnce(
  smoke,
  '    const response = await page.goto(`${baseUrl}/?debug=1`, {\n',
  '    const response = await page.goto(`${baseUrl}${scenario.path}`, {\n',
  'scenario-specific URL',
);
smoke = replaceOnce(
  smoke,
  `    await page.waitForFunction(
      () => document.documentElement.dataset.simReady === '1',
      { timeout: 60_000 },
    );
    await page.waitForTimeout(4_000);
`,
  `    await page.waitForFunction(
      () => document.documentElement.dataset.simReady === '1',
      { timeout: 60_000 },
    );
    await page.waitForFunction(
      () => document.documentElement.dataset.simCollisionReady === '1',
      { timeout: 60_000 },
    );
    await page.waitForTimeout(4_000);
`,
  'Rapier readiness wait',
);
smoke = replaceOnce(
  smoke,
  `    const physicsChecks = {
      beforeBounded: physicsSnapshotIsBounded(physicsBefore),
      afterBounded: physicsSnapshotIsBounded(physicsAfter),
      // Require at least 27 completed 60 Hz steps. Comparing against exactly
      // 0.5 seconds is brittle because the accumulated value can be one ULP low.
      simulationAdvanced: simulationAdvance >= 0.45,
      vesselResponded:
        displacement > 0.05 || physicsAfter.linearSpeed > 0.05,
    };

`,
  `    const physicsChecks = {
      beforeBounded: physicsSnapshotIsBounded(physicsBefore),
      afterBounded: physicsSnapshotIsBounded(physicsAfter),
      // Require at least 27 completed 60 Hz steps. Comparing against exactly
      // 0.5 seconds is brittle because the accumulated value can be one ULP low.
      simulationAdvanced: simulationAdvance >= 0.45,
      vesselResponded:
        displacement > 0.05 || physicsAfter.linearSpeed > 0.05,
    };
    const collisionChecks =
      scenario.name === 'collision'
        ? {
            RapierReady: physicsBefore.collision.ready,
            debugProbeContacted:
              physicsAfter.collision.debugProbeSequence >
              physicsBefore.collision.debugProbeSequence,
            obstacleContactRecorded:
              physicsAfter.collision.obstacleSequence >
              physicsBefore.collision.obstacleSequence,
            contactImpulseRecorded: physicsAfter.collision.maxImpulse > 0,
            penetrationRecorded: physicsAfter.collision.maxPenetration > 0,
          }
        : null;

`,
  'collision assertions',
);
smoke = replaceOnce(
  smoke,
  `    const physicsChecksPass = Object.values(physicsChecks).every(Boolean);
    const scenarioFailed =
`,
  `    const physicsChecksPass = Object.values(physicsChecks).every(Boolean);
    const collisionChecksPass =
      collisionChecks === null || Object.values(collisionChecks).every(Boolean);
    const scenarioFailed =
`,
  'collision assertion aggregation',
);
smoke = replaceOnce(
  smoke,
  `      !responsiveChecksPass ||
      !physicsChecksPass;
`,
  `      !responsiveChecksPass ||
      !physicsChecksPass ||
      !collisionChecksPass;
`,
  'collision scenario failure condition',
);
smoke = replaceOnce(
  smoke,
  `        checks: physicsChecks,
      },
`,
  `        checks: physicsChecks,
        collisionChecks,
      },
`,
  'collision report output',
);

await fs.writeFile(smokePath, smoke);
console.log('Applied Rapier collision integration and collision smoke coverage.');
