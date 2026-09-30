import * as THREE from 'three';
import { tessellateJunction } from './junction-tessellation.js';

const BASE = 600, ROAD = 602, ORIGINAL_WALK = 604.6;
const WALK = ROAD + (ORIGINAL_WALK - ROAD) / 3;
const HALF = 35, OUTER = 65, CURB = 36.4;
const TAU = Math.PI * 2;
const v2 = (x = 0, y = 0) => new THREE.Vector2(x, y);
const left = d => v2(-d.y, d.x);

// Used by the offline baker. Derive the graph from the real FBX strip boundaries,
// so junctions on the back of the planet receive exactly the same treatment.
export function buildRoundedJunctions(mesh) {
  mesh.updateWorldMatrix(true, false);
  const source = mesh.geometry;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const materialIndex = name => mats.findIndex(m => m.name === name);
  const roadIndex = materialIndex('City_Road'), lineIndex = materialIndex('City_RoadLine');
  const walkIndex = materialIndex('City_Sidewalk'), curbIndex = materialIndex('City_Curb');
  if ([roadIndex, lineIndex, walkIndex, curbIndex].some(i => i < 0)) throw new Error('Missing road material groups');
  const vertexMap = new Map(), vertices = [], edges = new Map();
  const read = i => new THREE.Vector3().fromBufferAttribute(source.attributes.position,
    source.index ? source.index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
  for (const group of source.groups) {
    if (group.materialIndex !== roadIndex) continue;
    for (let i = group.start; i < group.start + group.count; i += 3) {
      const ids = [0, 1, 2].map(k => {
        const p = read(i + k), key = p.toArray().map(x => Math.round(x * 100)).join(',');
        if (!vertexMap.has(key)) { vertexMap.set(key, vertices.length); vertices.push(p); }
        return vertexMap.get(key);
      });
      for (let k = 0; k < 3; k++) {
        const a = ids[k], b = ids[(k + 1) % 3], key = [a, b].sort((a, b) => a - b).join(',');
        if (!edges.has(key)) edges.set(key, { a, b, count: 0 });
        edges.get(key).count++;
      }
    }
  }
  const adjacency = new Map();
  for (const { a, b, count } of edges.values()) {
    if (count !== 1) continue;
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!adjacency.has(x)) adjacency.set(x, []);
      adjacency.get(x).push(y);
    }
  }
  const corners = new Set();
  for (const [id, ns] of adjacency) {
    if (ns.length !== 2) throw new Error('Road boundary is not a closed strip');
    const p = vertices[id], up = p.clone().normalize();
    const ds = ns.map(n => { const d = vertices[n].clone().sub(p); return d.addScaledVector(up, -d.dot(up)).normalize(); });
    if (ds[0].dot(ds[1]) > Math.cos(160 * Math.PI / 180)) corners.add(id);
  }
  const junctions = [];
  for (const id of corners) {
    const across = adjacency.get(id).find(n => corners.has(n));
    if (across === undefined || across < id) continue;
    const p = vertices[id].clone().add(vertices[across]).multiplyScalar(0.5);
    let junction = junctions.find(j => j.origin.distanceTo(p) < 0.05);
    if (!junction) {
      const up = p.clone().normalize();
      const x = new THREE.Vector3(1, 0, 0).addScaledVector(up, -up.x).normalize();
      junction = { origin: p, up, x, y: new THREE.Vector3().crossVectors(up, x).normalize(), arms: [], sectors: [] };
      junctions.push(junction);
    }
    const next = adjacency.get(id).find(n => n !== across);
    const direction = vertices[next].clone().sub(vertices[id]);
    direction.addScaledVector(junction.up, -direction.dot(junction.up)).normalize();
    junction.arms.push({ direction, cut: 90 });
  }
  // Replace the boundary-edge estimate with the exact great-circle tangent.
  for (const j of junctions) for (const arm of j.arms) {
    let best, score = -1;
    for (const other of junctions) {
      if (other === j) continue;
      const d = other.up.clone().addScaledVector(j.up, -other.up.dot(j.up)).normalize();
      const dot = d.dot(arm.direction);
      if (dot > score) { score = dot; best = other; }
    }
    if (score < 0.998) throw new Error('Cannot pair source road endpoints');
    arm.destination = best;
    arm.direction.copy(best.up).addScaledVector(j.up, -best.up.dot(j.up)).normalize();
    arm.d = v2(arm.direction.dot(j.x), arm.direction.dot(j.y)).normalize();
    arm.angle = Math.atan2(arm.d.y, arm.d.x);
  }
  for (const j of junctions) {
    j.arms.sort((a, b) => a.angle - b.angle);
    for (let i = 0; i < j.arms.length; i++) {
      const a = j.arms[i], b = j.arms[(i + 1) % j.arms.length];
      const gap = (b.angle - a.angle + TAU) % TAU;
      const sign = gap < Math.PI ? 1 : -1;
      // A 50-unit road radius leaves a 20-unit radius at the outer sidewalk edge.
      // Reflex sectors form the outside of a bend and use the concentric radius.
      const h = sign * (HALF + 50);
      const t = h / Math.tan(gap / 2);
      const bisector = v2(Math.cos(a.angle + gap / 2), Math.sin(a.angle + gap / 2));
      const center = bisector.multiplyScalar(h / Math.sin(gap / 2));
      a.cut = Math.max(a.cut, t + 16); b.cut = Math.max(b.cut, t + 16);
      j.sectors.push({ a, b, gap, sweep: gap - Math.PI, h, t, center });
    }
  }
  const world = (j, p, radius) => j.up.clone().multiplyScalar(BASE)
    .addScaledVector(j.x, p.x).addScaledVector(j.y, p.y).normalize().multiplyScalar(radius);
  const mouth = (arm, width) => arm.d.clone().multiplyScalar(arm.cut)
    .addScaledVector(left(arm.d), width * Math.sqrt(1 + (arm.cut / BASE) ** 2));
  function sectorPath(sector, width) {
    const { a, b, t, center, h, sweep } = sector;
    const start = mouth(a, width), end = mouth(b, -width);
    const ta = a.d.clone().multiplyScalar(t).addScaledVector(left(a.d), width);
    const tb = b.d.clone().multiplyScalar(t).addScaledVector(left(b.d), -width);
    // Identical sample counts across all widths keep road, curb and paint aligned.
    const nA = Math.max(1, Math.ceil((a.cut - t) / 5));
    const nB = Math.max(1, Math.ceil((b.cut - t) / 5));
    const nArc = Math.max(4, Math.ceil(Math.abs(sweep) * Math.max(Math.abs(h - 28), Math.abs(h - OUTER)) / 4));
    const points = [];
    for (let k = 0; k < nA; k++) points.push(start.clone().lerp(ta, k / nA));
    const r = ta.clone().sub(center);
    for (let k = 0; k <= nArc; k++) {
      const angle = sweep * k / nArc, c = Math.cos(angle), s = Math.sin(angle);
      points.push(v2(center.x + r.x * c - r.y * s, center.y + r.x * s + r.y * c));
    }
    for (let k = 1; k <= nB; k++) points.push(tb.clone().lerp(end, k / nB));
    return points;
  }
  const buffers = mats.map(() => ({ position: [], normal: [], uv: [] }));
  const inverse = mesh.matrixWorld.clone().invert();
  const normalToLocal = new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld).transpose();
  const local = p => {
    const q = p.clone().applyMatrix4(inverse);
    return q.set(Math.fround(q.x), Math.fround(q.y), Math.fround(q.z));
  };
  function triangle(index, a, b, c, uv = [[0, 0], [0, 0], [0, 0]]) {
    const la = local(a), lb = local(b), lc = local(c);
    const outward = a.clone().add(b).add(c).normalize().applyMatrix3(normalToLocal).normalize();
    const face = lb.clone().sub(la).cross(lc.clone().sub(la));
    if (face.lengthSq() < 1e-18) return;
    const flip = face.dot(outward) < 0;
    const points = [la, lb, lc], order = flip ? [0, 2, 1] : [0, 1, 2];
    // Vertical curb skirts need their actual face normal, not a radial road
    // normal. Quantize first so tiny faces cannot flip after GPU conversion.
    const normal = face.normalize().multiplyScalar(flip ? -1 : 1);
    for (const id of order) {
      const p = points[id];
      buffers[index].position.push(...p.toArray());
      const shadingNormal = index === roadIndex
        ? [a, b, c][id].clone().normalize().applyMatrix3(normalToLocal).normalize() : normal;
      buffers[index].normal.push(...shadingNormal.toArray());
      buffers[index].uv.push(...uv[id]);
    }
  }
  const quad = (index, a, b, c, d, u0 = 0, u1 = 1) => {
    // Follow the curb, including bends, instead of projecting joints on world axes.
    const v = index === curbIndex ? a.distanceTo(d) / 4 : 0;
    const uv = index === curbIndex ? [[u0, 0], [u1, 0], [u1, v], [u0, v]] : [[0, 0], [0, 0], [0, 0], [0, 0]];
    triangle(index, a, b, c, uv.slice(0, 3));
    triangle(index, a, c, d, [uv[0], uv[2], uv[3]]);
  };
  function ribbon(j, pathA, pathB, radiusA, radiusB, index) {
    const lengths = pathA.slice(1).map((p, k) => world(j, p, WALK).distanceTo(world(j, pathA[k], WALK)));
    const total = lengths.reduce((a, b) => a + b, 0);
    const repeats = Math.max(1, Math.round(total / 4));
    let along = 0;
    for (let k = 0; k < pathA.length - 1; k++) {
      quad(index, world(j, pathA[k], radiusA), world(j, pathA[k + 1], radiusA),
        world(j, pathB[k + 1], radiusB), world(j, pathB[k], radiusB), along / total * repeats, (along + lengths[k]) / total * repeats);
      along += lengths[k];
    }
  }
  for (const j of junctions) {
    const outline = [];
    for (const sector of j.sectors) {
      const front = sectorPath(sector, HALF), curb = sectorPath(sector, CURB), back = sectorPath(sector, OUTER);
      outline.push(...front);
      // Match all seven 10-unit strips at the adjoining corridor mouth.
      for (let width = -HALF + 10; width < HALF; width += 10) outline.push(mouth(sector.b, width));
      ribbon(j, front, back, WALK, WALK, walkIndex);
      ribbon(j, front, front, ROAD, WALK, curbIndex);
      ribbon(j, front, curb, WALK + 0.02, WALK + 0.02, curbIndex);
      ribbon(j, back, back, WALK, 600, curbIndex);
      ribbon(j, back, sectorPath(sector, OUTER - (CURB - HALF)), WALK + .02, WALK + .02, curbIndex);
      ribbon(j, sectorPath(sector, 28.3), sectorPath(sector, 30.7), ROAD + 0.02, ROAD + 0.02, lineIndex);
    }
    // Earcut also handles the outside of two-arm bends where the origin need not
    // lie inside the drivable polygon. A fan at the origin would create overlaps.
    const polygon = outline.filter((p, i) => !i || p.distanceToSquared(outline[i - 1]) > 1e-12);
    const tessellation = tessellateJunction(polygon);
    for (const [a, b, c] of tessellation.triangles) {
      triangle(roadIndex, ...[a, b, c].map(i => world(j, tessellation.points[i], ROAD)));
    }
    j.outline = polygon;
  }
  const corridors = [], crosswalks = [];
  for (let ji = 0; ji < junctions.length; ji++) for (const arm of junctions[ji].arms) {
    const j = junctions[ji], other = arm.destination, oi = junctions.indexOf(other);
    if (oi < ji) continue;
    const reverse = other.arms.find(a => a.destination === j);
    if (!reverse) throw new Error('Road graph is not reciprocal');
    const angle = Math.acos(THREE.MathUtils.clamp(j.up.dot(other.up), -1, 1));
    const start = Math.atan(arm.cut / BASE), end = angle - Math.atan(reverse.cut / BASE);
    if (end <= start) throw new Error('Rounded junctions overlap along a road');
    const side = new THREE.Vector3().crossVectors(j.up, arm.direction).normalize();
    function at(s, width, radius) {
      return j.up.clone().multiplyScalar(Math.cos(s) * BASE)
        .addScaledVector(arm.direction, Math.sin(s) * BASE).addScaledVector(side, width).normalize().multiplyScalar(radius);
    }
    const crossings=[];
    // Put one crossing at every mouth of a true intersection. Two-arm bends
    // stay unmarked. Use the same great-circle coordinates as the asphalt.
    if(j.arms.length>=3)crossings.push({junction:ji,from:start+4/BASE,to:start+20/BASE});
    if(other.arms.length>=3)crossings.push({junction:oi,from:end-20/BASE,to:end-4/BASE});
    if(crossings.length===2&&crossings[0].to+4/BASE>crossings[1].from)throw new Error('Crosswalks overlap');
    for(const crossing of crossings){
      if(crossing.from<start||crossing.to>end)throw new Error('Crosswalk exceeds road corridor');
      for(let stripe=0;stripe<9;stripe++){
        const w=-26+stripe*6.1;
        quad(lineIndex,at(crossing.from,w,ROAD),at(crossing.to,w,ROAD),
          at(crossing.to,w+3.2,ROAD),at(crossing.from,w+3.2,ROAD));
      }
      crosswalks.push({...crossing,corridor:corridors.length,stripes:9,
        position:at((crossing.from+crossing.to)/2,0,ROAD).toArray()});
    }
    const count = Math.ceil((end - start) * BASE / 8);
    const curbRepeats = Math.max(1, Math.round((end - start) * WALK / 4));
    for (let k = 0; k < count; k++) {
      const a = start + (end - start) * k / count, b = start + (end - start) * (k + 1) / count;
      for (let w = -HALF; w < HALF; w += 10) quad(roadIndex, at(a, w, ROAD), at(b, w, ROAD), at(b, w + 10, ROAD), at(a, w + 10, ROAD));
      for (const sign of [-1, 1]) {
        quad(walkIndex, at(a, sign * HALF, WALK), at(b, sign * HALF, WALK), at(b, sign * OUTER, WALK), at(a, sign * OUTER, WALK));
        const u0 = k / count * curbRepeats, u1 = (k + 1) / count * curbRepeats;
        quad(curbIndex, at(a, sign * HALF, ROAD), at(b, sign * HALF, ROAD), at(b, sign * HALF, WALK), at(a, sign * HALF, WALK), u0, u1);
        quad(curbIndex, at(a, sign * HALF, WALK + .02), at(b, sign * HALF, WALK + .02), at(b, sign * CURB, WALK + .02), at(a, sign * CURB, WALK + .02), u0, u1);
        quad(curbIndex, at(a, sign * OUTER, WALK), at(b, sign * OUTER, WALK), at(b, sign * OUTER, 600), at(a, sign * OUTER, 600), u0, u1);
        const innerEdge = sign * (OUTER - (CURB - HALF));
        quad(curbIndex, at(a, sign * OUTER, WALK + .02), at(b, sign * OUTER, WALK + .02), at(b, innerEdge, WALK + .02), at(a, innerEdge, WALK + .02), u0, u1);
      }
    }
    corridors.push({ j, other, arm, reverse, start, end, side, crossings, at });
  }
  // Retain the original lane stripe layout outside each rebuilt intersection.
  function clip(poly, plane) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], da = a.dot(plane), db = b.dot(plane);
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) out.push(a.clone().lerp(b, da / (da - db)));
    }
    return out;
  }
  for (const group of source.groups) {
    if (group.materialIndex !== lineIndex) continue;
    for (let i = group.start; i < group.start + group.count; i += 3) {
      const points = [read(i), read(i + 1), read(i + 2)], centroid = points[0].clone().add(points[1]).add(points[2]).normalize();
      for (const road of corridors) {
        if (Math.abs(centroid.dot(road.side)) > 0.07) continue;
        const along = Math.atan2(centroid.dot(road.arm.direction), centroid.dot(road.j.up));
        const full = Math.acos(road.j.up.dot(road.other.up));
        if (along < -0.03 || along > full + 0.03) continue;
        const pa = road.arm.direction.clone().addScaledVector(road.j.up, -road.arm.cut / BASE);
        const pb = road.reverse.direction.clone().addScaledVector(road.other.up, -road.reverse.cut / BASE);
        let pieces = [clip(clip(points, pa), pb)];
        // Interrupt old lane dashes through crossings. Keep the edge lines
        // outside the 56-unit pedestrian band and avoid paint-on-paint overlap.
        for(const crossing of road.crossings){
          const alongPlane=s=>road.arm.direction.clone().multiplyScalar(Math.cos(s)).addScaledVector(road.j.up,-Math.sin(s));
          const mid=(crossing.from+crossing.to)/2;
          const forward=road.j.up.clone().multiplyScalar(Math.cos(mid)).addScaledVector(road.arm.direction,Math.sin(mid));
          const planes=[alongPlane(crossing.from-1/BASE),alongPlane(crossing.to+1/BASE).negate(),
            road.side.clone().addScaledVector(forward,28/BASE),road.side.clone().negate().addScaledVector(forward,28/BASE)];
          const outside=[];
          for(let piece of pieces){
            for(const plane of planes){
              const fragment=clip(piece,plane.clone().negate());
              if(fragment.length>=3)outside.push(fragment);
              piece=clip(piece,plane);if(piece.length<3)break;
            }
          }
          pieces=outside;
        }
        for(const poly of pieces)for (let k = 1; k < poly.length - 1; k++) triangle(lineIndex, poly[0], poly[k], poly[k + 1]);
        break;
      }
    }
  }
  const geometry = new THREE.BufferGeometry(), positions = [], normals = [], uvs = [];
  for (let index = 0; index < buffers.length; index++) {
    const data = buffers[index], start = positions.length / 3;
    for (const n of data.position) positions.push(n);
    for (const n of data.normal) normals.push(n);
    for (const n of data.uv) uvs.push(n);
    geometry.addGroup(start, data.position.length / 3, index);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { geometry, junctions, corridors, crosswalks, sectorPath, world,
    stats: { junctions: junctions.length, corners: junctions.reduce((n, j) => n + j.sectors.length, 0), corridors: corridors.length, crosswalks:crosswalks.length, triangles: positions.length / 9 } };
}

