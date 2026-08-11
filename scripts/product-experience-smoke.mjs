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

function readExperienceState(page) {
  return page.evaluate(() => {
    const dataset = document.documentElement.dataset;
    return {
      sessionPhase: dataset.simSessionPhase ?? '',
      scenario: dataset.simScenario ?? '',
      cameraMode: dataset.simCameraMode ?? '',
      hudVisible: dataset.simHudVisible ?? '',
      activeBoat: dataset.simActiveBoat ?? '',
      resetVesselTrigger: Number(dataset.simResetVesselTrigger ?? '0'),
      scenarioRunStatus: dataset.simScenarioRunStatus ?? '',
      scenarioRunMode: dataset.simScenarioRunMode ?? '',
      scenarioEnvironmentLocked:
        dataset.simScenarioEnvironmentLocked ?? '',
      scenarioAssistanceReason:
        dataset.simScenarioAssistanceReason ?? '',
      scenarioResultRunMode: dataset.simScenarioResultRunMode ?? '',
      hullHealth: Number(dataset.simHullHealth ?? '0'),
      engineHealth: Number(dataset.simEngineHealth ?? '0'),
      rudderHealth: Number(dataset.simRudderHealth ?? '0'),
      fieldRepairActive: dataset.simFieldRepairActive ?? '0',
      fieldRepairSeconds: Number(dataset.simFieldRepairSeconds ?? '0'),
      fieldRepairActivationCount: Number(
        dataset.simFieldRepairActivationCount ?? '0',
      ),
      fieldRepairEngineRestored: Number(
        dataset.simFieldRepairEngineRestored ?? '0',
      ),
      fieldRepairRudderRestored: Number(
        dataset.simFieldRepairRudderRestored ?? '0',
      ),
      fieldRepairPenaltyPoints: Number(
        dataset.simFieldRepairPenaltyPoints ?? '0',
      ),
      scenarioInteractionEntityId:
        dataset.simScenarioInteractionEntityId ?? '',
      scenarioInteractionStatus:
        dataset.simScenarioInteractionStatus ?? '',
      scenarioInteractionProgress: Number(
        dataset.simScenarioInteractionProgress ?? '0',
      ),
      scenarioInteractionMessage:
        dataset.simScenarioInteractionMessage ?? '',
      scenarioEntityCount: Number(dataset.simScenarioEntityCount ?? '0'),
      windSpeed: Number(dataset.simWindSpeed ?? '0'),
      assistedHistoryAttempts: Number(
        dataset.simScenarioHistoryAssistedAttempts ?? '0',
      ),
      activeWaypointIndex: Number(dataset.simActiveWaypointIndex ?? '0'),
      scenarioProgress: Number(dataset.simScenarioProgress ?? '0'),
      scenarioElapsedSeconds: Number(
        dataset.simScenarioElapsedSeconds ?? '0',
      ),
      navigationDistanceM: Number(dataset.simNavigationDistanceM ?? '0'),
      navigationBearingDeg: Number(dataset.simNavigationBearingDeg ?? '0'),
      scenarioResult: dataset.simScenarioResult ?? '',
    };
  });
}

async function waitForDataset(page, key, value) {
  await page.waitForFunction(
    ({ datasetKey, expected }) =>
      document.documentElement.dataset[datasetKey] === expected,
    { datasetKey: key, expected: value },
    { timeout: 60_000 },
  );
}

