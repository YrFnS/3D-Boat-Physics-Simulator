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

const MAXIMUM_DOMINANT_COLOR_RATIO = 0.55;

const report = {
  generatedAt: new Date().toISOString(),
  snapshots: [],
  passed: false,
};

function calculateDominantColorRatio(data, channels) {
  // Quantize RGB into 8 buckets per channel. This catches a viewport covered
  // by one large flat mesh (for example a cabin roof) without requiring exact
  // pixel equality, which would be too brittle across browser engines.
  const buckets = new Uint32Array(8 * 8 * 8);
  let dominantCount = 0;
  let pixelCount = 0;

  for (let offset = 0; offset + 2 < data.length; offset += channels) {
    const red = data[offset] >> 5;
    const green = data[offset + 1] >> 5;
    const blue = data[offset + 2] >> 5;
    const bucketIndex = (red << 6) | (green << 3) | blue;
    const count = (buckets[bucketIndex] += 1);
    if (count > dominantCount) dominantCount = count;
    pixelCount += 1;
  }

  return pixelCount > 0 ? dominantCount / pixelCount : 1;
}

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
        dominantColorRatio: 1,
        maximumDominantColorRatio: MAXIMUM_DOMINANT_COLOR_RATIO,
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
    const crop = sharp(filePath).extract({
      left,
      top,
      width: cropWidth,
      height: cropHeight,
    });
    const stats = await crop.clone().removeAlpha().stats();
    const raw = await crop.clone().removeAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    const channels = stats.channels.slice(0, 3);
    const meanDeviation =
      channels.reduce((total, channel) => total + channel.stdev, 0) /
      Math.max(1, channels.length);
    const dynamicRange = Math.max(
      ...channels.map((channel) => channel.max - channel.min),
    );
    const dominantColorRatio = calculateDominantColorRatio(
      raw.data,
      raw.info.channels,
    );
    const passed =
      Number.isFinite(stats.entropy) &&
      stats.entropy > 0.75 &&
      meanDeviation > 2.5 &&
      dynamicRange > 20 &&
      dominantColorRatio < MAXIMUM_DOMINANT_COLOR_RATIO;

    return {
      fileName,
      found: true,
      width,
      height,
      entropy: stats.entropy,
      meanDeviation,
      dynamicRange,
      dominantColorRatio,
      maximumDominantColorRatio: MAXIMUM_DOMINANT_COLOR_RATIO,
      passed,
      reason: passed
        ? null
        : dominantColorRatio >= MAXIMUM_DOMINANT_COLOR_RATIO
          ? 'One quantized color dominates the central 3D viewport; the camera may be inside or too close to a flat mesh.'
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
      dominantColorRatio: 1,
      maximumDominantColorRatio: MAXIMUM_DOMINANT_COLOR_RATIO,
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
