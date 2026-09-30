import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import fs from 'node:fs';
import {loadCity} from './load-city.mjs';
import {installTestTerrain} from './install-test-terrain.mjs';
import {decodeRoadGeometry} from '../road-geometry.js';
import {createLakeside,lakePoint,lakePolar,lakeMetric,LAKE_BOUNDS,LAKE_WATER,isLakeWater} from '../lakeside.js';
const {city,road}=loadCity();installTestTerrain(city);
const bytes=fs.readFileSync('assets/roads-rounded-v6.bin');road.geometry=decodeRoadGeometry(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const lake=createLakeside(city),planet=city.getObjectByName('Planet'),sand=city.getObjectByName('Planet_LakeShore'),water=city.getObjectByName('LakeWater');
const ray=new T.Raycaster(),up=new T.Vector3();let minSand=Infinity,maxTerrain=-Infinity,checks=0;
for(let i=0;i<72;i++)for(const q of [.05,.23,.42,.61,.79,.92,.97]){
 const [x,z]=lakePolar((i+.37)/72*Math.PI*2,q),p=lakePoint(x,z);up.copy(p).normalize();ray.set(up.clone().multiplyScalar(850),up.clone().negate());
 const land=ray.intersectObject(planet)[0],bed=ray.intersectObject(sand)[0],surface=ray.intersectObject(water)[0];assert.ok(land&&bed&&surface);
 minSand=Math.min(minSand,bed.point.length()-land.point.length());maxTerrain=Math.max(maxTerrain,land.point.length());
 assert.ok(isLakeWater(p)||Math.abs(x-28)<15,'Expanded water must block walking');checks++;
}
console.log({checks,minSand,maxTerrain});
let roadIntrusions=0,buildingIntrusions=0;
for(const g of road.geometry.groups){if(!['City_Road','City_Sidewalk'].includes(road.material[g.materialIndex].name))continue;for(let i=g.start;i<g.start+g.count;i++){const p=new T.Vector3().fromBufferAttribute(road.geometry.attributes.position,i).applyMatrix4(road.matrixWorld);if(lakeMetric(p)<1.01)roadIntrusions++;}}
city.traverse(o=>{if(!o.isMesh||!/^Bld/.test(o.name))return;for(let i=0;i<o.geometry.attributes.position.count;i++){const p=new T.Vector3().fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(o.matrixWorld);if(lakeMetric(p)<1)buildingIntrusions++;}});
assert.equal(roadIntrusions,0);assert.equal(buildingIntrusions,0);
const boundary=a=>1+.075*Math.sin(3*a+.5)+.045*Math.cos(5*a-.7)+.025*Math.sin(7*a);
function area(rx,rz,cz){let n=0;for(let i=0;i<512;i++){const a=(i+.5)/512*Math.PI*2,b=boundary(a);for(let j=0;j<96;j++){const s=(j+.5)/96,x=rx*b*s*Math.cos(a),z=cz+rz*b*s*Math.sin(a);n+=rx*rz*b*b*s*Math.pow(1+(x*x+z*z)/360000,-1.5);}}return n*2*Math.PI/512/96*(LAKE_WATER/600)**2;}
const ratio=area(LAKE_BOUNDS.rx,LAKE_BOUNDS.rz,LAKE_BOUNDS.centerZ)/area(122,83,0);assert.ok(Math.abs(ratio-5)<.001);
assert.ok(water.material.transparent&&!water.material.depthWrite);assert.ok(city.getObjectByName('LakeFoam'));
for(const plant of lake.root.userData.underwaterPlants){assert.ok(plant.base+plant.height<LAKE_WATER,'Plants remain submerged');}
assert.ok(minSand>0,'Sand must cover original grassy terrain');
console.log(JSON.stringify({result:'PASS',areaRatio:ratio,roadIntrusions,buildingIntrusions,...lake.stats},null,2));
