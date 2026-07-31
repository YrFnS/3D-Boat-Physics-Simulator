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
    context: {
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
  },
  {
    name: 'mobile',
    context: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
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

    const response = await page.goto(`${baseUrl}/?debug=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await page.waitForSelector('canvas', { timeout: 60_000 });
    await page.waitForTimeout(12_000);

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
      !responsiveChecksPass;

    hasFatalError ||= scenarioFailed;
    report.scenarios.push({
      name: scenario.name,
      responseStatus: response?.status() ?? null,
      runtime,
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
