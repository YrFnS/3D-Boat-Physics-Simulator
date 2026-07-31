import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';
const outputDirectory = path.resolve('artifacts/product-experience');
await fs.mkdir(outputDirectory, { recursive: true });

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

async function waitForDataset(page, key, value) {
  await page.waitForFunction(
    ({ datasetKey, expected }) =>
      document.documentElement.dataset[datasetKey] === expected,
    { datasetKey: key, expected: value },
    { timeout: 60_000 },
  );
}

async function waitForNumericDataset(page, key, predicateName, value = 0) {
  await page.waitForFunction(
    ({ datasetKey, check, expected }) => {
      const current = Number(document.documentElement.dataset[datasetKey]);
      if (!Number.isFinite(current)) return false;
      if (check === 'greater') return current > expected;
      if (check === 'at-least') return current >= expected;
      if (check === 'not-zero') return Math.abs(current) > 0.001;
      return false;
    },
    { datasetKey: key, check: predicateName, expected: value },
    { timeout: 60_000 },
  );
}

async function waitForCanvasReady(page) {
  await page.waitForSelector('canvas', { timeout: 60_000 });
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

async function waitForBriefing(page) {
  await waitForCanvasReady(page);
  await waitForDataset(page, 'simSessionPhase', 'menu');
  await page.getByRole('heading', { name: 'Choose your passage.' }).waitFor();
}

async function launchOpenWater(page) {
  await page.getByRole('button', { name: /Begin passage/i }).click();
  await waitForDataset(page, 'simSessionPhase', 'running');
  await waitForDataset(page, 'simScenarioRunStatus', 'active');
  await page.locator('[aria-label="Marine navigation chart"]').waitFor();
}

async function readRuntime(page) {
  return page.evaluate(() => {
    const dataset = document.documentElement.dataset;
    const canvas = document.querySelector('canvas');
    return {
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
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
      navigationMode: dataset.simNavigationMode ?? '',
      freeStatus: dataset.simFreeNavigationStatus ?? '',
      freeWaypointCount: Number(dataset.simFreeWaypointCount ?? '0'),
      checkpointId: dataset.simScenarioCheckpointId ?? '',
      checkpointLabel: dataset.simScenarioCheckpointLabel ?? '',
      checkpointWaypointIndex: Number(
        dataset.simScenarioCheckpointWaypointIndex ?? '-1',
      ),
      spawnX: Number(dataset.simScenarioSpawnX ?? '0'),
      spawnZ: Number(dataset.simScenarioSpawnZ ?? '0'),
      spawnHeadingDeg: Number(dataset.simScenarioSpawnHeadingDeg ?? '0'),
      resetTrigger: Number(dataset.simResetVesselTrigger ?? '0'),
      completedEntityCount: Number(dataset.simScenarioEntityCount ?? '0'),
      historyAttempts: Number(dataset.simScenarioHistoryAttempts ?? '0'),
      historyCompletions: Number(
        dataset.simScenarioHistoryCompletions ?? '0',
      ),
      historyBestScore: Number(dataset.simScenarioBestScore ?? '0'),
      historyBestTimeSeconds: Number(
        dataset.simScenarioBestTimeSeconds ?? 'NaN',
      ),
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

async function runFlow(name, pathName, flow) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });
  const page = await context.newPage();
  const consoleEntries = [];
  const pageErrors = [];
  const failedRequests = [];
  const checks = {};
  let responseStatus = null;
  let runtime = null;
  let flowError = null;

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

  try {
    const response = await page.goto(`${baseUrl}${pathName}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    responseStatus = response?.status() ?? null;
    await waitForBriefing(page);
    await flow({ page, checks });
    runtime = await readRuntime(page);
    await page.screenshot({
      path: path.join(outputDirectory, `${name}.png`),
      fullPage: false,
    });
  } catch (error) {
    flowError = error instanceof Error ? error.stack ?? error.message : String(error);
  }

  const severeConsoleEntries = consoleEntries.filter((entry) =>
    ['error', 'assert'].includes(entry.type),
  );
  const passed =
    flowError === null &&
    responseStatus === 200 &&
    runtime !== null &&
    runtimeIsValid(runtime) &&
    Object.values(checks).every(Boolean) &&
    pageErrors.length === 0 &&
    severeConsoleEntries.length === 0 &&
    failedRequests.length === 0;

  report.scenarios.push({
    name,
    responseStatus,
    runtime,
    checks,
    consoleEntries,
    pageErrors,
    failedRequests,
    flowError,
    screenshot: `${name}.png`,
    passed,
  });

  await context.close();
  return passed;
}

let allPassed = true;

allPassed =
  (await runFlow('free-navigation-flow', '/', async ({ page, checks }) => {
    await launchOpenWater(page);
    await page
      .getByRole('button', { name: 'Open free route plotter' })
      .click();
    await waitForDataset(page, 'simNavigationMode', 'free');

    const chart = page.locator('svg[aria-label="Navigation plotter"]');
    const box = await chart.boundingBox();
    if (!box) throw new Error('Unable to resolve navigation plotter bounds.');

    await page.mouse.click(box.x + box.width * 0.58, box.y + box.height * 0.25);
    await waitForDataset(page, 'simFreeWaypointCount', '1');
    await page.mouse.click(box.x + box.width * 0.78, box.y + box.height * 0.58);
    await waitForDataset(page, 'simFreeWaypointCount', '2');
    await waitForDataset(page, 'simFreeNavigationStatus', 'active');
    checks.plottedTwoSafeMarks = true;

    await page.getByRole('button', { name: 'Undo plotted waypoint' }).click();
    await waitForDataset(page, 'simFreeWaypointCount', '1');
    checks.undoMark = true;

    await page.mouse.click(box.x + box.width * 0.72, box.y + box.height * 0.72);
    await waitForDataset(page, 'simFreeWaypointCount', '2');
    await page
      .getByRole('button', { name: 'Return to mission route' })
      .click();
    await waitForDataset(page, 'simNavigationMode', 'mission');
    checks.missionSwitchPreservesPlanner =
      Number(
        await page.evaluate(
          () => document.documentElement.dataset.simFreeWaypointCount ?? '0',
        ),
      ) === 2;

    await page
      .getByRole('button', { name: 'Open free route plotter' })
      .click();
    await waitForDataset(page, 'simNavigationMode', 'free');
    await page.getByRole('button', { name: 'Clear plotted route' }).click();
    await waitForDataset(page, 'simFreeWaypointCount', '0');
    await waitForDataset(page, 'simFreeNavigationStatus', 'idle');
    checks.clearRoute = true;
  })) && allPassed;

allPassed =
  (await runFlow(
    'checkpoint-recovery-flow',
    '/?checkpointTest=1',
    async ({ page, checks }) => {
      await launchOpenWater(page);
      const resetAtLaunch = Number(
        await page.evaluate(
          () => document.documentElement.dataset.simResetVesselTrigger ?? '0',
        ),
      );

      await page.waitForFunction(
        () => Boolean(document.documentElement.dataset.simScenarioCheckpointId),
        undefined,
        { timeout: 60_000 },
      );
      await page.waitForFunction(
        (previousReset) =>
          Number(document.documentElement.dataset.simResetVesselTrigger ?? '0') >
          previousReset,
        resetAtLaunch,
        { timeout: 60_000 },
      );
      await waitForNumericDataset(page, 'simScenarioSpawnZ', 'not-zero');
      const checkpoint = await readRuntime(page);
      checks.checkpointActivated =
        checkpoint.checkpointId.length > 0 &&
        checkpoint.checkpointLabel !== 'Departure point' &&
        checkpoint.checkpointWaypointIndex >= 0;
      checks.safeSpawnQueued =
        Number.isFinite(checkpoint.spawnX) &&
        Number.isFinite(checkpoint.spawnZ) &&
        Math.hypot(checkpoint.spawnX, checkpoint.spawnZ) > 10 &&
        Number.isFinite(checkpoint.spawnHeadingDeg);

      const beforeManualRecovery = checkpoint.resetTrigger;
      await page.keyboard.press('Home');
      await page.waitForFunction(
        (previousReset) =>
          Number(document.documentElement.dataset.simResetVesselTrigger ?? '0') >
          previousReset,
        beforeManualRecovery,
        { timeout: 60_000 },
      );
      const afterRecovery = await readRuntime(page);
      checks.manualRecoveryUsesCheckpoint =
        afterRecovery.checkpointId === checkpoint.checkpointId &&
        afterRecovery.spawnX === checkpoint.spawnX &&
        afterRecovery.spawnZ === checkpoint.spawnZ;
    },
  )) && allPassed;

allPassed =
  (await runFlow(
    'scenario-record-flow',
    '/?missionTest=complete',
    async ({ page, checks }) => {
      await launchOpenWater(page);
      await waitForDataset(page, 'simScenarioResult', 'completed');
      await page.getByText('Passage complete', { exact: true }).waitFor();
      await waitForDataset(page, 'simScenarioEntityCount', '2');
      await waitForNumericDataset(page, 'simScenarioHistoryAttempts', 'at-least', 1);
      await waitForNumericDataset(
        page,
        'simScenarioHistoryCompletions',
        'at-least',
        1,
      );
      await waitForNumericDataset(page, 'simScenarioBestScore', 'greater', 0);
      await waitForNumericDataset(
        page,
        'simScenarioBestTimeSeconds',
        'greater',
        0,
      );
      const completed = await readRuntime(page);
      checks.requiredTasksIncluded = completed.completedEntityCount === 2;
      checks.recordStored =
        completed.historyAttempts === 1 &&
        completed.historyCompletions === 1 &&
        completed.historyBestScore > 0 &&
        Number.isFinite(completed.historyBestTimeSeconds);
      checks.resultShowsRecords =
        (await page.getByText('Scenario record:', { exact: false }).count()) === 1 &&
        (await page.getByText('Personal best', { exact: true }).count()) === 1;

      await page.getByRole('button', { name: 'Briefing', exact: true }).click();
      await waitForDataset(page, 'simSessionPhase', 'menu');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForBriefing(page);
      await waitForDataset(page, 'simScenarioHistoryAttempts', '1');
      await waitForDataset(page, 'simScenarioHistoryCompletions', '1');
      const restored = await readRuntime(page);
      checks.recordPersistsAfterReload =
        restored.historyAttempts === 1 &&
        restored.historyCompletions === 1 &&
        restored.historyBestScore === completed.historyBestScore &&
        Math.abs(
          restored.historyBestTimeSeconds - completed.historyBestTimeSeconds,
        ) < 0.001;
    },
  )) && allPassed;

await browser.close();
await fs.writeFile(
  path.join(outputDirectory, 'gameplay-systems-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
console.log(JSON.stringify(report, null, 2));
if (!allPassed) process.exitCode = 1;
