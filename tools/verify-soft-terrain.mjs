import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import { loadCity } from './load-city.mjs';
import { installTestTerrain } from './install-test-terrain.mjs';
import { createLakeside } from '../lakeside.js';
import { reduceSceneDensity, sceneMeshStats } from '../scene-density.js';
import { raiseGrassLevel } from '../grass-level.js';
import { smoothTerrainNormals } from '../soft-terrain.js';
const {city,road}=loadCity(),planet=city.getObjectByName('Planet'),roadGeometry=road.geometry;
installTestTerrain(city);
const pos=planet.geometry.attributes.position,edgeCounts=new Map();
const keys=Array.from({length:pos.count},(_,i)=>[pos.getX(i),pos.getY(i),pos.getZ(i)].map(v=>Math.round(v*10000)).join(','));
for(let i=0;i<pos.count;i+=3)for(let k=0;k<3;k++){
 const key=[keys[i+k],keys[i+(k+1)%3]].sort().join('|');edgeCounts.set(key,(edgeCounts.get(key)||0)+1);
}
assert.ok([...edgeCounts.values()].every(v=>v===2),'Subdivided sphere must be closed, with matching shared edges');
assert.equal(planet.geometry.groups.length,1,'Terrain color must not form per-face patches');
createLakeside(city);reduceSceneDensity(city);raiseGrassLevel(city);const stats=smoothTerrainNormals(city);
assert.equal(road.geometry.attributes.position.count,roadGeometry.attributes.position.count);
const final=planet.geometry.attributes.position,normals=planet.geometry.attributes.normal,shared=new Map();
let duplicateNormals=0;
for(let i=0;i<final.count;i++){
 const key=[final.getX(i),final.getY(i),final.getZ(i)].map(v=>Math.round(v*10000)).join(',');
 const n=new T.Vector3().fromBufferAttribute(normals,i);
 assert.ok(Number.isFinite(n.x)&&Math.abs(n.length()-1)<1e-5);
 if(shared.has(key)){assert.ok(shared.get(key).distanceTo(n)<1e-6,'No hard shading seams');duplicateNormals++;}else shared.set(key,n);
}
assert.equal(sceneMeshStats(city).groundPlants,0);
assert.ok(final.count/3<100000,'Keep the terrain triangle budget bounded');
console.log(JSON.stringify({result:'PASS',closedEdges:edgeCounts.size,...stats,triangles:final.count/3,duplicateNormals,plants:0,materialGroups:planet.geometry.groups.length},null,2));