export function relocateJunctionFurniture(city, plan) {
  const changes = [], occupied = [];
  city.updateMatrixWorld(true);
  const within = (p, polygon) => {
    let inside = false;
    for (let i = 0, k = polygon.length - 1; i < polygon.length; k = i++) {
      const a = polygon[i], b = polygon[k];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  };
  const point = new THREE.Vector3();
  city.traverse(mesh => {
    if (!mesh.isMesh || !/^(Street|Tree|Grass|Rock)_/.test(mesh.name)) return;
    const pivot = mesh.getWorldPosition(new THREE.Vector3()), dir = pivot.clone().normalize();
    const j = plan.junctions.find(j => dir.dot(j.up) > Math.cos(220 / BASE));
    if (!j) return;
    const local = v2(dir.dot(j.x), dir.dot(j.y)).multiplyScalar(BASE / dir.dot(j.up));
    if (!within(local, j.outline)) return;
    const street = /^Street/.test(mesh.name);
    const radius = street ? WALK : 600;
    const samples = j.sectors.flatMap(s => plan.sectorPath(s, street ? 54 : 82));
    const candidates = samples.map(p => plan.world(j, p, radius))
      .sort((a, b) => a.distanceToSquared(pivot) - b.distanceToSquared(pivot));
    const target = candidates.find(p => occupied.every(q => p.distanceTo(q) > (street ? 8 : 13)));
    if (!target || target.distanceTo(pivot) > 130) throw new Error('Cannot place junction furniture: ' + mesh.name);
    occupied.push(target);
    const rotation = new THREE.Quaternion().setFromUnitVectors(dir, target.clone().normalize());
    const matrix = new THREE.Matrix4().makeRotationFromQuaternion(rotation).multiply(mesh.matrixWorld);
    let minRadius = Infinity;
    const attr = mesh.geometry.attributes.position;
    for (let i = 0; i < attr.count; i++) minRadius = Math.min(minRadius, point.fromBufferAttribute(attr, i).applyMatrix4(matrix).length());
    matrix.elements[12] += target.x / radius * (radius - minRadius);
    matrix.elements[13] += target.y / radius * (radius - minRadius);
    matrix.elements[14] += target.z / radius * (radius - minRadius);
    matrix.premultiply(mesh.parent.matrixWorld.clone().invert());
    const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    changes.push({ name: mesh.name, position: position.toArray(), quaternion: quaternion.toArray(), scale: scale.toArray() });
  });
  // The FBX street props were placed on the original sidewalk. Translate their
  // whole transforms radially; do not shrink lamp posts, benches or planters.
  const relocated = new Set(changes.map(p => p.name));
  city.traverse(mesh => {
    if (!mesh.isMesh || !/^Street_/.test(mesh.name) || relocated.has(mesh.name)) return;
    const matrix = mesh.matrixWorld.clone();
    const up = mesh.getWorldPosition(new THREE.Vector3()).normalize();
    const shift = WALK - ORIGINAL_WALK;
    matrix.elements[12] += up.x * shift;
    matrix.elements[13] += up.y * shift;
    matrix.elements[14] += up.z * shift;
    matrix.premultiply(mesh.parent.matrixWorld.clone().invert());
    const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    changes.push({ name: mesh.name, position: position.toArray(), quaternion: quaternion.toArray(), scale: scale.toArray() });
  });
  return changes;
}
