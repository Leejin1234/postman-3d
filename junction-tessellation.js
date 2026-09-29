import * as THREE from 'three';

// Keep boundary samples and split BOTH owners of an interior edge. Independently
// projecting a long edge and its subdivided neighbour onto a sphere opens cracks.
export function tessellateJunction(polygon, maxEdge = 12) {
  const points = polygon.map(p => p.clone()), faces = new Map(), edges = new Map();
  let nextFace = 0;
  const key = (a, b) => a < b ? `${a},${b}` : `${b},${a}`;
  const area = (a, b, c) => (points[b].x - points[a].x) * (points[c].y - points[a].y)
    - (points[b].y - points[a].y) * (points[c].x - points[a].x);
  function add(a, b, c) {
    const cross = area(a, b, c);
    if (Math.abs(cross) < 1e-10) return;
    if (cross < 0) [b, c] = [c, b];
    const id = nextFace++, face = [a, b, c];
    faces.set(id, face);
    for (let i = 0; i < 3; i++) {
      const k = key(face[i], face[(i + 1) % 3]);
      if (!edges.has(k)) edges.set(k, new Set());
      edges.get(k).add(id);
    }
  }
  function remove(id) {
    const face = faces.get(id);
    for (let i = 0; i < 3; i++) {
      const k = key(face[i], face[(i + 1) % 3]), owners = edges.get(k);
      owners.delete(id);
      if (!owners.size) edges.delete(k);
    }
    faces.delete(id);
  }
  function split(a, b, mid) {
    const owners = [...(edges.get(key(a, b)) || [])];
    for (const id of owners) {
      const c = faces.get(id).find(v => v !== a && v !== b);
      remove(id); add(a, mid, c); add(mid, b, c);
    }
  }
  for (const face of THREE.ShapeUtils.triangulateShape(points, [])) add(...face);
  // Earcut may omit collinear boundary samples (notably the straight road mouths).
  // Reinsert them before refinement so curb and corridor edges match exactly.
  for (let v = 0; v < polygon.length; v++) {
    for (const k of [...edges.keys()]) {
      const [a, b] = k.split(',').map(Number);
      if (v === a || v === b || !edges.has(k)) continue;
      const ab = points[b].clone().sub(points[a]), av = points[v].clone().sub(points[a]);
      const t = av.dot(ab) / ab.lengthSq();
      if (t > 1e-9 && t < 1 - 1e-9 && Math.abs(ab.cross(av)) < 1e-7) split(a, b, v);
    }
  }
  const quality = (a, b, c) => Math.abs(area(a, b, c)) / (points[a].distanceToSquared(points[b])
    + points[b].distanceToSquared(points[c]) + points[c].distanceToSquared(points[a]));
  function improve() {
    for (let pass = 0; pass < 20; pass++) {
      let flips = 0;
      for (const k of [...edges.keys()]) {
        const owners = edges.get(k);
        if (owners?.size !== 2) continue;
        const [a, b] = k.split(',').map(Number), [first, second] = [...owners];
        const c = faces.get(first).find(v => v !== a && v !== b);
        const d = faces.get(second).find(v => v !== a && v !== b);
        if (edges.has(key(c, d)) || area(c, d, a) * area(c, d, b) >= -1e-12) continue;
        if (Math.min(quality(c, d, a), quality(c, d, b)) <= Math.min(quality(a, b, c), quality(a, b, d)) + 1e-8) continue;
        remove(first); remove(second); add(c, d, a); add(d, c, b); flips++;
      }
      if (!flips) return;
    }
  }
  improve();
  for (let pass = 0; pass < 30; pass++) {
    let splits = 0;
    for (const k of [...edges.keys()]) {
      // Boundary samples are also used by the curb and straight road, so retain them.
      if (edges.get(k)?.size !== 2) continue;
      const [a, b] = k.split(',').map(Number);
      if (points[a].distanceToSquared(points[b]) <= maxEdge * maxEdge) continue;
      const mid = points.length;
      points.push(points[a].clone().lerp(points[b], .5));
      split(a, b, mid); splits++;
    }
    if (!splits) { improve(); return { points, triangles: [...faces.values()] }; }
  }
  throw new Error('Junction edge refinement did not converge');
}
