import fs from 'node:fs';
import { decodeRoadGeometry } from '../road-geometry.js';
import { installSoftTerrain } from '../soft-terrain.js';
export function installTestTerrain(city) {
  const bytes = fs.readFileSync(new URL('../assets/terrain-soft-v1.bin', import.meta.url));
  const geometry = decodeRoadGeometry(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const props = JSON.parse(fs.readFileSync(new URL('../assets/terrain-props-v1.json', import.meta.url)));
  installSoftTerrain(city, geometry, props);
}
