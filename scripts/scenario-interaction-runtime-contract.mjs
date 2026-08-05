import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  ScenarioInteractionRuntime,
  resolveNavigationGateHalfWidthM,
} from '../sim/scenarios/ScenarioInteractionRuntime.ts';

function sample(overrides = {}) {
  return {
    runId: 1,
    vesselGeneration: 1,
    boatX: 0,
    boatZ: 0,
    speedKnots: 0,
    deltaSeconds: 0.1,
    prerequisiteMet: true,
    alreadyCompleted: false,
    ...overrides,
  };
}

const gate = {
  id: 'test-gate',
  label: 'Test gate',
  type: 'navigation-gate',
  x: 0,
  z: 0,
  radiusM: 20,
  headingDeg: 0,
  interaction: {
    gateHalfWidthM: 8,
    gateApproachDistanceM: 16,
  },
};
assert.equal(resolveNavigationGateHalfWidthM(gate), 8);

const standingRuntime = new ScenarioInteractionRuntime();
const standing = standingRuntime.evaluate(gate, sample());
assert.equal(
  standing.completed,
  false,
  'Standing inside a gate radius must not complete it.',
);

const forwardRuntime = new ScenarioInteractionRuntime();
assert.equal(
  forwardRuntime.evaluate(gate, sample({ boatZ: 12 })).completed,
  false,
);
assert.equal(
  forwardRuntime.evaluate(gate, sample({ boatZ: 1 })).completed,
  false,
);
const forwardCrossing = forwardRuntime.evaluate(
  gate,
  sample({ boatZ: -1 }),
);
assert.equal(forwardCrossing.completed, true);
assert.equal(forwardCrossing.status, 'completed');

const reverseRuntime = new ScenarioInteractionRuntime();
reverseRuntime.evaluate(gate, sample({ boatZ: -8 }));
const reverseCrossing = reverseRuntime.evaluate(
  gate,
  sample({ boatZ: 8 }),
);
assert.equal(
  reverseCrossing.completed,
  false,
  'Crossing a gate backward must not complete it.',
);

const outsideRuntime = new ScenarioInteractionRuntime();
outsideRuntime.evaluate(gate, sample({ boatX: 14, boatZ: 12 }));
const outsideCrossing = outsideRuntime.evaluate(
  gate,
  sample({ boatX: 14, boatZ: -2 }),
);
assert.equal(
  outsideCrossing.completed,
  false,
  'Crossing outside the visible posts must not complete a gate.',
);

const recoveryRuntime = new ScenarioInteractionRuntime();
recoveryRuntime.evaluate(gate, sample({ boatZ: 5 }));
const recoveryTeleport = recoveryRuntime.evaluate(
  gate,
  sample({ vesselGeneration: 2, boatZ: -5 }),
);
assert.equal(
  recoveryTeleport.completed,
  false,
  'A vessel recovery teleport must reanchor gate state.',
);

const relay = {
  id: 'relay',
  label: 'Emergency relay',
  type: 'storm-beacon',
  x: 0,
  z: 0,
  radiusM: 10,
  headingDeg: 0,
  interaction: { holdSeconds: 2, maxSpeedKnots: 3 },
};
const relayRuntime = new ScenarioInteractionRuntime();
const relayHalf = relayRuntime.evaluate(
  relay,
  sample({ deltaSeconds: 1 }),
);
assert.equal(relayHalf.status, 'holding');
assert.equal(relayHalf.progress, 0.5);
const relayTooFast = relayRuntime.evaluate(
  relay,
  sample({ speedKnots: 4, deltaSeconds: 0.5 }),
);
assert.equal(relayTooFast.status, 'too-fast');
assert.equal(relayTooFast.progress, 0);
relayRuntime.evaluate(relay, sample({ deltaSeconds: 1 }));
const relayComplete = relayRuntime.evaluate(
  relay,
  sample({ deltaSeconds: 1 }),
);
assert.equal(relayComplete.completed, true);

const deliveryRuntime = new ScenarioInteractionRuntime();
const blockedDelivery = deliveryRuntime.evaluate(
  {
    id: 'delivery',
    label: 'Delivery',
    type: 'cargo-delivery',
    x: 0,
    z: 0,
    radiusM: 8,
    headingDeg: 0,
  },
  sample({ prerequisiteMet: false }),
);
assert.equal(blockedDelivery.status, 'blocked');

const pickupRuntime = new ScenarioInteractionRuntime();
const pickupTooFast = pickupRuntime.evaluate(
  {
    id: 'pickup',
    label: 'Cargo',
    type: 'cargo-pickup',
    x: 0,
    z: 0,
    radiusM: 8,
    headingDeg: 0,
  },
  sample({ speedKnots: 3.2 }),
);
assert.equal(pickupTooFast.status, 'too-fast');

const rescueRuntime = new ScenarioInteractionRuntime();
const rescueHolding = rescueRuntime.evaluate(
  {
    id: 'rescue',
    label: 'Survivor pod',
    type: 'rescue-pickup',
    x: 0,
    z: 0,
    radiusM: 8,
    headingDeg: 0,
  },
  sample({ speedKnots: 3, deltaSeconds: 1 }),
);
assert.equal(rescueHolding.status, 'holding');
assert.ok(rescueHolding.requiredHoldSeconds > 2);

const directorSource = await fs.readFile(
  new URL('../components/ScenarioDirector.tsx', import.meta.url),
  'utf8',
);
const routeSource = await fs.readFile(
  new URL('../sim/scenarios/ScenarioRoute.ts', import.meta.url),
  'utf8',
);
const entitySource = await fs.readFile(
  new URL('../components/ScenarioEntities.tsx', import.meta.url),
  'utf8',
);
const navigationSource = await fs.readFile(
  new URL('../components/NavigationHUD.tsx', import.meta.url),
  'utf8',
);
const persistenceSource = await fs.readFile(
  new URL('../components/ExperiencePersistence.tsx', import.meta.url),
  'utf8',
);

assert.match(
  directorSource,
  /interactionRuntime\.current\.evaluate\(/,
  'ScenarioDirector must delegate entity completion to the typed runtime.',
);
assert.doesNotMatch(
  directorSource,
  /Math\.hypot\(entity\.x - boatX, entity\.z - boatZ\) <= entity\.radiusM/,
  'ScenarioDirector must not retain the generic entity radius completion rule.',
);
assert.match(
  routeSource,
  /headingDeg: resolveInboundRouteHeading/,
  'Resolved entities must carry an inbound route heading.',
);
assert.match(
  entitySource,
  /headingDegreesToYawRadians\(entity\.headingDeg\)/,
  'Visible gate posts must rotate to the same crossing plane used by gameplay.',
);
assert.match(
  entitySource,
  /active && entity\.type !== 'navigation-gate'/,
  'Navigation gates must remain fixed instead of floating away from the crossing plane.',
);
assert.match(
  navigationSource,
  /scenarioInteractionProgress/,
  'Navigation UI must expose typed interaction progress.',
);
assert.match(
  persistenceSource,
  /simScenarioInteractionStatus/,
  'Browser validation must observe typed interaction state.',
);

console.log('Scenario interaction runtime contract passed.');
