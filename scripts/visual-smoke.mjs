import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';
const outputDirectory = path.resolve('artifacts/visual-smoke');
const expectedTitle = '3D Boat Physics Simulator';
await fs.mkdir(outputDirectory, { recursive: true });

const scenarios = [
  {
    name: 'desktop',
    path: '/?debug=1',
    context: {
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
  },
  {
    name: 'mobile',
    path: '/?debug=1',
    context: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    },
  },
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

const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--use-angle=swiftshader',
  ],
});

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  scenarios: [],
};

let hasFatalError = false;

function allFinite(values) {
  return values.every(Number.isFinite);
}

function physicsSnapshotIsBounded(snapshot) {
  return (
    snapshot.ready &&
    allFinite([
      snapshot.simulationTime,
      snapshot.position.x,
      snapshot.position.y,
      snapshot.position.z,
      snapshot.linearSpeed,
      snapshot.angularSpeed,
      snapshot.quaternionNorm,
      snapshot.directionLength,
      snapshot.submergedRatio,
      snapshot.hydrostatics.displacedVolumeM3,
      snapshot.hydrostatics.floodingRatio,
      snapshot.hydrostatics.floodedVolumeM3,
      snapshot.hydrostatics.physicalMassKg,
      snapshot.hydrostatics.displacementBalanceErrorRatio,
      snapshot.hydrostatics.centerOfBuoyancy.x,
      snapshot.hydrostatics.centerOfBuoyancy.y,
      snapshot.hydrostatics.centerOfBuoyancy.z,
      snapshot.hydrostatics.averageWaterVelocity.x,
      snapshot.hydrostatics.averageWaterVelocity.y,
      snapshot.hydrostatics.averageWaterVelocity.z,
      snapshot.hydrostatics.maximumSlamSeverity,
      snapshot.droppedTime,
      snapshot.hullHealth,
      snapshot.collision.sequence,
      snapshot.collision.terrainSequence,
      snapshot.collision.obstacleSequence,
      snapshot.collision.debugProbeSequence,
      snapshot.collision.maxImpactSpeed,
      snapshot.collision.maxImpulse,
      snapshot.collision.maxPenetration,
    ]) &&
    Math.abs(snapshot.position.x) < 1_000 &&
    snapshot.position.y > -50 &&
    snapshot.position.y < 100 &&
    Math.abs(snapshot.position.z) < 1_000 &&
    snapshot.linearSpeed >= 0 &&
    snapshot.linearSpeed < 150 &&
    snapshot.angularSpeed >= 0 &&
    snapshot.angularSpeed < 13 &&
    snapshot.quaternionNorm > 0.97 &&
    snapshot.quaternionNorm < 1.03 &&
    snapshot.directionLength > 0.9 &&
    snapshot.directionLength < 1.1 &&
    snapshot.submergedRatio >= 0 &&
    snapshot.submergedRatio <= 1 &&
    snapshot.hydrostatics.displacedVolumeM3 >= 0 &&
    snapshot.hydrostatics.displacedVolumeM3 < 20 &&
    snapshot.hydrostatics.floodingRatio >= 0 &&
    snapshot.hydrostatics.floodingRatio <= 1 &&
    snapshot.hydrostatics.floodedVolumeM3 >= 0 &&
    snapshot.hydrostatics.floodedVolumeM3 < 10 &&
    snapshot.hydrostatics.physicalMassKg >= 700 &&
    snapshot.hydrostatics.physicalMassKg < 5_000 &&
    snapshot.hydrostatics.displacementBalanceErrorRatio >= 0 &&
    snapshot.hydrostatics.displacementBalanceErrorRatio < 2 &&
    snapshot.hydrostatics.maximumSlamSeverity >= 0 &&
    snapshot.hydrostatics.maximumSlamSeverity <= 8.01 &&
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
  );
}

