import fs from 'node:fs';

const packagePath = 'package.json';
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

packageJson.dependencies = {
  ...packageJson.dependencies,
  sharp: '0.35.3',
};
packageJson.overrides = {
  ...(packageJson.overrides ?? {}),
  postcss: '$postcss',
  sharp: '$sharp',
};

fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
console.log('Pinned patched PostCSS and Sharp versions across the dependency graph.');
