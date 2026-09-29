import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {loadCity} from './load-city.mjs';
import {installTestTerrain} from './install-test-terrain.mjs';
import {createLakeside} from '../lakeside.js';
import {reduceSceneDensity} from '../scene-density.js';
import {raiseGrassLevel} from '../grass-level.js';
import {roundSceneRocks} from '../rounded-rocks.js';
const {city}=loadCity();installTestTerrain(city);createLakeside(city);reduceSceneDensity(city);raiseGrassLevel(city);
const originals=new Map();city.traverse(o=>{if(o.isMesh&&/^Rock_/.test(o.name)){o.geometry.computeBoundingBox();originals.set(o.name,{box:o.geometry.boundingBox.clone(),matrix:o.matrixWorld.clone()});}});
const stats=roundSceneRocks(city);let checked=0;
city.traverse(o=>{
 if(!originals.has(o.name))return;const before=originals.get(o.name),box=o.geometry.boundingBox;
 assert.ok(o.matrixWorld.equals(before.matrix),'Preserve rock placement');
 assert.ok(Math.abs(box.min.z-before.box.min.z)<1e-6&&Math.abs(box.max.z-before.box.max.z)<1e-6,'Preserve base and height');
 assert.ok(box.min.x>=before.box.min.x-1e-6&&box.max.x<=before.box.max.x+1e-6);
 assert.ok(box.min.y>=before.box.min.y-1e-6&&box.max.y<=before.box.max.y+1e-6);
 const g=o.geometry,edges=new Map();
 assert.equal(g.attributes.mossPosition.count,g.attributes.position.count);
 assert.ok(g.attributes.mossPosition.array.every(v=>Number.isFinite(v)&&v>=0&&v<=1),'Moss coordinates stay on the stone');
 assert.ok(g.attributes.mossUp.array.some(v=>v>.5)&&g.attributes.mossUp.array.some(v=>v<-.5),'Moss distinguishes top and underside');
 for(let i=0;i<g.index.count;i+=3)for(let k=0;k<3;k++){const a=g.index.getX(i+k),b=g.index.getX(i+(k+1)%3),key=[a,b].sort((a,b)=>a-b).join(':');edges.set(key,(edges.get(key)||0)+1);}
 assert.ok([...edges.values()].every(n=>n===2),'Rocks must remain closed');
 const normal=new T.Vector3();for(let i=0;i<g.attributes.normal.count;i++)assert.ok(Math.abs(normal.fromBufferAttribute(g.attributes.normal,i).length()-1)<1e-5);
 assert.ok(g.index.count/3<=3000,'Bound subdivision cost');checked++;
});
assert.equal(checked,stats.rocks);console.log(JSON.stringify({result:'PASS',...stats,checked},null,2));
