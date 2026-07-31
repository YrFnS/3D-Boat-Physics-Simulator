import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

const baseUrl = process.env.RELEASE_BASE_URL ?? 'http://127.0.0.1:3000';
const baseOrigin = new URL(baseUrl).origin;
const outputDirectory = path.resolve('artifacts/release-validation');
await fs.mkdir(outputDirectory, { recursive: true });

const seededSettings = {
  onboardingCompleted: true,
  controlHintsEnabled: false,
  reducedMotion: true,
  highContrast: false,
  interfaceScale: 'default',
  cameraFov: 60,
  cameraSmoothing: 0.62,
};
const seededExperience = {
  activeBoat: 'trawler',
  activeScenario: 'open-water',
  cameraMode: 'chase',
  hudVisible: true,
};

const engineDefinitions = [
  {
    name: 'chromium',
    browserType: chromium,
    launchOptions: {
      headless: true,
      args: [
        '--enable-webgl',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--use-angle=swiftshader',
      ],
    },
  },
  {
    name: 'firefox',
    browserType: firefox,
    launchOptions: {
      headless: true,
      firefoxUserPrefs: {
        'webgl.disabled': false,
        'webgl.force-enabled': true,
        'gfx.webrender.all': true,
      },
    },
  },
  {
    name: 'webkit',
    browserType: webkit,
    launchOptions: {
      headless: true,
    },
  },
];

const calibrationProbes = [
  { vessel: 'trawler', scenario: 'rest', queryKey: 'calibration' },
  { vessel: 'speedboat', scenario: 'turn', queryKey: 'calibration' },
];

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  engines: [],
  mobile: null,
  recovery: null,
  corruptStorage: null,
  crossEngineCalibration: [],
  summary: null,
};

function isHttpUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function createRecorder(page) {
  const consoleEntries = [];
  const pageErrors = [];
  const failedRequests = [];
  const externalRequests = [];

  page.on('console', (message) => {
    consoleEntries.push({ type: message.type(), text: message.text() });
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
  page.on('request', (request) => {
    const requestUrl = request.url();
    if (!isHttpUrl(requestUrl)) return;

    const url = new URL(requestUrl);
    if (url.origin !== baseOrigin) {
      externalRequests.push({
        url: requestUrl,
        method: request.method(),
        resourceType: request.resourceType(),
      });
    }
  });

  return {
    consoleEntries,
    pageErrors,
    failedRequests,
    externalRequests,
    severeConsoleEntries() {
      return consoleEntries.filter((entry) =>
        ['error', 'assert'].includes(entry.type),
      );
    },
  };
}

async function seedProductStorage(context) {
  await context.addInitScript(
    ({ settings, experience }) => {
      try {
        if (!['http:', 'https:'].includes(window.location.protocol)) return;
        window.localStorage.setItem(
          'boat-simulator-settings-v1',
          JSON.stringify(settings),
        );
        window.localStorage.setItem(
          'boat-simulator-experience-v1',
          JSON.stringify(experience),
        );
      } catch {
        // The initial opaque page can reject local storage before navigation.
      }
    },
    { settings: seededSettings, experience: seededExperience },
  );
}

async function waitForDataset(page, key, expected) {
  await page.waitForFunction(
    ({ datasetKey, expectedValue }) =>
      document.documentElement.dataset[datasetKey] === expectedValue,
    { datasetKey: key, expectedValue: expected },
    { timeout: 60_000 },
  );
}

async function waitForCanvasReady(page) {
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('canvas');
      return (
        canvas instanceof HTMLCanvasElement &&
        canvas.clientWidth === window.innerWidth &&
        canvas.clientHeight === window.innerHeight &&
        canvas.width > 0 &&
        canvas.height > 0
      );
    },
    undefined,
    { timeout: 60_000 },
  );
}

