import assert from 'node:assert/strict';
import {buildStylizedTree} from '../stylized-trees.js';
const counts=[];
for(const stride of [1,2,4]){
 const {geometry,trunk}=buildStylizedTree(817,stride);
 counts.push(geometry.attributes.position.count/3);
 assert.equal(trunk.attributes.position.count/3,168,'LOD must not change collision trunk');
 assert.ok(geometry.boundingBox.max.y>1&&geometry.boundingBox.max.y<1.4,'Retain crown coverage');
 for(const a of Object.values(geometry.attributes))assert.ok(a.array.every(Number.isFinite));
}
// Trunk stays fixed; compare the foliage budget independently of that fixed cost.
assert.ok(counts[1]-168<=(counts[0]-168)*.5&&counts[2]-168<=(counts[0]-168)*.25);
assert.ok(counts[0]<=2088&&counts[1]<=1128&&counts[2]<=648,'Do not exceed the previous total budgets');
console.log(JSON.stringify({result:'PASS',desktopNear:counts[0],mobileNear:counts[1],far:counts[2],farTriangleReduction:1-counts[2]/counts[0]},null,2));
