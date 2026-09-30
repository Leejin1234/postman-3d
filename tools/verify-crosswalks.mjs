import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../vendor/three.module.js';
import {loadCity} from './load-city.mjs';
import {buildRoundedJunctions} from '../rounded-junctions.js';
import {decodeRoadGeometry} from '../road-geometry.js';
const {road}=loadCity(),plan=buildRoundedJunctions(road);
const data=fs.readFileSync(new URL('../assets/roads-rounded-v6.bin',import.meta.url));
const geo=decodeRoadGeometry(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
const oldData=fs.readFileSync(new URL('../assets/roads-rounded-v5.bin',import.meta.url));
const old=decodeRoadGeometry(oldData.buffer.slice(oldData.byteOffset,oldData.byteOffset+oldData.byteLength));
function materialMesh(name){
 const group=geo.groups.find(g=>road.material[g.materialIndex].name===name),g=new T.BufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute(geo.attributes.position.array.slice(group.start*3,(group.start+group.count)*3),3));
 g.applyMatrix4(road.matrixWorld);const mesh=new T.Mesh(g,new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.updateMatrixWorld();return mesh;
}
for(const name of ['City_Road','City_Sidewalk','City_Curb']){
 const group=geo.groups.find(g=>road.material[g.materialIndex].name===name),before=old.groups.find(g=>road.material[g.materialIndex].name===name);
 assert.deepEqual(geo.attributes.position.array.slice(group.start*3,(group.start+group.count)*3),old.attributes.position.array.slice(before.start*3,(before.start+before.count)*3),'Ground and curb geometry must not change');
}
const paint=materialMesh('City_RoadLine'),asphalt=materialMesh('City_Road'),ray=new T.Raycaster();
const hit=(mesh,p)=>{ray.set(new T.Vector3(),p.clone().normalize());return ray.intersectObject(mesh,false);};
assert.equal(plan.crosswalks.length,26);
for(const [index,j] of plan.junctions.entries())assert.equal(plan.crosswalks.filter(c=>c.junction===index).length,j.arms.length>=3?j.arms.length:0);
let samples=0,minGap=Infinity,maxGap=-Infinity;
for(const crosswalk of plan.crosswalks){
 const road=plan.corridors[crosswalk.corridor];
 for(let stripe=0;stripe<9;stripe++)for(const t of [.15,.5,.85]){
   const p=road.at(crosswalk.from+(crosswalk.to-crosswalk.from)*t,-26+stripe*6.1+1.6,602);
   const a=hit(asphalt,p),b=hit(paint,p);assert.ok(a.length&&b.length,'Every crossing stripe must sit on asphalt');
   const gap=b[0].distance-a[0].distance;minGap=Math.min(minGap,gap);maxGap=Math.max(maxGap,gap);
   assert.ok(gap>.010&&gap<.015,'Crosswalk must conform to the underlying triangle');samples++;
 }
 for(let stripe=0;stripe<8;stripe++){
   const p=road.at((crosswalk.from+crosswalk.to)/2,-26+stripe*6.1+4.65,602);
   assert.equal(hit(paint,p).length,0,'No old lane paint may fill crosswalk gaps');
 }
}
console.log(JSON.stringify({result:'PASS',intersections:8,crosswalks:26,stripes:234,samples,minGap,maxGap},null,2));
