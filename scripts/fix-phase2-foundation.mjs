import fs from 'node:fs';

const boatPath = 'components/Boat.tsx';
let boat = fs.readFileSync(boatPath, 'utf8');
const staleSelection =
  "    const vessel = getVesselConfig(activeBoat);\n" +
  "    const isSpeedboat = vessel.type === 'speedboat';\n";

if (!boat.includes(staleSelection)) {
  throw new Error('Expected transformed vessel selection was not found.');
}

boat = boat.replace(
  staleSelection,
  "    const vessel = getVesselConfig(activeBoat);\n",
);
fs.writeFileSync(boatPath, boat);

console.log('Removed stale Phase 2 vessel selector local.');
