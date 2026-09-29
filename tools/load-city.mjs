import * as THREE from '../vendor/three.module.js';
import { FBXLoader } from '../vendor/loaders/FBXLoader.js';
import fs from 'node:fs';
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
export function loadCity() {
  const bytes = fs.readFileSync(new URL('../assets/planet-city.fbx', import.meta.url));
  const city = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  city.updateMatrixWorld(true);
  const center = new THREE.Vector3(), point = new THREE.Vector3();
  let road;
  city.traverse(o => {
    if (!o.isMesh) return;
    if (o.name === 'Roads') road = o;
    if (!/^Planet/i.test(o.name)) return;
    const p = o.geometry.attributes.position;
    for (let i=0;i<p.count;i++) center.add(point.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));
    center.divideScalar(p.count);
  });
  return { city, center, road };
}
