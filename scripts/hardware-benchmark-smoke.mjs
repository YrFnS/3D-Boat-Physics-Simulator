import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';
const artifactDirectory = path.resolve('artifacts/release-validation');
await fs.mkdir(artifactDirectory, { recursive: true });

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
});
const page = await context.newPage();
const consoleEntries = [];
const pageErrors = [];
const failedRequests = [];

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
let downloadedReport = null;
let flowError = null;

try {
  const response = await page.goto(`${baseUrl}/?benchmark=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  responseStatus = response?.status() ?? null;

  await page.waitForSelector('canvas', { timeout: 60_000 });
  await page.waitForSelector('[data-release-benchmark-panel]', {
    timeout: 60_000,
  });
  await page.getByLabel('Benchmark device label').fill('CI software renderer');
  await page
    .getByLabel('Benchmark rendering quality')
    .selectOption('low');

  await page
    .getByRole('button', { name: 'Run Calm release benchmark' })
    .click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-release-benchmark-panel]')
        ?.getAttribute('data-benchmark-phase') === 'measuring',
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForSelector('[data-benchmark-result]', {
    timeout: 75_000,
  });

  const downloadPromise = page.waitForEvent('download', {
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Export benchmark JSON' }).click();
  const download = await downloadPromise;
  const reportPath = path.join(
    artifactDirectory,
    'hardware-benchmark-report.json',
  );
  await download.saveAs(reportPath);
  downloadedReport = JSON.parse(await fs.readFile(reportPath, 'utf8'));

  await page.screenshot({
    path: path.join(artifactDirectory, 'hardware-benchmark-panel.png'),
    fullPage: false,
  });
} catch (error) {
  flowError = error instanceof Error ? error.stack ?? error.message : String(error);
}

const result = downloadedReport?.results?.[0] ?? null;
const checks = {
  responseOk: responseStatus === 200,
  reportDownloaded: downloadedReport !== null,
  schemaVersion: downloadedReport?.schemaVersion === 1,
  calmPreset: result?.preset === 'calm',
  lowQuality: result?.qualityMode === 'low',
  enoughSamples: Number(result?.samples) >= 45,
  visibleTabRun: result?.hiddenSamples === 0,
  validRun: result?.valid === true,
  finiteAverageFps:
    Number.isFinite(result?.averageFps) && result.averageFps > 0,
  finiteMinimumFps:
    Number.isFinite(result?.minimumFps) && result.minimumFps > 0,
  deviceLabel: result?.device?.label === 'CI software renderer',
  rendererCaptured:
    typeof result?.device?.gpuRenderer === 'string' &&
    result.device.gpuRenderer.length > 0,
};

const severeConsoleEntries = consoleEntries.filter((entry) =>
  ['error', 'assert'].includes(entry.type),
);
const passed =
  flowError === null &&
  Object.values(checks).every(Boolean) &&
  pageErrors.length === 0 &&
  severeConsoleEntries.length === 0 &&
  failedRequests.length === 0;

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  responseStatus,
  checks,
  result,
  consoleEntries,
  pageErrors,
  failedRequests,
  flowError,
  passed,
};

await fs.writeFile(
  path.join(artifactDirectory, 'hardware-benchmark-smoke.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify(summary, null, 2));
await context.close();
await browser.close();
if (!passed) process.exitCode = 1;