async function readRuntime(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const bodyRect = document.body.getBoundingClientRect();
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
      horizontalOverflow:
        document.documentElement.scrollWidth > window.innerWidth + 1,
      verticalOverflow:
        document.documentElement.scrollHeight > window.innerHeight + 1,
    };
  });
}

function runtimeIsValid(runtime) {
  return (
    runtime.title === '3D Boat Physics Simulator' &&
    runtime.canvas !== null &&
    runtime.canvas.width > 0 &&
    runtime.canvas.height > 0 &&
    runtime.canvas.clientWidth === runtime.viewport.width &&
    runtime.canvas.clientHeight === runtime.viewport.height &&
    !runtime.horizontalOverflow &&
    !runtime.verticalOverflow
  );
}

async function auditAccessibility(page) {
  return page.evaluate(() => {
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const accessibleName = (element) => {
      const ariaLabel = element.getAttribute('aria-label')?.trim();
      if (ariaLabel) return ariaLabel;

      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const label = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' ');
        if (label) return label;
      }

      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) {
        const label = Array.from(element.labels ?? [])
          .map((item) => item.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' ');
        if (label) return label;
      }

      const title = element.getAttribute('title')?.trim();
      if (title) return title;
      return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    };

    const interactiveSelector = [
      'button',
      'a[href]',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
    ].join(',');

    const unnamedInteractive = Array.from(
      document.querySelectorAll(interactiveSelector),
    )
      .filter((element) => isVisible(element))
      .filter((element) => accessibleName(element).length === 0)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role'),
        className: element.getAttribute('class'),
      }));

    const unnamedDialogs = Array.from(
      document.querySelectorAll('[role="dialog"]'),
    )
      .filter((element) => isVisible(element))
      .filter((element) => accessibleName(element).length === 0)
      .map((element) => ({
        id: element.id,
        className: element.getAttribute('class'),
      }));

    const ids = Array.from(document.querySelectorAll('[id]'))
      .map((element) => element.id)
      .filter(Boolean);
    const duplicateIds = ids.filter(
      (id, index) => ids.indexOf(id) !== index,
    );

    return {
      unnamedInteractive,
      unnamedDialogs,
      duplicateIds: [...new Set(duplicateIds)],
      passed:
        unnamedInteractive.length === 0 &&
        unnamedDialogs.length === 0 &&
        duplicateIds.length === 0,
    };
  });
}

async function readPhysicsSnapshot(page) {
  return page.evaluate(() => {
    const dataset = document.documentElement.dataset;
    const number = (key) => Number(dataset[key]);
    return {
      ready: dataset.simReady === '1',
      simulationTime: number('simTime'),
      position: {
        x: number('simBoatX'),
        y: number('simBoatY'),
        z: number('simBoatZ'),
      },
      linearSpeed: number('simLinearSpeed'),
      angularSpeed: number('simAngularSpeed'),
      quaternionNorm: number('simQuaternionNorm'),
      directionLength: number('simDirectionLength'),
      submergedRatio: number('simSubmergedRatio'),
      droppedTime: number('simDroppedTime'),
      hullHealth: number('simHullHealth'),
      render: {
        fps: number('simFps'),
        frameTimeMs: number('simFrameTimeMs'),
        drawCalls: number('simDrawCalls'),
        triangles: number('simTriangles'),
        quality: dataset.simRenderQuality ?? '',
      },
      collision: {
        ready: dataset.simCollisionReady === '1',
        sequence: number('simCollisionSequence'),
        terrainSequence: number('simTerrainCollisionSequence'),
        obstacleSequence: number('simObstacleCollisionSequence'),
        maximumImpactSpeed: number('simCollisionMaxImpactSpeed'),
        maximumImpulse: number('simCollisionMaxImpulse'),
        maximumPenetration: number('simCollisionMaxPenetration'),
      },
    };
  });
}

function allFinite(values) {
  return values.every(Number.isFinite);
}

