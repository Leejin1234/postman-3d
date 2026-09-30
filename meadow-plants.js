import * as T from 'three';
import { lakeMetric } from './lakeside.js?v=20260930-21';

const CELL = 48;
const key = (x, y, z) => `${x},${y},${z}`;
const smooth = (a, b, x) => T.MathUtils.smoothstep(x, a, b);

// Sample the final terrain triangles, so roots follow both the hills and lake cut.
// Keep only positions; a fixed-size set of GPU instances draws the nearby region.
export function scatterMeadow(planet, allowed = () => true) {
  planet.updateWorldMatrix(true, false);
  const geo = planet.geometry, pos = geo.attributes.position, bins = new Map();
  const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
  const ab = new T.Vector3(), ac = new T.Vector3(), n = new T.Vector3(), p = new T.Vector3(), up = new T.Vector3();
  let seed = 291201, count = 0, flowers = 0;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const read = (v, i) => v.fromBufferAttribute(pos, geo.index ? geo.index.getX(i) : i).applyMatrix4(planet.matrixWorld);
  for (let i = 0; i < (geo.index?.count ?? pos.count); i += 3) {
    read(a, i); read(b, i + 1); read(c, i + 2);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const area = n.length() * .5; n.normalize();
    up.copy(a).add(b).add(c).normalize();
    if (Math.abs(n.dot(up)) < .86) continue;
    const attempts = Math.floor(area * 1.4 + random());
    for (let j = 0; j < attempts; j++) {
      const u = Math.sqrt(random()), v = random();
      p.copy(a).multiplyScalar(1 - u).addScaledVector(b, u * (1 - v)).addScaledVector(c, u * v);
      const patch = .5 + .5 * Math.sin(p.x * .057 + Math.sin(p.z * .034) * 2) * Math.cos(p.y * .051 - p.z * .027);
      if (random() > .45 + .55 * patch || lakeMetric(p) < 1.13) continue;
      up.copy(p).normalize();
      if (!allowed(p, up)) continue;
      // Half the flower density; consume the same random values to preserve grass placement.
      const flower = random() < .0125 + .0335 * smooth(.55, .88, patch);
      const k = key(Math.floor(p.x / CELL), Math.floor(p.y / CELL), Math.floor(p.z / CELL));
      if (!bins.has(k)) bins.set(k, []);
      bins.get(k).push(p.x, p.y, p.z, random(), flower ? 1 : 0);
      count++; if (flower) flowers++;
    }
  }
  for (const [k, values] of bins) bins.set(k, new Float32Array(values));
  return { bins, stats: { roots: count, flowers, cells: bins.size } };
}

