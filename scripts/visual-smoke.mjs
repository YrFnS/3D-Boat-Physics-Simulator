import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';
const outputDirectory = path.resolve('artifacts/visual-smoke');
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
      const horizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      const verticalOverflow = document.documentElement.scrollHeight > window.innerHeight + 1;
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
        hasFpsReadout: /\bFPS\b/.test(visibleText),
        hasBenchmarkControls:
          /\bBenchmark\b/.test(visibleText) &&
          /\bCalm\b/.test(visibleText) &&
          /\bStorm\b/.test(visibleText),
      };
    });

    const screenshotPath = path.join(outputDirectory, `${scenario.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const severeConsoleEntries = consoleEntries.filter((entry) =>
      ['error', 'assert'].includes(entry.type),
    );
    const scenarioFailed =
      !response?.ok() ||
      pageErrors.length > 0 ||
      severeConsoleEntries.length > 0 ||
      !runtime.canvas ||
      runtime.horizontalOverflow;

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