async function readPhysicsSnapshot(page) {
  return page.evaluate(() => {
    const dataset = document.documentElement.dataset;
    const readNumber = (key) => Number(dataset[key]);

    return {
      ready: dataset.simReady === '1',
      simulationTime: readNumber('simTime'),
      position: {
        x: readNumber('simBoatX'),
        y: readNumber('simBoatY'),
        z: readNumber('simBoatZ'),
      },
      linearSpeed: readNumber('simLinearSpeed'),
      angularSpeed: readNumber('simAngularSpeed'),
      quaternionNorm: readNumber('simQuaternionNorm'),
      directionLength: readNumber('simDirectionLength'),
      submergedRatio: readNumber('simSubmergedRatio'),
      hydrostatics: {
        displacedVolumeM3: readNumber('simDisplacedVolumeM3'),
        floodingRatio: readNumber('simFloodingRatio'),
        floodedVolumeM3: readNumber('simFloodedVolumeM3'),
        physicalMassKg: readNumber('simPhysicalMassKg'),
        displacementBalanceErrorRatio: readNumber(
          'simDisplacementBalanceErrorRatio',
        ),
        centerOfBuoyancy: {
          x: readNumber('simCenterOfBuoyancyX'),
          y: readNumber('simCenterOfBuoyancyY'),
          z: readNumber('simCenterOfBuoyancyZ'),
        },
        averageWaterVelocity: {
          x: readNumber('simAverageWaterVelocityX'),
          y: readNumber('simAverageWaterVelocityY'),
          z: readNumber('simAverageWaterVelocityZ'),
        },
        maximumSlamSeverity: readNumber('simMaximumSlamSeverity'),
      },
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
    };
  });
}

async function waitForSimulationAdvance(page, initialTime, requiredAdvance) {
  await page.waitForFunction(
    ({ startTime, minimumAdvance }) => {
      const currentTime = Number(document.documentElement.dataset.simTime);
      return (
        Number.isFinite(currentTime) &&
        currentTime - startTime >= minimumAdvance
      );
    },
    { startTime: initialTime, minimumAdvance: requiredAdvance },
    { timeout: 60_000 },
  );
}

async function holdPointer(page, locator, durationMs) {
  await locator.waitFor({ state: 'visible' });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Unable to resolve mobile control bounds.');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await page.waitForTimeout(durationMs);
  } finally {
    await page.mouse.up();
  }
}

async function exerciseVesselControls(page, scenarioName) {
  if (scenarioName === 'collision') {
    await page.keyboard.down('w');
    try {
      // Wait for a real closing-speed impulse instead of assuming the
      // software renderer advances enough physics in a fixed wall-clock delay.
      await page.waitForFunction(
        () => {
          const dataset = document.documentElement.dataset;
          return (
            Number(dataset.simDebugProbeCollisionSequence) > 0 &&
            Number(dataset.simCollisionMaxImpulse) > 0
          );
        },
        { timeout: 60_000 },
      );
    } finally {
      await page.keyboard.up('w');
    }
    return;
  }

  if (scenarioName === 'desktop') {
    await page.keyboard.down('w');
    await page.keyboard.down('a');
    await page.waitForTimeout(1_800);
    await page.keyboard.up('a');
    await page.keyboard.up('w');
    return;
  }

  // Use a real held pointer so setPointerCapture sees an active pointer. A
  // synthetic dispatchEvent does not create one in Chromium and can produce a
  // false NotFoundError even though the application handler is correct.
  await holdPointer(
    page,
    page.locator('[aria-label="Throttle forward"]'),
    1_300,
  );
  await holdPointer(
    page,
    page.locator('[aria-label="Steer left"]'),
    700,
  );
}