function bladeGeometry(stem = false) {
  const positions = [], colors = [];
  const dark = new T.Color(stem ? '#4b7942' : '#527c38'), light = new T.Color(stem ? '#96b66a' : '#bed578');
  for (let j = 0; j < (stem ? 2 : 1); j++) {
    const angle = j * 2.399, dx = Math.cos(angle), dz = Math.sin(angle);
    const width = stem ? .055 : .12, h = stem ? 1.38 : 1 - j * .13, lean = stem ? 0 : .16;
    const points = [[-width, 0], [width, 0], [width + lean, h * .9], [lean + width * .45, h], [lean - width * .45, h], [lean - width, h * .9]];
    for (const index of [0, 1, 2, 0, 2, 5, 5, 2, 3, 5, 3, 4]) {
      const [x, y] = points[index]; positions.push(dx * x, y, dz * x);
      const color = dark.clone().lerp(light, y / h); colors.push(color.r, color.g, color.b);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals(); return geo;
}

export function createMeadowPlants(scene, field, { mobile = false } = {}) {
  const range = mobile ? 85 : 120, capacity = mobile ? 28000 : 64000;
  const uniforms = { meadowTime: { value: 0 }, meadowFocus: { value: new T.Vector3() }, meadowRange: { value: range } };
  function material(flower = false) {
    const mat = flower ? new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide })
      : new T.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: T.DoubleSide });
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = 'uniform float meadowTime; uniform float meadowRange; uniform vec3 meadowFocus;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        vec3 root = (modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.)).xyz;
        float growth = 1. - smoothstep(meadowRange - 28., meadowRange, distance(root, meadowFocus));
        transformed *= growth;
        transformed.x += sin(meadowTime * 1.65 + root.x * .16 + root.z * .11) * .10 * position.y * growth;
      `);
      if (flower) shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        float size = length(instanceMatrix[0].xyz);
        float sway = sin(meadowTime * 1.65 + root.x * .16 + root.z * .11) * .138 * growth;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(sway, 1.38 * growth, 0., 1.);
        mvPosition.xy += position.xy * size * growth;
        gl_Position = projectionMatrix * mvPosition;
      `);
    };
    mat.customProgramCacheKey = () => `meadow-v1-${flower}`;
    return mat;
  }
  const grass = new T.InstancedMesh(bladeGeometry(), material(), capacity);
  const stems = new T.InstancedMesh(bladeGeometry(true), material(), Math.ceil(capacity * .14));
  const blooms = new T.InstancedMesh(new T.CircleGeometry(.30, 12), material(true), stems.instanceMatrix.count);
  for (const [mesh, name] of [[grass, 'MeadowBlades'], [stems, 'MeadowStems'], [blooms, 'MeadowRoundFlowers']]) {
    mesh.name = name; mesh.count = 0; mesh.frustumCulled = false;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(mesh);
  }
  const last = new T.Vector3(Infinity, 0, 0), p = new T.Vector3(), up = new T.Vector3(), scale = new T.Vector3();
  const q = new T.Quaternion(), yaw = new T.Quaternion(), axis = new T.Vector3(0, 1, 0), matrix = new T.Matrix4();
  const colors = ['#f3ce55', '#ead9b3'].map(c => new T.Color(c));
  function update(time, focus) {
    uniforms.meadowTime.value = time; uniforms.meadowFocus.value.copy(focus);
    if (last.distanceToSquared(focus) < 36) return;
    last.copy(focus); let gi = 0, fi = 0;
    const cells = [], reach = Math.ceil(range / CELL);
    const cx = Math.floor(focus.x / CELL), cy = Math.floor(focus.y / CELL), cz = Math.floor(focus.z / CELL);
    for (let x = cx - reach; x <= cx + reach; x++) for (let y = cy - reach; y <= cy + reach; y++) for (let z = cz - reach; z <= cz + reach; z++) {
      const data = field.bins.get(key(x, y, z));
      if (data) cells.push({ data, distance: p.set((x + .5) * CELL, (y + .5) * CELL, (z + .5) * CELL).distanceToSquared(focus) });
    }
    cells.sort((a, b) => a.distance - b.distance);
    for (const { data } of cells) for (let i = 0; i < data.length; i += 5) {
      p.fromArray(data, i); if (p.distanceToSquared(focus) > range * range) continue;
      const seed = data[i + 3], flower = data[i + 4] > 0;
      if (gi >= capacity || (mobile && seed < .22)) continue;
      up.copy(p).normalize(); q.setFromUnitVectors(axis, up).multiply(yaw.setFromAxisAngle(axis, seed * Math.PI * 2));
      const size = .85 + seed * .95;
      // Sink roots slightly so no sliver appears between blades and sloping land.
      matrix.compose(p.addScaledVector(up, -.08), q, scale.set(size, size, size));
      grass.setMatrixAt(gi++, matrix);
      if (flower && fi < stems.instanceMatrix.count) {
        stems.setMatrixAt(fi, matrix); blooms.setMatrixAt(fi, matrix);
        blooms.setColorAt(fi, colors[Math.min(colors.length - 1, Math.floor(seed * colors.length))]); fi++;
      }
    }
    grass.count = gi; stems.count = blooms.count = fi;
    for (const mesh of [grass, stems, blooms]) mesh.instanceMatrix.needsUpdate = true;
    if (blooms.instanceColor) blooms.instanceColor.needsUpdate = true;
  }
  return { update, grass, stems, blooms, stats: { ...field.stats, maxGrass: capacity, range, drawCalls: 3 } };
}
