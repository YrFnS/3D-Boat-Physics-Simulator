import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.DIAGNOSTIC_BASE_URL ?? 'http://127.0.0.1:3000';
const outputDirectory = path.resolve('artifacts/phase5c-propulsion-diagnostics');
await fs.mkdir(outputDirectory, { recursive: true });

const probes = [
  { vessel: 'trawler', scenario: 'speed' },
  { vessel: 'trawler', scenario: 'turn' },
  { vessel: 'speedboat', scenario: 'speed' },
  { vessel: 'speedboat', scenario: 'turn' },
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
  probes: [],
};

try {
  for (const probe of probes) {
    const context = await browser.newContext({
      viewport: { width: 960, height: 640 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const url = new URL(baseUrl);
    url.searchParams.set('debug', '1');
    url.searchParams.set('calibration', probe.scenario);
    url.searchParams.set('vessel', probe.vessel);

    const response = await page.goto(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForSelector('canvas', { timeout: 60_000 });
    await page.waitForFunction(
      () => document.documentElement.dataset.simReady === '1',
      { timeout: 60_000 },
    );

    const samples = [];
    let nextSampleTime = 2;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const sample = await page.evaluate(() => {
        const dataset = document.documentElement.dataset;
        const read = (key) => {
          const value = Number(dataset[key]);
          return Number.isFinite(value) ? value : null;
        };
        return {
          ready: dataset.simReady === '1',
          calibrationReady: dataset.simCalibrationReady === '1',
          calibrationPassed: dataset.simCalibrationPassed === '1',
          simulationTime: read('simTime'),
          speedMps: read('simLinearSpeed'),
          boatY: read('simBoatY'),
          submergedRatio: read('simSubmergedRatio'),
          engineRpm: read('simEngineRpm'),
          shaftRpm: read('simShaftRpm'),
          deliveredShaftPowerKw: read('simDeliveredShaftPowerKw'),
          absorbedShaftPowerKw: read('simAbsorbedShaftPowerKw'),
          propellerThrustN: read('simPropellerThrustN'),
          advanceRatio: read('simPropellerAdvanceRatio'),
          loadRatio: read('simPropellerLoadRatio'),
          cavitationFactor: read('simCavitationFactor'),
          ventilationFactor: read('simVentilationFactor'),
          propWashSpeedMps: read('simPropWashSpeedMps'),
          rudderAngleDeg: read('simRudderAngleDeg'),
          rudderForceN: read('simRudderForceN'),
          rudderFlowSpeedMps: read('simRudderFlowSpeedMps'),
          rudderAngleOfAttackDeg: read('simRudderAngleOfAttackDeg'),
          calibrationResult: dataset.simCalibrationResult ?? null,
        };
      });

      if (
        sample.simulationTime !== null &&
        sample.simulationTime + 1e-6 >= nextSampleTime
      ) {
        samples.push(sample);
        nextSampleTime += 2;
      }
      if (sample.calibrationReady) {
        if (samples.at(-1)?.simulationTime !== sample.simulationTime) {
          samples.push(sample);
        }
        break;
      }
      await page.waitForTimeout(80);
    }

    const finalSample = samples.at(-1) ?? null;
    let calibrationResult = null;
    if (finalSample?.calibrationResult) {
      try {
        calibrationResult = JSON.parse(finalSample.calibrationResult);
      } catch {
        calibrationResult = null;
      }
    }

    report.probes.push({
      ...probe,
      responseStatus: response?.status() ?? null,
      samples,
      calibrationResult,
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

for (const probe of report.probes) {
  const active = probe.samples.filter(
    (sample) => Math.abs(sample.shaftRpm ?? 0) > 1,
  );
  const lastActive = active.at(-1) ?? null;
  const minimumVentilation = active.reduce(
    (minimum, sample) => Math.min(minimum, sample.ventilationFactor ?? 1),
    1,
  );
  const minimumCavitation = active.reduce(
    (minimum, sample) => Math.min(minimum, sample.cavitationFactor ?? 1),
    1,
  );
  const maximumThrust = active.reduce(
    (maximum, sample) => Math.max(maximum, Math.abs(sample.propellerThrustN ?? 0)),
    0,
  );
  console.log(JSON.stringify({
    vessel: probe.vessel,
    scenario: probe.scenario,
    samples: probe.samples.length,
    lastActive,
    minimumVentilation,
    minimumCavitation,
    maximumThrust,
    calibrationPassed: probe.calibrationResult?.passed ?? null,
    metrics: probe.calibrationResult?.metrics ?? null,
  }));
}