try {
  for (const scenario of scenarios) {
    const context = await browser.newContext(scenario.context);
    const page = await context.newPage();
    const consoleEntries = [];
    const pageErrors = [];
    const failedRequests = [];

    page.on('console', (message) => {
      consoleEntries.push({
        type: message.type(),
        text: message.text(),
      });
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.stack ?? error.message);
    });
    page.on('requestfailed', (request) => {
      failedRequests.push({
        url: request.url(),
        error: request.failure()?.errorText ?? 'unknown request failure',
      });
    });

    const response = await page.goto(`${baseUrl}${scenario.path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await page.waitForSelector('canvas', { timeout: 60_000 });
    await page.waitForSelector('select[aria-label="Rendering quality"]', {
      timeout: 60_000,
    });
    await page.selectOption(
      'select[aria-label="Rendering quality"]',
      'low',
    );
    await page.waitForFunction(
      () => document.documentElement.dataset.simReady === '1',
      { timeout: 60_000 },
    );
    await page.waitForFunction(
      () => document.documentElement.dataset.simCollisionReady === '1',
      { timeout: 60_000 },
    );
    await page.waitForTimeout(4_000);

    const physicsBefore = await readPhysicsSnapshot(page);
    await exerciseVesselControls(page, scenario.name);
    await waitForSimulationAdvance(
      page,
      physicsBefore.simulationTime,
      scenario.name === 'collision' ? 0.75 : 0.45,
    );
    await page.waitForTimeout(250);
    const physicsAfter = await readPhysicsSnapshot(page);

    const displacement = Math.hypot(
      physicsAfter.position.x - physicsBefore.position.x,
      physicsAfter.position.y - physicsBefore.position.y,
      physicsAfter.position.z - physicsBefore.position.z,
    );
    const simulationAdvance =
      physicsAfter.simulationTime - physicsBefore.simulationTime;
    const physicsChecks = {
      beforeBounded: physicsSnapshotIsBounded(physicsBefore),
      afterBounded: physicsSnapshotIsBounded(physicsAfter),
      // Require at least 27 completed 60 Hz steps, but wait on simulation time
      // rather than assuming a loaded software renderer matches wall-clock time.
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
            residualPenetrationBounded:
              physicsAfter.collision.maxPenetration >= 0 &&
              physicsAfter.collision.maxPenetration < 0.25,
          }
        : null;

    const runtime = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const bodyRect = document.body.getBoundingClientRect();
      const horizontalOverflow =
        document.documentElement.scrollWidth > window.innerWidth + 1;
      const verticalOverflow =
        document.documentElement.scrollHeight > window.innerHeight + 1;
      const qualitySelector = document.querySelector(
        'select[aria-label="Rendering quality"]',
      );
      const visibleText = document.body.innerText;

      return {
        title: document.title,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        body: { width: bodyRect.width, height: bodyRect.height },
        canvas: canvas
          ? {
              width: canvas.width,
              height: canvas.height,
              clientWidth: canvas.clientWidth,
              clientHeight: canvas.clientHeight,
            }
          : null,
        horizontalOverflow,
        verticalOverflow,
        qualityMode:
          qualitySelector instanceof HTMLSelectElement
            ? qualitySelector.value
            : null,
        hasFpsReadout: /\bFPS\b/i.test(visibleText),
        hasBenchmarkControls:
          /\bBenchmark\b/i.test(visibleText) &&
          /\bCalm\b/i.test(visibleText) &&
          /\bStorm\b/i.test(visibleText),
        hasTouchControls:
          document.querySelector('[aria-label="Throttle forward"]') !== null &&
          document.querySelector('[aria-label="Throttle reverse"]') !== null &&
          document.querySelector('[aria-label="Steer left"]') !== null &&
          document.querySelector('[aria-label="Steer right"]') !== null,
      };
    });

    const screenshotPath = path.join(outputDirectory, `${scenario.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const severeConsoleEntries = consoleEntries.filter((entry) =>
      ['error', 'assert'].includes(entry.type),
    );
    const canvasIsValid =
      runtime.canvas &&
      runtime.canvas.width > 0 &&
      runtime.canvas.height > 0 &&
      runtime.canvas.clientWidth === runtime.viewport.width &&
      runtime.canvas.clientHeight === runtime.viewport.height;
    const responsiveChecksPass =
      scenario.name === 'mobile'
        ? runtime.hasTouchControls && !runtime.hasBenchmarkControls
        : runtime.hasBenchmarkControls;
    const physicsChecksPass = Object.values(physicsChecks).every(Boolean);
    const collisionChecksPass =
      collisionChecks === null || Object.values(collisionChecks).every(Boolean);
    const scenarioFailed =
      !response?.ok() ||
      runtime.title !== expectedTitle ||
      pageErrors.length > 0 ||
      severeConsoleEntries.length > 0 ||
      failedRequests.length > 0 ||
      !canvasIsValid ||
      runtime.horizontalOverflow ||
      runtime.verticalOverflow ||
      !runtime.qualityMode ||
      !runtime.hasFpsReadout ||
      !responsiveChecksPass ||
      !physicsChecksPass ||
      !collisionChecksPass;

    hasFatalError ||= scenarioFailed;
    report.scenarios.push({
      name: scenario.name,
      responseStatus: response?.status() ?? null,
      runtime,
      physics: {
        before: physicsBefore,
        after: physicsAfter,
        displacement,
        simulationAdvance,
        checks: physicsChecks,
        collisionChecks,
      },
      consoleEntries,
      pageErrors,
      failedRequests,
      screenshot: `${scenario.name}.png`,
      passed: !scenarioFailed,
    });

    await context.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(
  path.join(outputDirectory, 'report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify(report, null, 2));
if (hasFatalError) process.exitCode = 1;
