import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../vendor/three.module.js';
import { loadGrassModel } from '../meadow-plants.js';

const bytes = fs.readFileSync(new URL('../assets/trees/grass-v1.fbx', import.meta.url));
const model = loadGrassModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), new T.Texture());
const geo = model.geometry, box = geo.boundingBox;
assert.ok(geo.attributes.position.count > 0);
assert.ok(Math.abs(box.min.y) < 1e-5 && Math.abs(box.max.y - 1.155) < 1e-4);
assert.ok(geo.attributes.color && geo.attributes.color.count === geo.attributes.position.count);
assert.equal(model.material.name, 'HeartTownGrass');
assert.equal(model.material.alphaTest, .28);
console.log(JSON.stringify({result:'PASS',vertices:geo.attributes.position.count,height:+(box.max.y-box.min.y).toFixed(3),sourceSize:model.sourceSize,texture:'grass-v1-mask.png'},null,2));
