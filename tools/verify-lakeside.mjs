import {loadCity} from './load-city.mjs';
import {createLakeside,lakePoint,lakeMetric,isLakeWater} from '../lakeside.js';
import * as T from '../vendor/three.module.js';
import assert from 'node:assert/strict';
const {city,road}=loadCity();
const buildings=[];city.traverse(o=>{if(/^Bld/.test(o.name))buildings.push({o,matrix:o.matrixWorld.clone()});if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.side=T.DoubleSide;});
const roadGeometry=road.geometry,planet=city.getObjectByName('Planet');
const lake=createLakeside(city);assert.equal(road.geometry,roadGeometry);for(const b of buildings)assert.ok(b.matrix.equals(b.o.matrixWorld),'Building must not move');
const ray=new T.Raycaster();let samples=0,maxBed=-Infinity;
for(let x=-125;x<=125;x+=5)for(let z=-90;z<=90;z+=5){const p=lakePoint(x,z),q=lakeMetric(p);if(q>.97)continue;const u=p.clone().normalize();ray.set(u.clone().multiplyScalar(850),u.clone().negate());const hit=ray.intersectObject(planet)[0];assert.ok(hit,'Lake basin must stay watertight');assert.ok(hit.point.length()<599.4,`Submerged lake floor at ${x},${z}: ${hit.point.length()}`);samples++;maxBed=Math.max(maxBed,hit.point.length());}
const dock=city.getObjectByName('Planet_LakeDock');for(let z=40;z<=98;z+=2){const p=lakePoint(28,z),u=p.clone().normalize();assert.equal(isLakeWater(p),false);ray.set(u.clone().multiplyScalar(850),u.clone().negate());const h=ray.intersectObject(dock)[0];assert.ok(h&&h.point.length()>601.8&&h.point.length()<603,'Continuous dock deck');}
for(const[x,z]of[[0,0],[-45,-8],[40,-25],[20,60],[36,60]])assert.ok(isLakeWater(lakePoint(x,z)),'Water must block walking');
let invalid=0;city.traverse(o=>{if(!o.isMesh)return;for(const name of['position','normal']){const a=o.geometry.attributes[name];if(a)for(const v of a.array)if(!Number.isFinite(v))invalid++;}});assert.equal(invalid,0);
for(const t of[0,1,10,30])lake.update(t);
console.log(JSON.stringify({result:'PASS',...lake.stats,basinSamples:samples,maxBed,buildingsUnchanged:buildings.length,invalid},null,2));

