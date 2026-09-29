import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildStylizedTree} from '../stylized-trees.js';
for(const name of ['a','b']){
 const png=fs.readFileSync(new URL(`../assets/trees/rei-leaves-${name}-512.png`,import.meta.url));
 assert.equal(png.readUInt32BE(16),512);assert.equal(png.readUInt32BE(20),512);
}
const counts=[],leafCounts=[];
for(const stride of [1,2,4]){
 const {geometry,trunk}=buildStylizedTree(817,stride);
 counts.push(geometry.attributes.position.count/3);
 leafCounts.push(geometry.attributes.position.count/3-168-geometry.userData.coreTriangles);
 assert.equal(trunk.attributes.position.count/3,168,'LOD must not change collision trunk');
 assert.ok(geometry.boundingBox.max.y>1&&geometry.boundingBox.max.y<1.4,'Retain crown coverage');
 for(const a of Object.values(geometry.attributes))assert.ok(a.array.every(Number.isFinite));
 const uv=geometry.attributes.uv,maskCounts=[0,0];
 for(let i=0;i<uv.count;i+=3){
   const u=uv.getX(i);if(u<0)continue;
   const mask=u>1.5?1:0;maskCounts[mask]++;
   for(let j=0;j<3;j++)assert.equal(uv.getX(i+j)>1.5?1:0,mask,'A leaf triangle must use one mask');
 }
 assert.ok(maskCounts.every(n=>n>0),'Both supplied masks must appear at every LOD');
}
// Trunk stays fixed; compare the foliage budget independently of that fixed cost.
assert.ok(leafCounts[1]<=leafCounts[0]*.5&&leafCounts[2]<=leafCounts[0]*.25);
assert.ok(counts[0]<=2088&&counts[1]<=1128&&counts[2]<=648,'Do not exceed the previous total budgets');
console.log(JSON.stringify({result:'PASS',desktopNear:counts[0],mobileNear:counts[1],far:counts[2],farTriangleReduction:1-counts[2]/counts[0]},null,2));