function physicsSnapshotIsBounded(snapshot) {
  return (
    snapshot.ready &&
    snapshot.collision.ready &&
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
      snapshot.droppedTime,
      snapshot.hullHealth,
      snapshot.render.fps,
      snapshot.render.frameTimeMs,
      snapshot.render.drawCalls,
      snapshot.render.triangles,
      snapshot.collision.sequence,
      snapshot.collision.terrainSequence,
      snapshot.collision.obstacleSequence,
      snapshot.collision.maximumImpactSpeed,
      snapshot.collision.maximumImpulse,
      snapshot.collision.maximumPenetration,
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
    snapshot.droppedTime >= 0 &&
    snapshot.droppedTime < 10 &&
    snapshot.hullHealth >= 0 &&
    snapshot.hullHealth <= 100 &&
    snapshot.render.fps > 0 &&
    snapshot.render.frameTimeMs > 0 &&
    snapshot.render.drawCalls > 0 &&
    snapshot.render.drawCalls < 350 &&
    snapshot.render.triangles > 0 &&
    snapshot.render.triangles < 750_000 &&
    snapshot.collision.sequence >= 0 &&
    snapshot.collision.maximumImpactSpeed >= 0 &&
    snapshot.collision.maximumImpactSpeed < 80 &&
    snapshot.collision.maximumImpulse >= 0 &&
    snapshot.collision.maximumPenetration >= 0 &&
    snapshot.collision.maximumPenetration < 5
  );
}

async function waitForSimulationAdvance(page, startTime, minimumAdvance) {
  await page.waitForFunction(
    ({ initialTime, advance }) => {
      const currentTime = Number(document.documentElement.dataset.simTime);
      return Number.isFinite(currentTime) && currentTime - initialTime >= advance;
    },
    { initialTime: startTime, advance: minimumAdvance },
    { timeout: 60_000 },
  );
}

