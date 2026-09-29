import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../vendor/three.module.js';
import { loadCity } from './load-city.mjs';
import { createLakeside, lakeMetric } from '../lakeside.js';
import { decodeRoadGeometry, installRoadGeometry, installJunctionFurniture } from '../road-geometry.js';
import { reduceSceneDensity, sceneMeshStats } from '../scene-density.js';
import { raiseGrassLevel } from '../grass-level.js';

const {city,road}=loadCity();
const bytes=fs.readFileSync('assets/roads-rounded-v5.bin');
installRoadGeometry(city,decodeRoadGeometry(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));
installJunctionFurniture(city,JSON.parse(fs.readFileSync('assets/junction-furniture-v2.json')));
createLakeside(city);reduceSceneDensity(city);
const planet=city.getObjectByName('Planet'),before=planet.geometry.attributes.position.array.slice(),roadBefore=road.geometry.attributes.position.array.slice();
const lake=city.getObjectByName('LakeWater').geometry, dock=city.getObjectByName('Planet_LakeDock').geometry;
const stats=raiseGrassLevel(city),pos=planet.geometry.attributes.position,walk=602+2.6/3;
let gapChecks=0,lakeChecks=0,roadChecks=0;
for(let i=0;i<pos.count;i++){
 const old=new T.Vector3().fromArray(before,i*3).applyMatrix4(planet.matrixWorld),now=new T.Vector3().fromBufferAttribute(pos,i).applyMatrix4(planet.matrixWorld);
 if(lakeMetric(old)>=1.8&&old.length()<walk){assert.ok(Math.abs((walk-now.length())-(walk-old.length())/3)<.0002);gapChecks++;}
 if(lakeMetric(old)<=1.45||old.length()>=walk){assert.ok(old.distanceTo(now)<1e-6);lakeChecks++;}
 assert.ok(old.clone().normalize().distanceTo(now.clone().normalize())<1e-6,'Keep terrain footprint');
}
for(const group of road.geometry.groups){
 if(!['City_Road','City_RoadLine','City_Sidewalk'].includes(road.material[group.materialIndex].name))continue;
 for(let i=group.start*3;i<(group.start+group.count)*3;i++){assert.equal(road.geometry.attributes.position.array[i],roadBefore[i]);roadChecks++;}
}
assert.equal(city.getObjectByName('LakeWater').geometry,lake);assert.equal(city.getObjectByName('Planet_LakeDock').geometry,dock);
assert.equal(sceneMeshStats(city).groundPlants,0);
assert.ok(!city.getObjectByName('Grass_0000'));
assert.deepEqual(raiseGrassLevel(city),stats,'Idempotent terrain edit');
console.log(JSON.stringify({result:'PASS',...stats,gapChecks,lakeChecks,roadChecks,remainingPlants:0},null,2));
