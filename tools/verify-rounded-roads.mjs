import * as THREE from '../vendor/three.module.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadCity } from './load-city.mjs';
import { buildRoundedJunctions } from '../rounded-junctions.js';
import { decodeRoadGeometry, installJunctionFurniture } from '../road-geometry.js';

const { city, road } = loadCity();
const plan = buildRoundedJunctions(road);
assert.deepEqual([plan.stats.junctions, plan.stats.corners, plan.stats.corridors], [10, 30, 15]);
const bytes = fs.readFileSync(new URL('../assets/roads-rounded-v1.bin', import.meta.url));
const geometry = decodeRoadGeometry(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const positions = geometry.attributes.position, normals = geometry.attributes.normal;
let reversed = 0, invalid = 0, checkedFaces = 0;
for (let i = 0; i < positions.count; i += 3) {
  const [a, b, c] = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(positions, i + k));
  const face = b.sub(a).cross(c.sub(a));
  if (!a.toArray().concat(b.toArray(), c.toArray()).every(Number.isFinite)) invalid++;
  if (face.lengthSq() < 1e-18) continue;
  const normal = new THREE.Vector3().fromBufferAttribute(normals, i);
  if (face.dot(normal) < -1e-10) reversed++;
  checkedFaces++;
}
assert.equal(invalid, 0); assert.equal(reversed, 0, 'Face winding must agree with lighting');

function materialMesh(index) {
  const group = geometry.groups.find(g => g.materialIndex === index);
  const data = [];
  for (let i = group.start; i < group.start + group.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(road.matrixWorld);
    data.push(...p.toArray());
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(data, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true); return mesh;
}
const asphalt = materialMesh(0), sidewalk = materialMesh(2), ray = new THREE.Raycaster();
const origin = new THREE.Vector3();
let roadChecks = 0, walkChecks = 0, minGap = Infinity, maxGap = -Infinity;
function assertGround(p, mesh, label) {
  ray.set(origin, p.clone().normalize());
  let hits = ray.intersectObject(mesh, false);
  // A ray exactly on a shared Float32 seam can miss both adjacent faces. Probe
  // 0.0001 scene units on either side; never accept a visible-width opening.
  if (!hits.length) for (const axis of [new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)]) {
    ray.set(origin, p.clone().addScaledVector(axis, .0001).normalize());
    hits = ray.intersectObject(mesh, false);
    if (hits.length) break;
  }
  assert.ok(hits.length, label + ' must land on the intended surface: ' + p.toArray().join(','));
  return hits[0].distance;
}
// Follow every rounded corner through its full sweep, including reflex bends.
for (const [ji, junction] of plan.junctions.entries()) for (const [si, sector] of junction.sectors.entries()) {
  for (const [pi, p] of plan.sectorPath(sector, 20).entries()) { assertGround(plan.world(junction, p, 602), asphalt, `J${ji} turn ${si} sample ${pi} (${p.x},${p.y})`); roadChecks++; }
  for (const p of plan.sectorPath(sector, 53)) { assertGround(plan.world(junction, p, 604.6), sidewalk, `J${ji} sidewalk ${si}`); walkChecks++; }
}
for (const corridor of plan.corridors) for (let k = 0; k <= 20; k++) {
  const s = corridor.start + (corridor.end - corridor.start) * k / 20;
  const p = corridor.j.up.clone().multiplyScalar(Math.cos(s)).addScaledVector(corridor.arm.direction, Math.sin(s)).multiplyScalar(602);
  assertGround(p, asphalt, 'Corridor continuity'); roadChecks++;
}
// Sample paint throughout the entire planet, rather than just the initial view.
const paint = geometry.groups[1], stride = Math.max(1, Math.floor(paint.count / 3 / 1200));
for (let i = paint.start; i < paint.start + paint.count; i += 3 * stride) {
  const p = new THREE.Vector3();
  for (let k = 0; k < 3; k++) p.add(new THREE.Vector3().fromBufferAttribute(positions, i + k).applyMatrix4(road.matrixWorld));
  p.divideScalar(3);
  const gap = p.length() - assertGround(p, asphalt, 'Road paint');
  minGap = Math.min(minGap, gap); maxGap = Math.max(maxGap, gap);
}
assert.ok(minGap > 0.010 && maxGap < 0.015, `Paint clearance ${minGap}–${maxGap}`);
const placements = JSON.parse(fs.readFileSync(new URL('../assets/junction-furniture-v1.json', import.meta.url)));
installJunctionFurniture(city, placements);
for (const placement of placements) {
  const mesh = city.getObjectByName(placement.name), p = mesh.getWorldPosition(new THREE.Vector3());
  assertGround(p, sidewalk, 'Relocated ' + placement.name);
}
console.log(JSON.stringify({ junctions: 10, roundedCorners: 30, corridors: 15, checkedFaces,
  reversed, invalid, roadChecks, walkChecks, minPaintGap: minGap, maxPaintGap: maxGap,
  relocatedFurniture: placements.length, result: 'PASS' }, null, 2));