async function runProductFlow(browser, engineName) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    colorScheme: 'dark',
  });
  await seedProductStorage(context);
  const page = await context.newPage();
  const recorder = createRecorder(page);
  const checks = {};
  let responseStatus = null;
  let runtime = null;
  let flowError = null;
  let menuAccessibility = null;
  let pauseAccessibility = null;
  let settingsAccessibility = null;

  try {
    const response = await page.goto(baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    responseStatus = response?.status() ?? null;
    await page.waitForSelector('canvas', { timeout: 60_000 });
    await waitForCanvasReady(page);
    await waitForDataset(page, 'simSessionPhase', 'menu');
    await page.getByRole('heading', { name: 'Choose your passage.' }).waitFor();

    menuAccessibility = await auditAccessibility(page);
    checks.menuAccessibility = menuAccessibility.passed;
    checks.launchBriefing = true;

    await page.getByRole('button', { name: /Begin passage/i }).click();
    await waitForDataset(page, 'simSessionPhase', 'running');
    await waitForDataset(page, 'simScenarioRunStatus', 'active');
    await page.locator('[aria-label="Marine navigation chart"]').waitFor();
    checks.scenarioLaunch = true;

    await page.keyboard.press('c');
    await waitForDataset(page, 'simCameraMode', 'helm');
    checks.cameraCycle = true;

    const beforeReset = Number(
      await page.evaluate(
        () => document.documentElement.dataset.simResetVesselTrigger ?? '0',
      ),
    );
    await page.keyboard.press('Home');
    await page.waitForFunction(
      (previous) =>
        Number(document.documentElement.dataset.simResetVesselTrigger ?? '0') >
        previous,
      beforeReset,
      { timeout: 60_000 },
    );
    checks.safeRecovery = true;

    await page.keyboard.press('Escape');
    await waitForDataset(page, 'simSessionPhase', 'paused');
    await page.getByRole('button', { name: /Resume passage/i }).waitFor();
    pauseAccessibility = await auditAccessibility(page);
    checks.pauseAccessibility = pauseAccessibility.passed;

    await page.keyboard.press('Escape');
    await waitForDataset(page, 'simSessionPhase', 'running');
    checks.pauseResume = true;

    await page.keyboard.press('o');
    await waitForDataset(page, 'simSettingsOpen', '1');
    await waitForDataset(page, 'simSessionPhase', 'paused');
    await page.getByRole('dialog', { name: 'Settings' }).waitFor();
    settingsAccessibility = await auditAccessibility(page);
    checks.settingsAccessibility = settingsAccessibility.passed;

    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await waitForDataset(page, 'simSettingsOpen', '0');
    await waitForDataset(page, 'simSessionPhase', 'running');
    checks.settingsPauseResume = true;

    await page.keyboard.press('h');
    await waitForDataset(page, 'simHudVisible', '0');
    await page.keyboard.press('h');
    await waitForDataset(page, 'simHudVisible', '1');
    checks.hudToggle = true;

    runtime = await readRuntime(page);
    checks.runtime = runtimeIsValid(runtime);
    await page.screenshot({
      path: path.join(outputDirectory, `${engineName}-product.png`),
      fullPage: false,
    });
  } catch (error) {
    flowError = error instanceof Error ? error.stack ?? error.message : String(error);
  }

  const passed =
    flowError === null &&
    responseStatus === 200 &&
    Object.values(checks).every(Boolean) &&
    recorder.severeConsoleEntries().length === 0 &&
    recorder.pageErrors.length === 0 &&
    recorder.failedRequests.length === 0 &&
    recorder.externalRequests.length === 0;

  const result = {
    responseStatus,
    runtime,
    checks,
    accessibility: {
      menu: menuAccessibility,
      pause: pauseAccessibility,
      settings: settingsAccessibility,
    },
    consoleEntries: recorder.consoleEntries,
    pageErrors: recorder.pageErrors,
    failedRequests: recorder.failedRequests,
    externalRequests: recorder.externalRequests,
    flowError,
    screenshot: `${engineName}-product.png`,
    passed,
  };
  await context.close();
  return result;
}

