import * as T from '../vendor/three.module.js';
import fs from 'node:fs';
import { deflateSync } from 'node:zlib';
import { loadCity } from './load-city.mjs';
const { city } = loadCity(), planet = city.getObjectByName('Planet');
const source = planet.geometry, verts = [], faces = [], lookup = new Map();
for (let i = 0; i < source.attributes.position.count; i += 3) {
  const ids = [];
  for (let k = 0; k < 3; k++) {
    const p = new T.Vector3().fromBufferAttribute(source.attributes.position, i + k).applyMatrix4(planet.matrixWorld);
    const key = p.toArray().map(v => Math.round(v * 1000)).join(',');
    if (!lookup.has(key)) { lookup.set(key, verts.length); verts.push(p); }
    ids.push(lookup.get(key));
  }
  faces.push(ids);
}
let triangles = faces;
function relax(iterations) {
  const neighbors = verts.map(() => new Set());
  for (const f of triangles) for (let k = 0; k < 3; k++) { neighbors[f[k]].add(f[(k+1)%3]); neighbors[f[(k+1)%3]].add(f[k]); }
  for (let pass = 0; pass < iterations; pass++) {
    const radii = verts.map(p => p.length());
    for (let i = 0; i < verts.length; i++) {
      // Flat land is pinned, preserving all street and building approaches.
      if (radii[i] < 600.05) continue;
      const mean = [...neighbors[i]].reduce((sum,j) => sum + radii[j],0) / neighbors[i].size;
      verts[i].setLength(T.MathUtils.lerp(radii[i], mean, .42));
    }
  }
}
relax(1);
for (let level = 0; level < 2; level++) {
  const mids = new Map(), next = [];
  function mid(a,b) {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (!mids.has(key)) {
      mids.set(key, verts.length);
      verts.push(verts[a].clone().add(verts[b]).setLength((verts[a].length()+verts[b].length())/2));
    }
    return mids.get(key);
  }
  for (const [a,b,c] of triangles) { const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a); next.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]); }
  triangles = next; relax(level === 0 ? 3 : 4);
}
const inverse=planet.matrixWorld.clone().invert(), positions=[];
for(const f of triangles) for(const i of f) positions.push(...verts[i].clone().applyMatrix4(inverse).toArray());
const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
geo.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));geo.computeVertexNormals();geo.addGroup(0,positions.length/3,0);
const surface=new T.Mesh(geo,new T.MeshBasicMaterial({side:T.DoubleSide}));surface.matrix.copy(planet.matrixWorld);surface.matrixAutoUpdate=false;surface.updateMatrixWorld(true);
const original=new T.Mesh(source,new T.MeshBasicMaterial({side:T.DoubleSide}));original.matrix.copy(planet.matrixWorld);original.matrixAutoUpdate=false;original.updateMatrixWorld(true);
const ray=new T.Raycaster(),placements=[];
city.traverse(mesh=>{
 if(!mesh.isMesh||! /^(Tree|Rock|Bld)_/.test(mesh.name))return;
 const pivot=mesh.getWorldPosition(new T.Vector3()),up=pivot.clone().normalize();
 ray.set(up.clone().multiplyScalar(850),up.clone().negate());
 const oldHit=ray.intersectObject(original,false)[0];if(!oldHit||oldHit.point.length()<600.1)return;
 const hit=ray.intersectObject(surface,false)[0];if(!hit)throw new Error('Terrain gap');
 const delta=hit.point.length()-oldHit.point.length();
 if(Math.abs(delta)>.01)placements.push({name:mesh.name,position:mesh.parent.worldToLocal(pivot.addScaledVector(up,delta)).toArray()});
});
const count=geo.attributes.position.count,header=28,buffer=new ArrayBuffer(header+count*32),data=new DataView(buffer);
data.setUint32(0,0x524a3031,true);data.setUint32(4,count,true);data.setUint32(8,1,true);data.setUint32(12,1,true);data.setUint32(16,0,true);data.setUint32(20,count,true);data.setUint32(24,0,true);
let offset=header;for(const key of ['position','normal','uv']){new Float32Array(buffer,offset,geo.attributes[key].array.length).set(geo.attributes[key].array);offset+=geo.attributes[key].array.byteLength;}
const compressed=deflateSync(Buffer.from(buffer),{level:9});
fs.writeFileSync('assets/terrain-soft-v1.bin',compressed);
fs.writeFileSync('assets/terrain-props-v1.json',JSON.stringify(placements));
const report={originalTriangles:faces.length,triangles:triangles.length,vertices:verts.length,drawGroups:1,adjustedProps:placements.length,bytes:compressed.length,maxRadius:Math.max(...verts.map(p=>p.length()))};
fs.writeFileSync('assets/terrain-soft-report.json',JSON.stringify(report,null,2));console.log(report);
