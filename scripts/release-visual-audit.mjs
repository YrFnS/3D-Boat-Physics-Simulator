import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const artifactDirectory = path.resolve('artifacts/release-validation');
const expectedSnapshots = [
  'chromium-product.png',
  'chromium-physics.png',
  'firefox-product.png',
  'firefox-physics.png',
  'webkit-product.png',
  'webkit-physics.png',
  'chromium-mobile.png',
];

const report = {
  generatedAt: new Date().toISOString(),
  snapshots: [],
  passed: false,
};

async function auditSnapshot(fileName) {
  const filePath = path.join(artifactDirectory, fileName);

  try {
    const metadata = await sharp(filePath).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width < 16 || height < 16) {
      return {
        fileName,
        found: true,
        width,
        height,
        entropy: 0,
        meanDeviation: 0,
        dynamicRange: 0,
        passed: false,
        reason: 'Screenshot dimensions are invalid.',
      };
    }

    // The central crop intentionally avoids most HUD chrome while retaining
    // the ocean, vessel, terrain, weather, and horizon rendered by WebGL.
    const left = Math.floor(width * 0.28);
    const top = Math.floor(height * 0.22);
    const cropWidth = Math.max(1, Math.floor(width * 0.44));
    const cropHeight = Math.max(1, Math.floor(height * 0.56));
    const stats = await sharp(filePath)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .removeAlpha()
      .stats();
    const channels = stats.channels.slice(0, 3);
    const meanDeviation =
      channels.reduce((total, channel) => total + channel.stdev, 0) /
      Math.max(1, channels.length);
    const dynamicRange = Math.max(
      ...channels.map((channel) => channel.max - channel.min),
    );
    const passed =
      Number.isFinite(stats.entropy) &&
      stats.entropy > 0.75 &&
      meanDeviation > 2.5 &&
      dynamicRange > 20;

    return {
      fileName,
      found: true,
      width,
      height,
      entropy: stats.entropy,
      meanDeviation,
      dynamicRange,
      passed,
      reason: passed
        ? null
        : 'Central 3D viewport is too uniform and may be blank or unrendered.',
    };
  } catch (error) {
    return {
      fileName,
      found: false,
      width: 0,
      height: 0,
      entropy: 0,
      meanDeviation: 0,
      dynamicRange: 0,
      passed: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

for (const fileName of expectedSnapshots) {
  report.snapshots.push(await auditSnapshot(fileName));
}

report.passed = report.snapshots.every((snapshot) => snapshot.passed);
await fs.mkdir(artifactDirectory, { recursive: true });
await fs.writeFile(
  path.join(artifactDirectory, 'visual-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
