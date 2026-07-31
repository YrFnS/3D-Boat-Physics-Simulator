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
let flowError = null;
let responseStatus = null;

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

async function waitForDataset(key, value) {
  await page.waitForFunction(
    ({ datasetKey, expected }) =>
      document.documentElement.dataset[datasetKey] === expected,
    { datasetKey: key, expected: value },
    { timeout: 60_000 },
  );
}

async function clickSettingToggle(label) {
  const input = page.getByLabel(label);
  await input.locator('xpath=ancestor::label').click();
}

async function readState() {
  return page.evaluate(() => {
    const dataset = document.documentElement.dataset;
    return {
      sessionPhase: dataset.simSessionPhase ?? '',
      settingsHydrated: dataset.simSettingsHydrated ?? '',
      settingsOpen: dataset.simSettingsOpen ?? '',
      onboardingOpen: dataset.simOnboardingOpen ?? '',
      onboardingCompleted: dataset.simOnboardingCompleted ?? '',
      onboardingStep: Number(dataset.simOnboardingStep ?? '0'),
      controlHints: dataset.simControlHints ?? '',
      reducedMotion: dataset.simReducedMotion ?? '',
      highContrast: dataset.simHighContrast ?? '',
      interfaceScale: dataset.simInterfaceScale ?? '',
      cameraFov: Number(dataset.simCameraFov ?? '0'),
      cameraSmoothing: Number(dataset.simCameraSmoothing ?? '0'),
      inputMode: dataset.simInputMode ?? '',
    };
  });
}

async function waitForCanvasReady() {
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

try {
  const response = await page.goto(`${baseUrl}/?onboardingTest=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  responseStatus = response?.status() ?? null;

  await page.waitForSelector('canvas', { timeout: 60_000 });
  await waitForCanvasReady();
  await waitForDataset('simSessionPhase', 'menu');
  await waitForDataset('simSettingsHydrated', '1');
  await waitForDataset('simOnboardingCompleted', '0');
  checks.cleanFirstRun = true;

  await page.getByRole('button', { name: /Begin passage/i }).click();
  await waitForDataset('simOnboardingOpen', '1');
  await waitForDataset('simSessionPhase', 'paused');
  await page.getByRole('dialog', { name: /Open Water/i }).waitFor();
  checks.firstRunGuideOpened = true;

  for (let nextStep = 1; nextStep <= 4; nextStep += 1) {
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await waitForDataset('simOnboardingStep', String(nextStep));
  }
  await page
    .getByRole('button', { name: 'Begin passage', exact: true })
    .click();
  await waitForDataset('simOnboardingOpen', '0');
  await waitForDataset('simOnboardingCompleted', '1');
  await waitForDataset('simSessionPhase', 'running');
  checks.guideCompletionResumedSimulation = true;

  await page.keyboard.press('o');
  await waitForDataset('simSettingsOpen', '1');
  await waitForDataset('simSessionPhase', 'paused');
  await page.getByRole('dialog', { name: 'Settings' }).waitFor();
  checks.settingsPausedSimulation = true;

  await clickSettingToggle('Reduced motion');
  await clickSettingToggle('Higher contrast');
  await page.getByRole('button', { name: 'Large', exact: true }).click();
  await page.getByLabel('Field of view').fill('72');
  await page.getByLabel('Follow smoothing').fill('0.25');
  await page.getByLabel('Simulator quality mode').selectOption('medium');

  await waitForDataset('simReducedMotion', '1');
  await waitForDataset('simHighContrast', '1');
  await waitForDataset('simInterfaceScale', 'large');
  await waitForDataset('simCameraFov', '72');
  await waitForDataset('simCameraSmoothing', '0.25');
  checks.settingsAppliedImmediately = true;

  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await waitForDataset('simSettingsOpen', '0');
  await waitForDataset('simSessionPhase', 'running');
  checks.settingsCloseResumedSimulation = true;

  await page.keyboard.press('o');
  await waitForDataset('simSettingsOpen', '1');
  await page.getByRole('button', { name: 'Replay guide' }).click();
  await waitForDataset('simSettingsOpen', '0');
  await waitForDataset('simOnboardingOpen', '1');
  await page.getByRole('button', { name: 'Skip guide' }).click();
  await waitForDataset('simOnboardingOpen', '0');
  await waitForDataset('simSessionPhase', 'running');
  checks.guideReplay = true;

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await waitForCanvasReady();
  await waitForDataset('simSettingsHydrated', '1');
  await waitForDataset('simSessionPhase', 'menu');
  const restored = await readState();
  checks.settingsPersistence =
    restored.onboardingCompleted === '1' &&
    restored.reducedMotion === '1' &&
    restored.highContrast === '1' &&
    restored.interfaceScale === 'large' &&
    restored.cameraFov === 72 &&
    Math.abs(restored.cameraSmoothing - 0.25) < 0.001 &&
    restored.inputMode === 'keyboard';

  await page.getByRole('button', { name: 'Open simulator settings' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).waitFor();
  checks.persistedControlsReflectState =
    (await page.getByLabel('Reduced motion').isChecked()) &&
    (await page.getByLabel('Higher contrast').isChecked()) &&
    (await page.getByRole('button', { name: 'Large', exact: true }).getAttribute('aria-pressed')) === 'true' &&
    (await page.getByLabel('Field of view').inputValue()) === '72' &&
    (await page.getByLabel('Follow smoothing').inputValue()) === '0.25';

  const runtime = await page.evaluate(() => ({
    title: document.title,
    horizontalOverflow:
      document.documentElement.scrollWidth > window.innerWidth + 1,
    verticalOverflow:
      document.documentElement.scrollHeight > window.innerHeight + 1,
  }));
  checks.runtime =
    runtime.title === '3D Boat Physics Simulator' &&
    !runtime.horizontalOverflow &&
    !runtime.verticalOverflow;

  await page.screenshot({
    path: path.join(outputDirectory, 'onboarding-settings.png'),
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
  Object.values(checks).every(Boolean) &&
  pageErrors.length === 0 &&
  severeConsoleEntries.length === 0 &&
  failedRequests.length === 0;

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  responseStatus,
  state: flowError === null ? await readState() : null,
  checks,
  consoleEntries,
  pageErrors,
  failedRequests,
  flowError,
  screenshot: 'onboarding-settings.png',
  passed,
};

await fs.writeFile(
  path.join(outputDirectory, 'onboarding-settings-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
console.log(JSON.stringify(report, null, 2));

await context.close();
await browser.close();
if (!passed) process.exitCode = 1;