async function runPhysicsFlow(browser, engineName) {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 720 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });
  const page = await context.newPage();
  const recorder = createRecorder(page);
  let responseStatus = null;
  let before = null;
  let after = null;
  let displacement = null;
  let flowError = null;

  try {
    const response = await page.goto(`${baseUrl}/?debug=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    responseStatus = response?.status() ?? null;
    await page.waitForSelector('canvas', { timeout: 60_000 });
    await waitForCanvasReady(page);
    await page.waitForFunction(
      () => document.documentElement.dataset.simReady === '1',
      undefined,
      { timeout: 60_000 },
    );
    await page.waitForFunction(
      () => document.documentElement.dataset.simCollisionReady === '1',
      undefined,
      { timeout: 60_000 },
    );

    const qualitySelector = page.locator(
      'select[aria-label="Rendering quality"]',
    );
    if ((await qualitySelector.count()) > 0) {
      await qualitySelector.selectOption('low');
      await waitForDataset(page, 'simRenderQuality', 'low');
    }

    before = await readPhysicsSnapshot(page);
    await page.keyboard.down('w');
    await page.keyboard.down('a');
    try {
      await page.waitForTimeout(1_400);
      await waitForSimulationAdvance(page, before.simulationTime, 0.45);
    } finally {
      await page.keyboard.up('a');
      await page.keyboard.up('w');
    }
    await page.waitForTimeout(600);
    after = await readPhysicsSnapshot(page);
    displacement = Math.hypot(
      after.position.x - before.position.x,
      after.position.y - before.position.y,
      after.position.z - before.position.z,
    );

    await page.screenshot({
      path: path.join(outputDirectory, `${engineName}-physics.png`),
      fullPage: false,
    });
  } catch (error) {
    flowError = error instanceof Error ? error.stack ?? error.message : String(error);
  }

  const passed =
    flowError === null &&
    responseStatus === 200 &&
    before !== null &&
    after !== null &&
    physicsSnapshotIsBounded(before) &&
    physicsSnapshotIsBounded(after) &&
    after.simulationTime - before.simulationTime >= 0.45 &&
    (displacement > 0.05 || after.linearSpeed > 0.05) &&
    recorder.severeConsoleEntries().length === 0 &&
    recorder.pageErrors.length === 0 &&
    recorder.failedRequests.length === 0 &&
    recorder.externalRequests.length === 0;

  const result = {
    responseStatus,
    before,
    after,
    displacement,
    consoleEntries: recorder.consoleEntries,
    pageErrors: recorder.pageErrors,
    failedRequests: recorder.failedRequests,
    externalRequests: recorder.externalRequests,
    flowError,
    screenshot: `${engineName}-physics.png`,
    passed,
  };
  await context.close();
  return result;
}

async function runCalibrationProbe(browser, engineName, probe) {
  const context = await browser.newContext({
    viewport: { width: 960, height: 640 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });
  const page = await context.newPage();
  const recorder = createRecorder(page);
  let responseStatus = null;
  let calibration = null;
  let flowError = null;

  try {
    const url = new URL(baseUrl);
    url.searchParams.set('debug', '1');
    url.searchParams.set(probe.queryKey, probe.scenario);
    url.searchParams.set('vessel', probe.vessel);

    const response = await page.goto(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    responseStatus = response?.status() ?? null;
    await page.waitForSelector('canvas', { timeout: 60_000 });
    await page.waitForFunction(
      () => document.documentElement.dataset.simCalibrationReady === '1',
      undefined,
      { timeout: 90_000 },
    );

    calibration = await page.evaluate(() => {
      const dataset = document.documentElement.dataset;
      let result = null;
      try {
        result = dataset.simCalibrationResult
          ? JSON.parse(dataset.simCalibrationResult)
          : null;
      } catch {
        result = null;
      }
      return {
        ready: dataset.simCalibrationReady === '1',
        passed: dataset.simCalibrationPassed === '1',
        progress: Number(dataset.simCalibrationProgress),
        scenario: dataset.simCalibrationScenario ?? '',
        vessel: dataset.simCalibrationVessel ?? '',
        result,
      };
    });

    await page.screenshot({
      path: path.join(
        outputDirectory,
        `${engineName}-${probe.vessel}-${probe.scenario}.png`,
      ),
      fullPage: false,
    });
  } catch (error) {
    flowError = error instanceof Error ? error.stack ?? error.message : String(error);
  }

  const passed =
    flowError === null &&
    responseStatus === 200 &&
    calibration?.ready === true &&
    calibration?.passed === true &&
    calibration?.progress >= 1 &&
    calibration?.scenario === probe.scenario &&
    calibration?.vessel === probe.vessel &&
    calibration?.result?.passed === true &&
    Object.values(calibration?.result?.checks ?? {}).every(Boolean) &&
    recorder.severeConsoleEntries().length === 0 &&
    recorder.pageErrors.length === 0 &&
    recorder.failedRequests.length === 0 &&
    recorder.externalRequests.length === 0;

  const result = {
    probe,
    responseStatus,
    calibration,
    consoleEntries: recorder.consoleEntries,
    pageErrors: recorder.pageErrors,
    failedRequests: recorder.failedRequests,
    externalRequests: recorder.externalRequests,
    flowError,
    screenshot: `${engineName}-${probe.vessel}-${probe.scenario}.png`,
    passed,
  };
  await context.close();
  return result;
}

function compareNumericMetrics(baseline, candidate) {
  const differences = [];
  const baselineMetrics = baseline?.calibration?.result?.metrics ?? {};
  const candidateMetrics = candidate?.calibration?.result?.metrics ?? {};
  const metricNames = new Set([
    ...Object.keys(baselineMetrics),
    ...Object.keys(candidateMetrics),
  ]);

  for (const metricName of metricNames) {
    const baselineValue = baselineMetrics[metricName];
    const candidateValue = candidateMetrics[metricName];
    if (
      typeof baselineValue !== 'number' ||
      !Number.isFinite(baselineValue) ||
      typeof candidateValue !== 'number' ||
      !Number.isFinite(candidateValue)
    ) {
      continue;
    }

    const absoluteDifference = Math.abs(candidateValue - baselineValue);
    const tolerance = Math.max(0.002, Math.abs(baselineValue) * 0.005);
    differences.push({
      metric: metricName,
      baseline: baselineValue,
      candidate: candidateValue,
      absoluteDifference,
      tolerance,
      passed: absoluteDifference <= tolerance,
    });
  }

  return {
    differences,
    passed:
      differences.length > 0 && differences.every((difference) => difference.passed),
  };
}

async function holdPointer(page, locator, durationMs) {
  await locator.waitFor({ state: 'visible' });
  const box = await locator.boundingBox();
  if (!box) throw new Error('Unable to resolve touch control bounds.');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await page.waitForTimeout(durationMs);
  } finally {
    await page.mouse.up();
  }
}

async function runMobileFlow() {
  const browser = await chromium.launch(engineDefinitions[0].launchOptions);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
  });
  await seedProductStorage(context);
  const page = await context.newPage();
  const recorder = createRecorder(page);
  const checks = {};
  let responseStatus = null;
  let runtime = null;
  let accessibility = null;
  let flowError = null;

  try {
    const response = await page.goto(baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    responseStatus = response?.status() ?? null;
    await page.waitForSelector('canvas', { timeout: 60_000 });
    await waitForCanvasReady(page);
    await page.getByRole('button', { name: /Begin passage/i }).click();
    await waitForDataset(page, 'simSessionPhase', 'running');
    await page.locator('[aria-label="Marine navigation chart"]').waitFor();

    const touchButtons = [
      'Throttle forward',
      'Throttle reverse',
      'Steer left',
      'Steer right',
    ];
    checks.touchControls = (
      await Promise.all(
        touchButtons.map(async (name) =>
          (await page.getByRole('button', { name }).count()) > 0,
        ),
      )
    ).every(Boolean);

    await holdPointer(
      page,
      page.getByRole('button', { name: 'Throttle forward' }),
      900,
    );
    await holdPointer(
      page,
      page.getByRole('button', { name: 'Steer left' }),
      450,
    );
    checks.heldTouchInput = true;

    await page.getByRole('button', { name: 'Pause simulation' }).click();
    await waitForDataset(page, 'simSessionPhase', 'paused');
    await page.getByRole('button', { name: /Resume passage/i }).click();
    await waitForDataset(page, 'simSessionPhase', 'running');
    checks.pauseResume = true;

    accessibility = await auditAccessibility(page);
    checks.accessibility = accessibility.passed;
    runtime = await readRuntime(page);
    checks.runtime = runtimeIsValid(runtime);

    await page.screenshot({
      path: path.join(outputDirectory, 'chromium-mobile.png'),
      fullPage: false,
    });
  } catch (error) {
    flowError = error instanceof Error ? error.stack ?? error.message : String(error);
  }

  const passed =
    flowError === null &&
    responseStatus === 200 &&
    Object.values(checks).every(Boolean) &&
    recorder.severeConsoleEntries().length === 0 &&
    recorder.pageErrors.length === 0 &&
    recorder.failedRequests.length === 0 &&
    recorder.externalRequests.length === 0;

  const result = {
    responseStatus,
    runtime,
    checks,
    accessibility,
    consoleEntries: recorder.consoleEntries,
    pageErrors: recorder.pageErrors,
    failedRequests: recorder.failedRequests,
    externalRequests: recorder.externalRequests,
    flowError,
    screenshot: 'chromium-mobile.png',
    passed,
  };

  await context.close();
  await browser.close();
  return result;
}

async function runRecoveryFlows() {
  const browser = await chromium.launch(engineDefinitions[0].launchOptions);
  const results = {
    unsupported: null,
    contextLoss: null,
    passed: false,
  };

  {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 720 },
    });
    await context.addInitScript(() => {
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
        if (type === 'webgl' || type === 'webgl2') return null;
        return originalGetContext.call(this, type, ...args);
      };
    });
    const page = await context.newPage();
    const recorder = createRecorder(page);
    let flowError = null;
    let accessibility = null;
    try {
      await page.goto(baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      await page
        .getByRole('heading', { name: 'This browser could not start WebGL.' })
        .waitFor();
      accessibility = await auditAccessibility(page);
      await page.screenshot({
        path: path.join(outputDirectory, 'webgl-unsupported.png'),
        fullPage: false,
      });
    } catch (error) {
      flowError = error instanceof Error ? error.stack ?? error.message : String(error);
    }
    results.unsupported = {
      accessibility,
      consoleEntries: recorder.consoleEntries,
      pageErrors: recorder.pageErrors,
      failedRequests: recorder.failedRequests,
      externalRequests: recorder.externalRequests,
      flowError,
      screenshot: 'webgl-unsupported.png',
      passed:
        flowError === null &&
        accessibility?.passed === true &&
        recorder.severeConsoleEntries().length === 0 &&
        recorder.pageErrors.length === 0 &&
        recorder.failedRequests.length === 0 &&
        recorder.externalRequests.length === 0,
    };
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 720 },
    });
    await seedProductStorage(context);
    const page = await context.newPage();
    const recorder = createRecorder(page);
    let flowError = null;
    let accessibility = null;
    try {
      await page.goto(baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      await page.waitForSelector('canvas', { timeout: 60_000 });
      await waitForCanvasReady(page);
      await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        canvas?.dispatchEvent(
          new Event('webglcontextlost', { bubbles: false, cancelable: true }),
        );
      });
      await page
        .getByRole('heading', {
          name: 'The simulator lost access to the graphics device.',
        })
        .waitFor();
      accessibility = await auditAccessibility(page);
      await page.screenshot({
        path: path.join(outputDirectory, 'webgl-context-lost.png'),
        fullPage: false,
      });
    } catch (error) {
      flowError = error instanceof Error ? error.stack ?? error.message : String(error);
    }
    results.contextLoss = {
      accessibility,
      consoleEntries: recorder.consoleEntries,
      pageErrors: recorder.pageErrors,
      failedRequests: recorder.failedRequests,
      externalRequests: recorder.externalRequests,
      flowError,
      screenshot: 'webgl-context-lost.png',
      passed:
        flowError === null &&
        accessibility?.passed === true &&
        recorder.severeConsoleEntries().length === 0 &&
        recorder.pageErrors.length === 0 &&
        recorder.failedRequests.length === 0 &&
        recorder.externalRequests.length === 0,
    };
    await context.close();
  }

  results.passed =
    results.unsupported?.passed === true && results.contextLoss?.passed === true;
  await browser.close();
  return results;
}

async function runCorruptStorageFlow() {
  const browser = await chromium.launch(engineDefinitions[0].launchOptions);
  const context = await browser.newContext({
    viewport: { width: 1100, height: 720 },
  });
  await context.addInitScript(() => {
    try {
      if (!['http:', 'https:'].includes(window.location.protocol)) return;
      localStorage.setItem('boat-simulator-settings-v1', '{invalid-json');
      localStorage.setItem('boat-simulator-experience-v1', 'not-json');
      localStorage.setItem('boat-simulator-gameplay-v1', '[broken');
    } catch {
      // Ignore the initial opaque document.
    }
  });
  const page = await context.newPage();
  const recorder = createRecorder(page);
  let responseStatus = null;
  let runtime = null;
  let accessibility = null;
  let flowError = null;

  try {
    const response = await page.goto(baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    responseStatus = response?.status() ?? null;
    await page.waitForSelector('canvas', { timeout: 60_000 });
    await waitForCanvasReady(page);
    await page.getByRole('heading', { name: 'Choose your passage.' }).waitFor();
    runtime = await readRuntime(page);
    accessibility = await auditAccessibility(page);
    await page.screenshot({
      path: path.join(outputDirectory, 'corrupt-storage-recovery.png'),
      fullPage: false,
    });
  } catch (error) {
    flowError = error instanceof Error ? error.stack ?? error.message : String(error);
  }

  const result = {
    responseStatus,
    runtime,
    accessibility,
    consoleEntries: recorder.consoleEntries,
    pageErrors: recorder.pageErrors,
    failedRequests: recorder.failedRequests,
    externalRequests: recorder.externalRequests,
    flowError,
    screenshot: 'corrupt-storage-recovery.png',
    passed:
      flowError === null &&
      responseStatus === 200 &&
      runtime !== null &&
      runtimeIsValid(runtime) &&
      accessibility?.passed === true &&
      recorder.severeConsoleEntries().length === 0 &&
      recorder.pageErrors.length === 0 &&
      recorder.failedRequests.length === 0 &&
      recorder.externalRequests.length === 0,
  };

  await context.close();
  await browser.close();
  return result;
}

let failed = false;

for (const definition of engineDefinitions) {
  const browser = await definition.browserType.launch(definition.launchOptions);
  const engineReport = {
    name: definition.name,
    product: null,
    physics: null,
    calibration: [],
    passed: false,
  };

  try {
    engineReport.product = await runProductFlow(browser, definition.name);
    engineReport.physics = await runPhysicsFlow(browser, definition.name);
    for (const probe of calibrationProbes) {
      engineReport.calibration.push(
        await runCalibrationProbe(browser, definition.name, probe),
      );
    }
  } finally {
    await browser.close();
  }

  engineReport.passed =
    engineReport.product?.passed === true &&
    engineReport.physics?.passed === true &&
    engineReport.calibration.every((probe) => probe.passed);
  failed ||= !engineReport.passed;
  report.engines.push(engineReport);
}

const chromiumReport = report.engines.find((engine) => engine.name === 'chromium');
for (const engineReport of report.engines) {
  if (engineReport.name === 'chromium') continue;

  for (let index = 0; index < calibrationProbes.length; index += 1) {
    const baseline = chromiumReport?.calibration[index];
    const candidate = engineReport.calibration[index];
    const comparison = compareNumericMetrics(baseline, candidate);
    report.crossEngineCalibration.push({
      baseline: 'chromium',
      candidate: engineReport.name,
      probe: calibrationProbes[index],
      ...comparison,
    });
    failed ||= !comparison.passed;
  }
}

report.mobile = await runMobileFlow();
report.recovery = await runRecoveryFlows();
report.corruptStorage = await runCorruptStorageFlow();
failed ||= !report.mobile.passed;
failed ||= !report.recovery.passed;
failed ||= !report.corruptStorage.passed;

report.summary = {
  engineCount: report.engines.length,
  enginesPassed: report.engines.filter((engine) => engine.passed).length,
  crossEngineComparisons: report.crossEngineCalibration.length,
  crossEngineComparisonsPassed: report.crossEngineCalibration.filter(
    (comparison) => comparison.passed,
  ).length,
  mobilePassed: report.mobile.passed,
  recoveryPassed: report.recovery.passed,
  corruptStoragePassed: report.corruptStorage.passed,
  passed: !failed,
};

await fs.writeFile(
  path.join(outputDirectory, 'report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify(report.summary, null, 2));
if (failed) process.exitCode = 1;
