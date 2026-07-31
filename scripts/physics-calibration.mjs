import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.CALIBRATION_BASE_URL ?? 'http://127.0.0.1:3000';
const outputDirectory = path.resolve('artifacts/physics-calibration');
await fs.mkdir(outputDirectory, { recursive: true });

const vessels = ['trawler', 'speedboat'];
// Run handling and contact envelopes for both vessel configurations.
const calibrationScenarios = [
  { scenario: 'rest', queryKey: 'calibration' },
  { scenario: 'stability', queryKey: 'calibration' },
  { scenario: 'speed', queryKey: 'calibration' },
  { scenario: 'stop', queryKey: 'calibration' },
  { scenario: 'turn', queryKey: 'calibration' },
  { scenario: 'grounding', queryKey: 'collisionCalibration' },
  { scenario: 'glancing', queryKey: 'collisionCalibration' },
  { scenario: 'impact', queryKey: 'collisionCalibration' },
];
const scenarios = vessels.flatMap((vessel) =>
  calibrationScenarios.map(({ scenario, queryKey }) => ({
    name: `${vessel}-${scenario}`,
    vessel,
    scenario,
    queryKey,
  })),
);

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

let failed = false;

try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({
      viewport: { width: 960, height: 640 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    });
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

    const url = new URL(baseUrl);
    url.searchParams.set('debug', '1');
    url.searchParams.set(scenario.queryKey, scenario.scenario);
    url.searchParams.set('vessel', scenario.vessel);

    const response = await page.goto(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await page.waitForSelector('canvas', { timeout: 60_000 });
    await page.waitForFunction(
      () => document.documentElement.dataset.simCalibrationReady === '1',
      { timeout: 60_000 },
    );

    const calibration = await page.evaluate(() => {
      const dataset = document.documentElement.dataset;
      const rawResult = dataset.simCalibrationResult;
      let result = null;

      try {
        result = rawResult ? JSON.parse(rawResult) : null;
      } catch {
        result = null;
      }

      return {
        ready: dataset.simCalibrationReady === '1',
        passed: dataset.simCalibrationPassed === '1',
        progress: Number(dataset.simCalibrationProgress),
        scenario: dataset.simCalibrationScenario ?? null,
        vessel: dataset.simCalibrationVessel ?? null,
        result,
      };
    });

    const severeConsoleEntries = consoleEntries.filter((entry) =>
      ['error', 'assert'].includes(entry.type),
    );
    const identityMatches =
      calibration.scenario === scenario.scenario &&
      calibration.vessel === scenario.vessel &&
      calibration.result?.scenario === scenario.scenario &&
      calibration.result?.vessel === scenario.vessel;
    const scenarioPassed =
      response?.ok() === true &&
      calibration.ready &&
      calibration.passed &&
      calibration.progress >= 1 &&
      identityMatches &&
      calibration.result?.passed === true &&
      severeConsoleEntries.length === 0 &&
      pageErrors.length === 0 &&
      failedRequests.length === 0;

    const screenshot = `${scenario.name}.png`;
    await page.screenshot({
      path: path.join(outputDirectory, screenshot),
      fullPage: false,
    });

    report.scenarios.push({
      ...scenario,
      responseStatus: response?.status() ?? null,
      calibration,
      consoleEntries,
      pageErrors,
      failedRequests,
      screenshot,
      passed: scenarioPassed,
    });
    failed ||= !scenarioPassed;
    await context.close();
  }
} finally {
  await browser.close();
}

report.summary = {
  total: report.scenarios.length,
  passed: report.scenarios.filter((scenario) => scenario.passed).length,
  failed: report.scenarios.filter((scenario) => !scenario.passed).length,
};

await fs.writeFile(
  path.join(outputDirectory, 'report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify(report, null, 2));
if (failed) process.exitCode = 1;