async function waitForCollisionRuntimeReady(page) {
  await waitForDataset(page, 'simCollisionRuntimeStatus', 'ready');
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

async function waitForNavigationReady(page) {
  await page.waitForFunction(
    () => {
      const dataset = document.documentElement.dataset;
      const distance = Number(dataset.simNavigationDistanceM);
      const bearing = Number(dataset.simNavigationBearingDeg);
      const progress = Number(dataset.simScenarioProgress);
      return (
        dataset.simScenarioRunStatus === 'active' &&
        Number.isFinite(distance) &&
        distance > 0 &&
        Number.isFinite(bearing) &&
        bearing >= 0 &&
        bearing < 360 &&
        Number.isFinite(progress) &&
        progress >= 0 &&
        progress <= 1
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
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      body: {
        width: bodyRect.width,
        height: bodyRect.height,
      },
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

function navigationStateIsValid(state) {
  return (
    state.scenarioRunStatus === 'active' &&
    Number.isInteger(state.activeWaypointIndex) &&
    state.activeWaypointIndex >= 0 &&
    Number.isFinite(state.scenarioProgress) &&
    state.scenarioProgress >= 0 &&
    state.scenarioProgress <= 1 &&
    Number.isFinite(state.scenarioElapsedSeconds) &&
    state.scenarioElapsedSeconds >= 0 &&
    Number.isFinite(state.navigationDistanceM) &&
    state.navigationDistanceM > 0 &&
    Number.isFinite(state.navigationBearingDeg) &&
    state.navigationBearingDeg >= 0 &&
    state.navigationBearingDeg < 360
  );
}

async function runFlow(
  name,
  contextOptions,
  flow,
  pathName = '/',
) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const consoleEntries = [];
  const pageErrors = [];
  const failedRequests = [];
  const checks = {};

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

  let responseStatus = null;
  let runtime = null;
  let experience = null;
  let flowError = null;

  try {
    const response = await page.goto(`${baseUrl}${pathName}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    responseStatus = response?.status() ?? null;

    await page.waitForSelector('canvas', { timeout: 60_000 });
    await waitForCanvasReady(page);
    await waitForDataset(page, 'simSessionPhase', 'menu');
    await page.getByRole('heading', { name: 'Choose your passage.' }).waitFor();
    await waitForCollisionRuntimeReady(page);

    checks.briefingVisible = true;
    checks.scenarioCardsVisible =
      (await page.locator('button').filter({ hasText: 'Open Water' }).count()) > 0 &&
      (await page.locator('button').filter({ hasText: 'Harbor Training' }).count()) > 0 &&
      (await page.locator('button').filter({ hasText: 'Storm Passage' }).count()) > 0 &&
      (await page.locator('button').filter({ hasText: 'Winter Rescue' }).count()) > 0;

    await flow({ page, checks });
    await waitForCanvasReady(page);

    runtime = await readRuntime(page);
    experience = await readExperienceState(page);
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
    experience,
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
  (await runFlow(
    'desktop-product-flow',
    {
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
    async ({ page, checks }) => {
      await page.locator('button').filter({ hasText: 'Storm Passage' }).first().click();
      await waitForDataset(page, 'simScenario', 'storm-passage');
      checks.scenarioSelection = true;

      await page.getByRole('button', { name: /speedboat/i }).first().click();
      await waitForDataset(page, 'simActiveBoat', 'speedboat');
      await waitForCollisionRuntimeReady(page);
      checks.vesselSelection = true;

      await page.getByRole('button', { name: /Begin passage/i }).click();
      await waitForDataset(page, 'simSessionPhase', 'running');
      await waitForCollisionRuntimeReady(page);
      await waitForNavigationReady(page);
      await page.locator('[aria-label="Marine navigation chart"]').waitFor();
      checks.launch = true;

      const launched = await readExperienceState(page);
      checks.navigationChartVisible = true;
      checks.navigationState = navigationStateIsValid(launched);
      checks.standardEnvironmentLocked =
        launched.scenarioRunMode === 'standard' &&
        launched.scenarioEnvironmentLocked === '1' &&
        (await page.getByLabel('Wind speed').isDisabled()) &&
        (await page.getByLabel('Current speed').isDisabled()) &&
        (await page.getByRole('button', { name: 'Dawn' }).isDisabled());

      await page.keyboard.press('c');
      await waitForDataset(page, 'simCameraMode', 'helm');
      checks.cameraCycle = true;

      await page.keyboard.press('h');
      await waitForDataset(page, 'simHudVisible', '0');
      await page.keyboard.press('h');
      await waitForDataset(page, 'simHudVisible', '1');
      await page.locator('[aria-label="Marine navigation chart"]').waitFor();
      checks.hudToggle = true;

      await page.keyboard.press('Home');
      await page.waitForFunction(
        (previousReset) =>
          Number(document.documentElement.dataset.simResetVesselTrigger ?? '0') >
          previousReset,
        launched.resetVesselTrigger,
        { timeout: 60_000 },
      );
      await waitForCollisionRuntimeReady(page);
      const afterReset = await readExperienceState(page);
      checks.vesselReset =
        afterReset.scenarioRunStatus === 'active' &&
        afterReset.scenarioResult === '';
      checks.missionClockSurvivesRecovery =
        afterReset.scenarioElapsedSeconds >=
        launched.scenarioElapsedSeconds - 0.12;

      await page.keyboard.press('Escape');
      await waitForDataset(page, 'simSessionPhase', 'paused');
      await page.getByRole('heading', { name: 'Storm Passage' }).waitFor();
      const pauseBaseline = await readExperienceState(page);
      await page.waitForTimeout(500);
      const duringPause = await readExperienceState(page);
      checks.pause = true;
      checks.pauseFreezesMissionClock =
        Math.abs(
          duringPause.scenarioElapsedSeconds -
            pauseBaseline.scenarioElapsedSeconds,
        ) <= 0.001;

      await page.getByRole('button', { name: /Resume passage/i }).click();
      await waitForDataset(page, 'simSessionPhase', 'running');
      await page.waitForFunction(
        (pausedElapsed) =>
          Number(
            document.documentElement.dataset.simScenarioElapsedSeconds ?? '0',
          ) >=
          pausedElapsed + 0.15,
        duringPause.scenarioElapsedSeconds,
        { timeout: 60_000 },
      );
      checks.resume = true;
      checks.resumeAdvancesMissionClock = true;

      await page.keyboard.press('Escape');
      await waitForDataset(page, 'simSessionPhase', 'paused');
      await page.getByRole('button', { name: /Restart scenario/i }).click();
      await waitForDataset(page, 'simSessionPhase', 'running');
      await page.waitForFunction(
        (previousReset) =>
          Number(document.documentElement.dataset.simResetVesselTrigger ?? '0') >
          previousReset,
        afterReset.resetVesselTrigger,
        { timeout: 60_000 },
      );
      await waitForCollisionRuntimeReady(page);
      await waitForNavigationReady(page);
      const afterRestart = await readExperienceState(page);
      checks.restart =
        afterRestart.activeWaypointIndex === 0 &&
        afterRestart.scenarioRunStatus === 'active' &&
        afterRestart.scenarioResult === '';

      await page.keyboard.press('Escape');
      await waitForDataset(page, 'simSessionPhase', 'paused');
      await page.getByRole('button', { name: /Return to briefing/i }).click();
      await waitForDataset(page, 'simSessionPhase', 'menu');
      await waitForDataset(page, 'simScenarioRunStatus', 'inactive');
      checks.returnToBriefing = true;

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('canvas', { timeout: 60_000 });
      await waitForCanvasReady(page);
      await waitForDataset(page, 'simSessionPhase', 'menu');
      await waitForCollisionRuntimeReady(page);
      const restored = await readExperienceState(page);
      checks.preferencePersistence =
        restored.scenario === 'storm-passage' &&
        restored.activeBoat === 'speedboat' &&
        restored.cameraMode === 'helm' &&
        restored.hudVisible === '1' &&
        restored.scenarioRunStatus === 'inactive';
    },
  )) && allPassed;

allPassed =
  (await runFlow(
    'mobile-product-flow',
    {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    },
    async ({ page, checks }) => {
      await page.getByRole('button', { name: /Begin passage/i }).click();
      await waitForDataset(page, 'simSessionPhase', 'running');
      await waitForCollisionRuntimeReady(page);
      await waitForNavigationReady(page);
      await page.locator('[aria-label="Marine navigation chart"]').waitFor();
      const launched = await readExperienceState(page);
      checks.launch = true;
      checks.mobileNavigationChart = true;
      checks.mobileNavigationState = navigationStateIsValid(launched);

      await page.getByRole('button', { name: 'Pause simulation' }).click();
      await waitForDataset(page, 'simSessionPhase', 'paused');
      checks.mobilePause = true;

      await page.getByRole('button', { name: /Resume passage/i }).click();
      await waitForDataset(page, 'simSessionPhase', 'running');
      checks.mobileResume = true;

      await page.getByRole('button', { name: 'Hide instrument HUD' }).click();
      await waitForDataset(page, 'simHudVisible', '0');
      await page.getByRole('button', { name: 'Show instrument HUD' }).click();
      await waitForDataset(page, 'simHudVisible', '1');
      await page.locator('[aria-label="Marine navigation chart"]').waitFor();
      checks.mobileHudToggle = true;

      checks.mobileTouchControls =
        (await page.getByRole('button', { name: 'Throttle forward' }).count()) > 0 &&
        (await page.getByRole('button', { name: 'Throttle reverse' }).count()) > 0 &&
        (await page.getByRole('button', { name: 'Steer left' }).count()) > 0 &&
        (await page.getByRole('button', { name: 'Steer right' }).count()) > 0;
    },
  )) && allPassed;

allPassed =
  (await runFlow(
    'typed-interaction-guidance-flow',
    {
      viewport: { width: 1280, height: 820 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
    async ({ page, checks }) => {
      await page
        .locator('button')
        .filter({ hasText: 'Harbor Training' })
        .first()
        .click();
      await waitForDataset(page, 'simScenario', 'harbor-training');
      await page.getByRole('button', { name: /Begin passage/i }).click();
      await waitForDataset(page, 'simSessionPhase', 'running');
      await waitForCollisionRuntimeReady(page);
      await waitForNavigationReady(page);
      await waitForDataset(
        page,
        'simScenarioInteractionEntityId',
        'harbor-supply-pickup',
      );
      await waitForDataset(page, 'simScenarioInteractionStatus', 'approach');

      const interaction = await readExperienceState(page);
      checks.typedPickupActive =
        interaction.scenarioInteractionEntityId ===
          'harbor-supply-pickup' &&
        interaction.scenarioInteractionStatus === 'approach' &&
        interaction.scenarioEntityCount === 0;
      checks.noGenericRadiusCompletion =
        interaction.scenarioInteractionProgress === 0;
      checks.typedGuidanceVisible =
        interaction.scenarioInteractionMessage.includes('loading zone') &&
        (await page.getByText(/loading zone/i).count()) > 0;
    },
  )) && allPassed;

allPassed =
  (await runFlow(
    'field-repair-fairness-flow',
    {
      viewport: { width: 1280, height: 820 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
    async ({ page, checks }) => {
      await page
        .locator('button')
        .filter({ hasText: 'Harbor Training' })
        .first()
        .click();
      await waitForDataset(page, 'simScenario', 'harbor-training');
      await page.getByRole('button', { name: /Begin passage/i }).click();
      await waitForDataset(page, 'simSessionPhase', 'running');
      await waitForCollisionRuntimeReady(page);
      await page.waitForFunction(
        () => {
          const dataset = document.documentElement.dataset;
          return (
            Number(dataset.simHullHealth) <= 72.1 &&
            Number(dataset.simEngineHealth) <= 35.1 &&
            Number(dataset.simRudderHealth) <= 42.1
          );
        },
        undefined,
        { timeout: 60_000 },
      );

      const initial = await readExperienceState(page);
      await page.keyboard.down('r');
      await page.waitForFunction(
        () =>
          Number(
            document.documentElement.dataset.simFieldRepairSeconds ??
              '0',
          ) >= 1.5,
        undefined,
        { timeout: 60_000 },
      );
      await page.keyboard.up('r');
      await page.waitForFunction(
        () =>
          document.documentElement.dataset.simFieldRepairActive ===
          '0',
        undefined,
        { timeout: 60_000 },
      );

      const repaired = await readExperienceState(page);
      checks.hullNotRestored =
        Math.abs(repaired.hullHealth - initial.hullHealth) < 0.15;
      checks.emergencyRepairIsLimited =
        repaired.engineHealth > initial.engineHealth + 0.5 &&
        repaired.rudderHealth > initial.rudderHealth + 0.8 &&
        repaired.engineHealth <= 55.01 &&
        repaired.rudderHealth <= 65.01;
      checks.repairUsageRecorded =
        repaired.fieldRepairSeconds >= 1.5 &&
        repaired.fieldRepairActivationCount === 1 &&
        repaired.fieldRepairEngineRestored > 0.5 &&
        repaired.fieldRepairRudderRestored > 0.8 &&
        repaired.fieldRepairPenaltyPoints > 0;
      checks.repairLimitsDisclosed =
        (await page.getByText(
          /Hull structural condition cannot be restored underway/i,
        ).count()) > 0;

      await page
        .getByRole('button', { name: 'Open free route plotter' })
        .click();
      await waitForDataset(page, 'simNavigationMode', 'free');
      await page.keyboard.down('r');
      await page.waitForFunction(
        (minimumSeconds) =>
          Number(
            document.documentElement.dataset.simFieldRepairSeconds ??
              '0',
          ) >= minimumSeconds,
        repaired.fieldRepairSeconds + 0.75,
        { timeout: 60_000 },
      );
      await page.keyboard.up('r');
      await waitForDataset(page, 'simFieldRepairActive', '0');
      const freeRepaired = await readExperienceState(page);
      checks.freeNavigationRepairTracked =
        freeRepaired.fieldRepairSeconds >=
          repaired.fieldRepairSeconds + 0.75 &&
        freeRepaired.fieldRepairActivationCount ===
          repaired.fieldRepairActivationCount + 1 &&
        freeRepaired.fieldRepairEngineRestored >
          repaired.fieldRepairEngineRestored &&
        freeRepaired.fieldRepairRudderRestored >
          repaired.fieldRepairRudderRestored &&
        freeRepaired.fieldRepairPenaltyPoints >
          repaired.fieldRepairPenaltyPoints;

      await page
        .getByRole('button', { name: 'Return to mission route' })
        .click();
      await waitForDataset(page, 'simNavigationMode', 'mission');
      await page.keyboard.down('r');
      await waitForDataset(page, 'simFieldRepairActive', '1');
      await page.keyboard.press('Escape');
      await waitForDataset(page, 'simSessionPhase', 'paused');
      await waitForDataset(page, 'simFieldRepairActive', '0');
      await page.keyboard.up('r');
      checks.pauseClearsRepairState = true;
      await page
        .getByRole('button', { name: /Resume passage/i })
        .click();
      await waitForDataset(page, 'simSessionPhase', 'running');
      await waitForDataset(page, 'simFieldRepairActive', '0');
      // Health telemetry publishes at 10 Hz. Let the final pre-pause repair
      // step settle before capturing the condition that recovery must preserve.
      await page.waitForTimeout(350);
      const conditionBeforeRecovery =
        await readExperienceState(page);

      const resetBeforeRecovery =
        conditionBeforeRecovery.resetVesselTrigger;
      await page.keyboard.press('Home');
      await page.waitForFunction(
        (previousReset) =>
          Number(
            document.documentElement.dataset.simResetVesselTrigger ??
              '0',
          ) > previousReset,
        resetBeforeRecovery,
        { timeout: 60_000 },
      );
      await waitForCollisionRuntimeReady(page);
      await page.waitForTimeout(350);
      const recovered = await readExperienceState(page);
      checks.recoveryPreservesCondition =
        // Recovery may republish condition on a different 10 Hz telemetry
        // boundary, but it must never erase meaningful damage or repair cost.
        recovered.hullHealth < 90 &&
        recovered.engineHealth < 60 &&
        recovered.rudderHealth < 70 &&
        Math.abs(
          recovered.hullHealth - conditionBeforeRecovery.hullHealth,
        ) < 1 &&
        Math.abs(
          recovered.engineHealth - conditionBeforeRecovery.engineHealth,
        ) < 1 &&
        Math.abs(
          recovered.rudderHealth - conditionBeforeRecovery.rudderHealth,
        ) < 1 &&
        recovered.fieldRepairPenaltyPoints >=
          conditionBeforeRecovery.fieldRepairPenaltyPoints &&
        recovered.fieldRepairPenaltyPoints >=
          freeRepaired.fieldRepairPenaltyPoints;
    },
    '/?repairTest=1',
  )) && allPassed;

allPassed =
  (await runFlow(
    'assisted-environment-flow',
    {
      viewport: { width: 1280, height: 820 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
    async ({ page, checks }) => {
      await page.getByRole('button', { name: /Begin passage/i }).click();
      await waitForDataset(page, 'simSessionPhase', 'running');
      await waitForCollisionRuntimeReady(page);
      await waitForNavigationReady(page);

      const standard = await readExperienceState(page);
      checks.standardStartsLocked =
        standard.scenarioRunMode === 'standard' &&
        standard.scenarioEnvironmentLocked === '1' &&
        (await page.getByLabel('Wind speed').isDisabled());

      await page
        .getByRole('button', { name: 'Use custom conditions' })
        .first()
        .click();
      await waitForDataset(page, 'simScenarioRunMode', 'assisted');
      await waitForDataset(page, 'simScenarioEnvironmentLocked', '0');
      const windControl = page.getByLabel('Wind speed');
      await windControl.fill('12.5');
      await waitForDataset(page, 'simWindSpeed', '12.5');

      const assisted = await readExperienceState(page);
      checks.assistedUnlock =
        assisted.scenarioRunMode === 'assisted' &&
        assisted.scenarioEnvironmentLocked === '0' &&
        assisted.scenarioAssistanceReason.length > 0 &&
        !(await windControl.isDisabled()) &&
        Math.abs(assisted.windSpeed - 12.5) < 0.001;
      checks.assistedDisclosure =
        (await page.getByText('Assisted conditions', { exact: true }).count()) > 0;

      await page
        .getByRole('button', { name: 'Restore scenario preset' })
        .first()
        .click();
      await waitForDataset(page, 'simWindSpeed', '8');
      const restored = await readExperienceState(page);
      checks.restorePresetKeepsAssisted =
        restored.scenarioRunMode === 'assisted' &&
        restored.scenarioEnvironmentLocked === '0' &&
        Math.abs(restored.windSpeed - 8) < 0.001;
    },
  )) && allPassed;

allPassed =
  (await runFlow(
    'mission-completion-flow',
    {
      viewport: { width: 1180, height: 780 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
    async ({ page, checks }) => {
      await page.getByRole('button', { name: /Begin passage/i }).click();
      await waitForDataset(page, 'simSessionPhase', 'running');
      await waitForCollisionRuntimeReady(page);
      await waitForNavigationReady(page);
      await waitForDataset(page, 'simScenarioResult', 'completed');
      await page.getByText('Passage complete', { exact: true }).waitFor();
      const resultState = await readExperienceState(page);
      checks.completionState =
        resultState.sessionPhase === 'paused' &&
        resultState.scenarioRunStatus === 'completed' &&
        resultState.scenarioResult === 'completed' &&
        resultState.scenarioResultRunMode === 'standard';
      checks.completionActions =
        (await page.getByRole('button', { name: /Retry passage/i }).count()) === 1 &&
        (await page.getByRole('button', { name: /Briefing/i }).count()) === 1 &&
        (await page.getByRole('button', { name: /Next: Harbor Training/i }).count()) === 1;
      checks.scoreVisible =
        (await page.getByText('Mission score', { exact: true }).count()) === 1 &&
        (await page.getByText('out of 1000', { exact: true }).count()) === 1;
    },
    '/?missionTest=complete',
  )) && allPassed;

allPassed =
  (await runFlow(
    'mission-failure-flow',
    {
      viewport: { width: 1180, height: 780 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
    async ({ page, checks }) => {
      await page.getByRole('button', { name: /Begin passage/i }).click();
      await waitForDataset(page, 'simSessionPhase', 'running');
      await waitForCollisionRuntimeReady(page);
      await waitForNavigationReady(page);
      await waitForDataset(page, 'simScenarioResult', 'failed');
      await page.getByText('Passage failed', { exact: true }).waitFor();
      const resultState = await readExperienceState(page);
      checks.failureState =
        resultState.sessionPhase === 'paused' &&
        resultState.scenarioRunStatus === 'failed' &&
        resultState.scenarioResult === 'failed';
      checks.failureReason =
        (await page.getByText('Automated mission failure probe passed.', {
          exact: true,
        }).count()) === 1;
      checks.failureActions =
        (await page.getByRole('button', { name: /Retry passage/i }).count()) === 1 &&
        (await page.getByRole('button', { name: /Briefing/i }).count()) === 1;
    },
    '/?missionTest=fail',
  )) && allPassed;

await browser.close();
await fs.writeFile(
  path.join(outputDirectory, 'report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify(report, null, 2));
if (!allPassed) process.exitCode = 1;
