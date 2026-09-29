import * as T from 'three';

export function installSoftTerrain(city, geometry, placements) {
  const planet = city.getObjectByName('Planet');
  planet.geometry = geometry;
  for (const item of placements) {
    const mesh = city.getObjectByName(item.name);
    if (mesh) mesh.position.fromArray(item.position);
  }
  city.updateMatrixWorld(true);
}

// Average across duplicated FBX/material vertices, including the lake remesh.
export function smoothTerrainNormals(city) {
  const geo = city.getObjectByName('Planet').geometry;
  geo.computeVertexNormals();
  const pos = geo.attributes.position, normals = geo.attributes.normal, sums = new Map(), keys = [];
  for (let i = 0; i < pos.count; i++) {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map(v => Math.round(v * 10000)).join(',');
    keys.push(key);
    if (!sums.has(key)) sums.set(key, new T.Vector3());
    sums.get(key).add(new T.Vector3().fromBufferAttribute(normals, i));
  }
  for (const n of sums.values()) n.normalize();
  for (let i = 0; i < pos.count; i++) { const n = sums.get(keys[i]); normals.setXYZ(i, n.x, n.y, n.z); }
  normals.needsUpdate = true;
  return { vertices: pos.count, sharedNormals: sums.size };
}
