import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
const DEBUG = /(\?|&)debug/.test(location.search);
const AUTO = /(\?|&)auto/.test(location.search);
const SELFTEST = /(\?|&)selftest/.test(location.search);

const CFG = {
  citySpan: 300,
  streetWidth: 22,
  bikeLen: 1.95,
  riderHeight: 1.72,
  maxSpeed: 17,
  accel: 11,
  brake: 22,
  drag: 0.8,
  steer: 2.3,
  reachRadius: 4.2,
  walkSpeed: 1.9,
  runSpeed: 5.4,
  jumpVel: 4.8,
  gravity: 15,
  footTurn: 10,
  footRadius: 0.42,
  mountRange: 3.4,
  shadowSize: IS_MOBILE ? 1024 : 2048,
  shadowSpan: IS_MOBILE ? 38 : 52,
  fog: IS_MOBILE ? [140, 340] : [190, 480],
  maxDpr: IS_MOBILE ? 1.6 : 2
};

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);

const state = {
  coin: 0, parcel: 0, lv: 1, xp: 0, xpMax: 100,
  phase: 'pickup', target: null, mailboxes: [],
  speed: 0, heading: 0, tris: 0,
  onBike: true, camYaw: 0
};

/* ---------- renderer / scene ---------- */
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_MOBILE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, CFG.maxDpr));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = IS_MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe8f7, CFG.fog[0], CFG.fog[1]);

const camera = new THREE.PerspectiveCamera(52, 1, 0.15, IS_MOBILE ? 600 : 900);
camera.position.set(0, 6, -10);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(560, 32, 20),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x1f86cf) },
      mid: { value: new THREE.Color(0x69bbea) },
      bot: { value: new THREE.Color(0xcfe8f7) }
    },
    vertexShader: `varying float h; void main(){ vec4 w = modelMatrix*vec4(position,1.0);
      h = normalize(position).y; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying float h;
      void main(){ float t = clamp(h,-1.0,1.0);
        vec3 c = t > 0.17 ? mix(mid,top,smoothstep(0.17,0.86,t)) : mix(bot,mid,smoothstep(-0.05,0.17,t));
        gl_FragColor = vec4(c,1.0); }`
  })
);
sky.frustumCulled = false;
scene.add(sky);

function cloudTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  const puff = (x, y, r, warm) => {
    const rg = g.createRadialGradient(x, y, r * 0.15, x, y, r);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.80, warm ? 'rgba(233,243,252,1)' : 'rgba(255,255,255,1)');
    rg.addColorStop(0.92, warm ? 'rgba(226,238,250,.92)' : 'rgba(255,255,255,.95)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  };
  [[74, 74, 40], [118, 56, 50], [172, 76, 38], [102, 88, 34], [146, 90, 32], [200, 92, 26]]
    .forEach(([x, y, r]) => puff(x, y, r, false));
  [[96, 102, 30], [150, 105, 26]].forEach(([x, y, r]) => puff(x, y, r, true));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const cloudTex = cloudTexture();
const clouds = [];
for (let i = 0; i < (IS_MOBILE ? 12 : 20); i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
  const a = Math.random() * Math.PI * 2, r = 150 + Math.random() * 200;
  sp.position.set(Math.cos(a) * r, 48 + Math.random() * 80, Math.sin(a) * r);
  const s = 70 + Math.random() * 90;
  sp.scale.set(s, s * 0.46, 1);
  scene.add(sp);
  clouds.push({ sp, spd: 1.1 + Math.random() * 1.5 });
}

scene.add(new THREE.HemisphereLight(0xcce6f8, 0xb4b79c, 0.46));
scene.add(new THREE.AmbientLight(0xffffff, 0.26));
const sun = new THREE.DirectionalLight(0xfff8e6, 1.3);
sun.position.set(46, 86, 38);
sun.castShadow = true;
sun.shadow.mapSize.set(CFG.shadowSize, CFG.shadowSize);
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = IS_MOBILE ? 1 : 2;
const sc = sun.shadow.camera;
sc.left = -CFG.shadowSpan; sc.right = CFG.shadowSpan;
sc.top = CFG.shadowSpan; sc.bottom = -CFG.shadowSpan;
sc.near = 1; sc.far = 240;
scene.add(sun, sun.target);

/* ---------- toon shading ---------- */
/* 赛璐璐：硬边分色带，NearestFilter 保证明暗交界是一条锐利的线而不是渐变 */
function toonGradient(stops) {
  const n = stops.length;
  const d = new Uint8Array(n);
  for (let i = 0; i < n; i++) d[i] = Math.round(255 * stops[i]);
  const t = new THREE.DataTexture(d, n, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
const GRAD = toonGradient([0.70, 0.86, 1.0]);

/* 动画赛璐璐调色：提饱和 + 轻微加对比，暗部往冷蓝偏（动画里阴影都是带色的） */
const WASH = { sat: 1.24, contrast: 1.06, coolShadow: 0.10 };
function pastel(m) {
  const f = v => v.toFixed(4);
  m.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       float wg = dot(diffuseColor.rgb, vec3(0.299,0.587,0.114));
       diffuseColor.rgb = mix(vec3(wg), diffuseColor.rgb, ${f(WASH.sat)});
       diffuseColor.rgb = (diffuseColor.rgb - 0.5) * ${f(WASH.contrast)} + 0.5;
       diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86,0.94,1.12), ${f(WASH.coolShadow)} * (1.0 - wg));
       diffuseColor.rgb = clamp(diffuseColor.rgb, 0.0, 1.0);`);
  };
  m.customProgramCacheKey = () => 'cel';
  return m;
}

function toonify(root, opts = {}) {
  root.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map(m => {
      const map = (opts.map || (m && m.map)) || null;
      if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = IS_MOBILE ? 2 : 4; }
      return pastel(new THREE.MeshToonMaterial({
        name: (m && m.name) || '',
        color: 0xffffff,
        map,
        gradientMap: GRAD
      }));
    });
    o.material = out.length === 1 ? out[0] : out;
    o.castShadow = opts.castShadow !== false;
    o.receiveShadow = true;
  });
}

/* ---------- 描边（反向壳 / inverted hull） ---------- */
const OUTLINE = !/(\?|&)noline/.test(location.search);
const OUTLINE_MUL = parseFloat((location.search.match(/[?&]lw=([\d.]+)/) || [])[1]) || 1;
const OUTLINE_COLOR = 0x2b2622;
const outlineMats = new Map();
function outlineMaterial(thickness) {
  const w = Math.max(0.0004, thickness);
  const key = w.toFixed(5);
  if (outlineMats.has(key)) return outlineMats.get(key);
  const m = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide, fog: true });
  m.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute vec3 aHull;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n\ttransformed += aHull * ' + Number(key).toFixed(6) + ';');
  };
  m.customProgramCacheKey = () => 'outline' + key;
  outlineMats.set(key, m);
  return m;
}

/* 低多边形模型的法线是分面的，直接沿法线挤会让每个面各自飞出去、棱角处露出缝。
   这里按顶点位置把法线焊接平均一次，存成 aHull 属性，壳体才是连续的。 */
function bakeHullNormals(geo) {
  if (geo.attributes.aHull) return;
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  if (!pos || !nrm) return;
  const n = pos.count;
  const out = new Float32Array(n * 3);
  const sums = new Map();
  const keys = new Array(n);
  const Q = 1000;
  for (let i = 0; i < n; i++) {
    const k = (Math.round(pos.getX(i) * Q) * 73856093 ^ Math.round(pos.getY(i) * Q) * 19349663 ^
      Math.round(pos.getZ(i) * Q) * 83492791) | 0;
    keys[i] = k;
    let s = sums.get(k);
    if (!s) sums.set(k, s = [0, 0, 0]);
    s[0] += nrm.getX(i); s[1] += nrm.getY(i); s[2] += nrm.getZ(i);
  }
  for (let i = 0; i < n; i++) {
    const s = sums.get(keys[i]);
    let x = s[0], y = s[1], z = s[2];
    const len = Math.hypot(x, y, z);
    if (len < 1e-6) { x = nrm.getX(i); y = nrm.getY(i); z = nrm.getZ(i); }
    else { x /= len; y /= len; z /= len; }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  geo.setAttribute('aHull', new THREE.BufferAttribute(out, 3));
}

const vScale = new THREE.Vector3();
function addOutline(root, world = 0.03) {
  if (!OUTLINE) return;
  const list = [];
  root.traverse(o => { if (o.isMesh && !o.userData.__outline) list.push(o); });
  for (const o of list) {
    if (!o.geometry || !o.geometry.attributes.normal) continue;
    bakeHullNormals(o.geometry);
    if (!o.geometry.attributes.aHull) continue;
    o.getWorldScale(vScale);
    const avg = (Math.abs(vScale.x) + Math.abs(vScale.y) + Math.abs(vScale.z)) / 3 || 1;
    const mat = outlineMaterial(world * OUTLINE_MUL / avg);
    let shell;
    if (o.isSkinnedMesh) {
      shell = new THREE.SkinnedMesh(o.geometry, mat);
      shell.bind(o.skeleton, o.bindMatrix);
      shell.frustumCulled = false;
    } else {
      shell = new THREE.Mesh(o.geometry, mat);
    }
    shell.userData.__outline = true;
    shell.renderOrder = -1;
    shell.castShadow = false;
    shell.receiveShadow = false;
    o.add(shell);
  }
}

/* ---------- 顶点色道具（车 / 树共享一个卡通材质） ---------- */
const VC_MAT = pastel(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD }));
function paint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
function pbox(w, h, d, x, y, z, hex) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return paint(g, hex);
}
function pcyl(rt, rb, h, seg, x, y, z, hex, rz) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z); return paint(g, hex);
}
function psphere(r, x, y, z, hex, squash) {
  const g = new THREE.SphereGeometry(r, 9, 7);
  if (squash) g.scale(1, squash, 1);
  g.translate(x, y, z); return paint(g, hex);
}
function mergeParts(parts) {
  const g = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  return g;
}

const CAR_PAINTS = [0xf2f3f5, 0x69b7c7, 0xd95f4b, 0x7f9fd1, 0x9dc98f, 0xf2f3f5];
const carGeoCache = new Map();
function carGeo(paintHex, taxi) {
  const key = paintHex + (taxi ? '_t' : '');
  if (carGeoCache.has(key)) return carGeoCache.get(key);
  const parts = [
    pbox(1.72, 0.55, 3.8, 0, 0.62, 0, paintHex),
    pbox(1.5, 0.5, 1.85, 0, 1.12, -0.12, 0x2c3644),
    pbox(1.52, 0.09, 1.6, 0, 1.4, -0.12, paintHex),
    pbox(0.3, 0.12, 0.06, -0.55, 0.72, 1.92, 0xfff2b0),
    pbox(0.3, 0.12, 0.06, 0.55, 0.72, 1.92, 0xfff2b0),
    pbox(0.3, 0.12, 0.06, -0.55, 0.72, -1.92, 0xd23b32),
    pbox(0.3, 0.12, 0.06, 0.55, 0.72, -1.92, 0xd23b32),
    pcyl(0.33, 0.33, 0.26, 10, -0.8, 0.33, 1.25, 0x22262c, Math.PI / 2),
    pcyl(0.33, 0.33, 0.26, 10, 0.8, 0.33, 1.25, 0x22262c, Math.PI / 2),
    pcyl(0.33, 0.33, 0.26, 10, -0.8, 0.33, -1.25, 0x22262c, Math.PI / 2),
    pcyl(0.33, 0.33, 0.26, 10, 0.8, 0.33, -1.25, 0x22262c, Math.PI / 2)
  ];
  if (taxi) parts.push(pbox(0.5, 0.16, 0.24, 0, 1.52, -0.12, 0xfff6d8));
  const g = mergeParts(parts);
  carGeoCache.set(key, g);
  return g;
}

/* ---------- 高度图占用标记（静态障碍物） ---------- */
function stampOcc(x, z, r) {
  if (!HM.occ) return;
  const cx0 = clamp(Math.floor((x - r - HM.minX) / HM.cell), 0, HM.w - 1);
  const cx1 = clamp(Math.floor((x + r - HM.minX) / HM.cell), 0, HM.w - 1);
  const cz0 = clamp(Math.floor((z - r - HM.minZ) / HM.cell), 0, HM.h - 1);
  const cz1 = clamp(Math.floor((z + r - HM.minZ) / HM.cell), 0, HM.h - 1);
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) HM.occ[cz * HM.w + cx] = 1;
}
function dirClear(x, z, h, dist, r = 1.05) {
  const fx = Math.sin(h), fz = Math.cos(h);
  for (let d = 2; d <= dist; d += 1.6) if (blockedAt(x + fx * d, z + fz * d, r)) return false;
  return true;
}
/* 最近墙面方向与距离（用于贴边停车 / 种树） */
function wallProbe(p) {
  let best = null;
  for (const h of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const fx = Math.sin(h), fz = Math.cos(h);
    let d = 7;
    for (let t = 1.2; t < 7; t += 0.7) if (blockedAt(p.x + fx * t, p.z + fz * t, 0.5)) { d = t; break; }
    if (!best || d < best.d) best = { h, d, fx, fz };
  }
  return best;
}

/* ---------- 路边停靠车辆（合并成一个静态网格） ---------- */
function placeParked(n) {
  const geos = [], placed = [];
  for (let i = 0, tries = 0; i < n && tries < n * 12; tries++) {
    const p = findRoadPoint(2.2);
    const w = wallProbe(p);
    if (!w || w.d < 3.4 || w.d > 5.6) continue;
    const cx = p.x + w.fx * (w.d - 2.6), cz = p.z + w.fz * (w.d - 2.6);
    if (Math.abs(heightAt(cx, cz)) > 0.08) continue;
    const h = w.h + Math.PI / 2;
    if (!dirClear(cx, cz, h, 3.4, 1.1) || !dirClear(cx, cz, h + Math.PI, 3.4, 1.1)) continue;
    const fx = Math.sin(h), fz = Math.cos(h);
    if (Math.abs(heightAt(cx + fx * 1.4, cz + fz * 1.4)) > 0.08 ||
        Math.abs(heightAt(cx - fx * 1.4, cz - fz * 1.4)) > 0.08) continue;
    if (placed.some(q => Math.hypot(q[0] - cx, q[1] - cz) < 6)) continue;
    if (state.mailboxes.some(m => Math.hypot(m.position.x - cx, m.position.z - cz) < 4)) continue;
    placed.push([cx, cz]);
    const taxi = Math.random() < 0.25;
    const g = carGeo(taxi ? 0xffc63a : CAR_PAINTS[(Math.random() * CAR_PAINTS.length) | 0], taxi).clone();
    g.rotateY(h + (Math.random() < 0.5 ? Math.PI : 0));
    g.translate(cx, 0, cz);
    geos.push(g);
    stampOcc(cx + fx * 1.2, cz + fz * 1.2, 0.85);
    stampOcc(cx - fx * 1.2, cz - fz * 1.2, 0.85);
    stampOcc(cx, cz, 0.85);
    i++;
  }
  if (!geos.length) return;
  const mesh = new THREE.Mesh(mergeParts(geos), VC_MAT);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addOutline(mesh, 0.02);
  scene.add(mesh);
}

/* ---------- 樱花树（合并成一个静态网格） ---------- */
function sakuraGeo(scale) {
  const parts = [pcyl(0.09, 0.14, 1.5, 7, 0, 0.75, 0, 0x8a6642)];
  const blobs = [[0, 1.95, 0, 0.85], [0.5, 1.6, 0.2, 0.55], [-0.45, 1.68, -0.15, 0.5]];
  const pinks = [0xf7a8c4, 0xf9b8d0, 0xf498b8];
  blobs.forEach((b, i) => parts.push(psphere(b[3], b[0], b[1], b[2], pinks[i % 3], 0.9)));
  const g = mergeParts(parts);
  g.scale(scale, scale, scale);
  return g;
}
function placeSakura(n) {
  const geos = [];
  for (let i = 0, tries = 0; i < n && tries < n * 15; tries++) {
    const p = findRoadPoint(2.0);
    const w = wallProbe(p);
    if (!w || w.d < 2.2) continue;
    const tx = p.x + w.fx * (w.d - 1.1), tz = p.z + w.fz * (w.d - 1.1);
    const th = heightAt(tx, tz);
    if (th > 0.6 || th < -0.4) continue;
    if (state.mailboxes.some(m => Math.hypot(m.position.x - tx, m.position.z - tz) < 3)) continue;
    const g = sakuraGeo(rand(0.85, 1.35));
    g.rotateY(rand(0, 6.28));
    g.translate(tx, Math.max(0, th), tz);
    geos.push(g);
    stampOcc(tx, tz, 0.4);
    i++;
  }
  if (!geos.length) return;
  const mesh = new THREE.Mesh(mergeParts(geos), VC_MAT);
  mesh.castShadow = true;
  addOutline(mesh, 0.03);
  scene.add(mesh);
}

/* ---------- 路上车流 ---------- */
const traffic = [];
const CAR_SPEED = 6.5;
function spawnCar(c, near) {
  for (let i = 0; i < 30; i++) {
    const p = findRoadPoint(2.4, near, near ? 95 : 0);
    if (near && Math.hypot(p.x - near.x, p.z - near.z) < 14) continue;
    const hs = [0, Math.PI / 2, Math.PI, -Math.PI / 2].sort(() => Math.random() - 0.5);
    const h = hs.find(h => dirClear(p.x, p.z, h, 12));
    if (h === undefined) continue;
    if (traffic.some(o => o !== c && Math.hypot(o.x - p.x, o.z - p.z) < 7)) continue;
    c.x = p.x; c.z = p.z; c.h = h; c.v = 0; c.stuck = 0;
    c.mesh.position.set(p.x, 0, p.z);
    c.mesh.rotation.y = h;
    return;
  }
  c.x = 0; c.z = 0; c.v = 0;
  c.mesh.position.set(0, -50, 0);
}
function initTraffic(n) {
  for (let i = 0; i < n; i++) {
    const taxi = Math.random() < 0.3;
    const mesh = new THREE.Mesh(
      carGeo(taxi ? 0xffc63a : CAR_PAINTS[(Math.random() * CAR_PAINTS.length) | 0], taxi), VC_MAT);
    mesh.castShadow = true;
    addOutline(mesh, 0.02);
    scene.add(mesh);
    const c = { mesh, x: 0, z: 0, h: 0, v: 0, stuck: 0 };
    traffic.push(c);
    spawnCar(c, player.position);
  }
}
function updateTraffic(dt) {
  const fp = focusPos();
  const px = fp.x, pz = fp.z;
  for (const c of traffic) {
    if (c.mesh.position.y < -10) continue;
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    let want = CAR_SPEED;
    if (!dirClear(c.x, c.z, c.h, 5.2)) {
      const l = c.h + Math.PI / 2, r = c.h - Math.PI / 2;
      if (dirClear(c.x, c.z, l, 8)) c.h = l;
      else if (dirClear(c.x, c.z, r, 8)) c.h = r;
      else want = 0;
    } else if (Math.random() < dt * 0.25) {
      const t = Math.random() < 0.5 ? c.h + Math.PI / 2 : c.h - Math.PI / 2;
      if (dirClear(c.x, c.z, t, 9)) c.h = t;
    }
    for (const o of traffic) {
      if (o === c || o.mesh.position.y < -10) continue;
      const dx = o.x - c.x, dz = o.z - c.z;
      if (dx * fx + dz * fz > 0.5 && dx * dx + dz * dz < 16) { want = 0; break; }
    }
    const pdx = px - c.x, pdz = pz - c.z;
    if (pdx * fx + pdz * fz > 0.3 && pdx * pdx + pdz * pdz < 14) want = 0;
    c.v += clamp(want - c.v, -9 * dt, 2.5 * dt);
    const nx = c.x + fx * c.v * dt, nz = c.z + fz * c.v * dt;
    if (c.v > 0.05 && !blockedAt(nx + fx * 1.9, nz + fz * 1.9, 0.95)) {
      c.x = nx; c.z = nz; c.stuck = 0;
    } else if (c.v > 0.05) {
      c.v = 0; c.stuck += dt;
      if (c.stuck > 2.5) { spawnCar(c, fp); continue; }
    }
    c.mesh.position.set(c.x, 0, c.z);
    const dy = Math.atan2(Math.sin(c.h - c.mesh.rotation.y), Math.cos(c.h - c.mesh.rotation.y));
    c.mesh.rotation.y += dy * Math.min(1, dt * 7);
    const ddx = px - c.x, ddz = pz - c.z, dd = Math.hypot(ddx, ddz);
    if (dd < 2.1 && dd > 0.01) {
      const target = state.onBike ? player.position : walker.position;
      target.x += ddx / dd * (2.1 - dd);
      target.z += ddz / dd * (2.1 - dd);
      if (state.onBike) state.speed *= 0.3; else foot.speed *= 0.3;
      if (!state.bumpT || clock.elapsedTime - state.bumpT > 2) {
        state.bumpT = clock.elapsedTime;
        toast('小心车辆！');
      }
    }
    if (dd > 115) spawnCar(c, fp);
  }
}

/* ---------- 取信 / 送达动效 ---------- */
function fxEl(cls, txt, x, y) {
  const el = document.createElement('div');
  el.className = 'fx ' + cls;
  el.textContent = txt;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  $('fx').appendChild(el);
  return el;
}
function flyLetter() {
  const stage = $('stage').getBoundingClientRect();
  const pill = $('parcel').getBoundingClientRect();
  const sx = stage.width / 2, sy = stage.height * 0.55;
  const dx = pill.left - stage.left + pill.width / 2 - sx;
  const dy = pill.top - stage.top + pill.height / 2 - sy;
  const el = fxEl('fly', '✉️', sx, sy);
  el.animate([
    { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 1 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.55)`, opacity: .9 }
  ], { duration: 620, easing: 'cubic-bezier(.25,.7,.3,1)' }).onfinish = () => el.remove();
}
function coinPop(gain) {
  const stage = $('stage').getBoundingClientRect();
  const el = fxEl('pop', '+' + gain + ' 金币', stage.width / 2, stage.height * 0.42);
  el.animate([
    { transform: 'translate(-50%,-50%) translateY(0)', opacity: 1 },
    { transform: 'translate(-50%,-50%) translateY(-70px)', opacity: 0 }
  ], { duration: 900, easing: 'ease-out' }).onfinish = () => el.remove();
  $('coin').parentElement.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 320 });
}

/* ---------- loading ---------- */
const loader = new FBXLoader();
const texLoader = new THREE.TextureLoader();
function loadOne(url, onFrac) {
  return new Promise((res, rej) => loader.load(url, res,
    e => { if (onFrac && e.total) onFrac(e.loaded / e.total); }, rej));
}
function loadTex(url) {
  return new Promise((res, rej) => texLoader.load(url, t => {
    t.colorSpace = THREE.SRGBColorSpace;
    res(t);
  }, undefined, rej));
}

/* 反向壳只能描出剪影，窗框 / 面板缝这类「内部结构线」描不出来。
   这里对贴图本身跑一遍 Sobel，把颜色突变的地方压暗，等于把墨线直接印进贴图。 */
const INK = !/(\?|&)noink/.test(location.search);
function inkTexture(tex, { strength = 0.62, threshold = 0.11 } = {}) {
  if (!INK || !tex || !tex.image) return tex;
  const img = tex.image;
  const w = img.width | 0, h = img.height | 0;
  if (!w || !h) return tex;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const src = ctx.getImageData(0, 0, w, h);
  const p = src.data;
  const lum = new Float32Array(w * h);
  for (let i = 0, n = w * h; i < n; i++) {
    lum[i] = (p[i * 4] * 0.299 + p[i * 4 + 1] * 0.587 + p[i * 4 + 2] * 0.114) / 255;
  }
  const out = ctx.createImageData(w, h);
  const q = out.data;
  q.set(p);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = lum[i - w - 1] + 2 * lum[i - 1] + lum[i + w - 1] -
        lum[i - w + 1] - 2 * lum[i + 1] - lum[i + w + 1];
      const gy = lum[i - w - 1] + 2 * lum[i - w] + lum[i - w + 1] -
        lum[i + w - 1] - 2 * lum[i + w] - lum[i + w + 1];
      const g = Math.hypot(gx, gy);
      if (g <= threshold) continue;
      const k = 1 - Math.min(1, (g - threshold) * 2.2) * strength;
      const o = i * 4;
      q[o] = p[o] * k; q[o + 1] = p[o + 1] * k; q[o + 2] = p[o + 2] * k;
    }
  }
  ctx.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
  t.flipY = tex.flipY;
  t.needsUpdate = true;
  return t;
}
function setProgress(f, text) {
  $('ldFill').style.width = Math.round(f * 100) + '%';
  if (text) $('loading').firstChild.textContent = text;
}

/* 缩放到目标尺寸、XZ 居中、底面贴 y=0 */
function normalize(obj, { span, height }) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  const s = b.getSize(new THREE.Vector3());
  const k = height ? height / s.y : span / Math.max(s.x, s.z);
  obj.scale.multiplyScalar(k);
  obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj);
  const c = b2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= b2.min.y;
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
}

/* 把整棵树烘成一个几何体（世界坐标） */
function flatten(root) {
  root.updateMatrixWorld(true);
  const geos = [];
  let material = null;
  root.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    if (!material) material = Array.isArray(o.material) ? o.material[0] : o.material;
    const g = o.geometry.clone();
    for (const k in g.attributes) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.morphAttributes = {};
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    g.applyMatrix4(o.matrixWorld);
    geos.push(g.index ? g.toNonIndexed() : g);
  });
  if (!geos.length) return null;
  const geometry = geos.length === 1 ? geos[0] : BufferGeometryUtils.mergeGeometries(geos, false);
  return { geometry, material };
}

/* ---------- 城市合批：同贴图 + 空间分块（便于视锥剔除） ---------- */
const TILE = 46;
function mergeCity(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const c = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isMesh || !o.geometry || o.userData.__outline) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.length !== 1 || !mats[0]) return;
    const mat = mats[0];
    const g = o.geometry.clone();
    for (const k in g.attributes) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.morphAttributes = {};
    if (!g.attributes.position || !g.attributes.normal || !g.attributes.uv) return;
    g.applyMatrix4(o.matrixWorld);
    g.computeBoundingBox();
    g.boundingBox.getCenter(c);
    const key = (mat.map ? mat.map.uuid : 'none') + '|' + mat.color.getHexString() +
      '|' + Math.floor(c.x / TILE) + '_' + Math.floor(c.z / TILE);
    let bucket = groups.get(key);
    if (!bucket) groups.set(key, bucket = { mat, geos: [], src: [] });
    bucket.geos.push(g.index ? g.toNonIndexed() : g);
    bucket.src.push(o);
  });
  const merged = new THREE.Group();
  merged.name = 'city-merged';
  let ok = 0;
  groups.forEach(bucket => {
    let g = null;
    try { g = BufferGeometryUtils.mergeGeometries(bucket.geos, false); } catch (e) { g = null; }
    if (!g) { bucket.geos.forEach(x => x.dispose()); return; }
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, bucket.mat);
    mesh.name = 'city_' + ok;
    mesh.castShadow = !IS_MOBILE;
    mesh.receiveShadow = true;
    merged.add(mesh);
    bucket.src.forEach(o => o.parent && o.parent.remove(o));
    ok++;
  });
  return ok ? merged : null;
}

/* ---------- 高度图（碰撞 / 可行驶区域 / 小地图） ---------- */
const HM = { cell: 0.8, w: 0, h: 0, minX: 0, minZ: 0, data: null, occ: null, img: null };

/* 第二遍：只把"楼房墙体"记为碰撞——需同时满足
   1) 在离地 2.6~6（按街宽换算的单位）高度带内有成片实体面
   2) 该格最高点确实是楼房高度
   于是马路上的汽车/卡车/护栏/灯杆/招牌以及高架桥面都不再挡路。 */
function buildCollision(root) {
  const BAND0 = 2.5, BAND1 = 5.0, TALL = 4.5, MINFOOT = 0.6;
  const occ = new Uint8Array(HM.w * HM.h);
  const v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || !o.geometry || o.userData.__outline) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const m = o.matrixWorld;
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < count; i += 3) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      let ymin = Infinity, ymax = -Infinity;
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx.getX(i + k) : i + k;
        v.fromBufferAttribute(pos, vi).applyMatrix4(m);
        if (v.x < x0) x0 = v.x;
        if (v.x > x1) x1 = v.x;
        if (v.z < z0) z0 = v.z;
        if (v.z > z1) z1 = v.z;
        if (v.y < ymin) ymin = v.y;
        if (v.y > ymax) ymax = v.y;
      }
      if (ymax < BAND0 || ymin > BAND1) continue;
      if (Math.max(x1 - x0, z1 - z0) < MINFOOT) continue;
      const cx0 = clamp(Math.floor((x0 - HM.minX) / HM.cell), 0, HM.w - 1);
      const cx1 = clamp(Math.floor((x1 - HM.minX) / HM.cell), 0, HM.w - 1);
      const cz0 = clamp(Math.floor((z0 - HM.minZ) / HM.cell), 0, HM.h - 1);
      const cz1 = clamp(Math.floor((z1 - HM.minZ) / HM.cell), 0, HM.h - 1);
      for (let cz = cz0; cz <= cz1; cz++) {
        const row = cz * HM.w;
        for (let cx = cx0; cx <= cx1; cx++) if (HM.data[row + cx] > TALL) occ[row + cx] = 1;
      }
    }
  });
  // 只保留成片墙体，去掉零散单元
  const out = new Uint8Array(occ.length);
  let n1 = 0;
  for (let cz = 1; cz < HM.h - 1; cz++) {
    for (let cx = 1; cx < HM.w - 1; cx++) {
      const i = cz * HM.w + cx;
      if (!occ[i]) continue;
      let n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) n += occ[i + dz * HM.w + dx];
      if (n >= 5) { out[i] = 1; n1++; }
    }
  }
  HM.occ = out;
  state.wallCells = n1;
}

function buildHeightmap(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  HM.minX = box.min.x - 1;
  HM.minZ = box.min.z - 1;
  HM.w = Math.ceil((box.max.x + 1 - HM.minX) / HM.cell);
  HM.h = Math.ceil((box.max.z + 1 - HM.minZ) / HM.cell);
  const data = HM.data = new Float32Array(HM.w * HM.h);
  const v = new THREE.Vector3();
  let tris = 0;
  root.traverse(o => {
    if (!o.isMesh || !o.geometry || o.userData.__outline) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const m = o.matrixWorld;
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < count; i += 3) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, ym = -Infinity;
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx.getX(i + k) : i + k;
        v.fromBufferAttribute(pos, vi).applyMatrix4(m);
        if (v.x < x0) x0 = v.x;
        if (v.x > x1) x1 = v.x;
        if (v.z < z0) z0 = v.z;
        if (v.z > z1) z1 = v.z;
        if (v.y > ym) ym = v.y;
      }
      const cx0 = clamp(Math.floor((x0 - HM.minX) / HM.cell), 0, HM.w - 1);
      const cx1 = clamp(Math.floor((x1 - HM.minX) / HM.cell), 0, HM.w - 1);
      const cz0 = clamp(Math.floor((z0 - HM.minZ) / HM.cell), 0, HM.h - 1);
      const cz1 = clamp(Math.floor((z1 - HM.minZ) / HM.cell), 0, HM.h - 1);
      for (let cz = cz0; cz <= cz1; cz++) {
        const row = cz * HM.w;
        for (let cx = cx0; cx <= cx1; cx++) if (data[row + cx] < ym) data[row + cx] = ym;
      }
      tris++;
    }
  });
  state.tris = tris;
}

function heightAt(x, z) {
  const cx = Math.floor((x - HM.minX) / HM.cell);
  const cz = Math.floor((z - HM.minZ) / HM.cell);
  if (cx < 0 || cz < 0 || cx >= HM.w || cz >= HM.h) return 99;
  return HM.data[cz * HM.w + cx];
}

/* 城市可能带底座：取面积最多的水平面当作路面基准，并整体下移到 y=0 */
function levelToGround(city) {
  const bins = new Map();
  for (let i = 0; i < HM.data.length; i++) {
    const q = Math.round(HM.data[i] * 4) / 4;
    bins.set(q, (bins.get(q) || 0) + 1);
  }
  let level = 0, best = -1;
  bins.forEach((n, h) => { if (n > best) { best = n; level = h; } });
  if (Math.abs(level) < 0.01) return 0;
  for (let i = 0; i < HM.data.length; i++) HM.data[i] -= level;
  city.position.y -= level;
  city.updateMatrixWorld(true);
  return level;
}

const WALL = 3.2;   // 相机遮挡等仍用高度
const STEP = 0.6;   // 地面跟随允许高度（人行道、路缘）

function wallAt(x, z) {
  if (!HM.occ) return false;
  const cx = Math.floor((x - HM.minX) / HM.cell);
  const cz = Math.floor((z - HM.minZ) / HM.cell);
  if (cx < 0 || cz < 0 || cx >= HM.w || cz >= HM.h) return true;
  return HM.occ[cz * HM.w + cx] === 1;
}

function blockedAt(x, z, r = 0.7) {
  return wallAt(x, z) || wallAt(x + r, z) || wallAt(x - r, z) || wallAt(x, z + r) || wallAt(x, z - r);
}

/* 建筑之间的街道净宽中位数，用来把城市缩放到与人车匹配的比例 */
function measureStreetWidth() {
  const runs = [];
  const tall = 4;
  for (let i = 0; i < 4000 && runs.length < 240; i++) {
    const cx = 2 + Math.floor(Math.random() * (HM.w - 4));
    const cz = 2 + Math.floor(Math.random() * (HM.h - 4));
    if (Math.abs(HM.data[cz * HM.w + cx]) > 0.45) continue;
    let rx = 1, rz = 1;
    for (let d = 1; d < 80 && cx + d < HM.w && HM.data[cz * HM.w + cx + d] <= tall; d++) rx++;
    for (let d = 1; d < 80 && cx - d >= 0 && HM.data[cz * HM.w + cx - d] <= tall; d++) rx++;
    for (let d = 1; d < 80 && cz + d < HM.h && HM.data[(cz + d) * HM.w + cx] <= tall; d++) rz++;
    for (let d = 1; d < 80 && cz - d >= 0 && HM.data[(cz - d) * HM.w + cx] <= tall; d++) rz++;
    const w = Math.min(rx, rz) * HM.cell;
    if (w > 2 && w < 60) runs.push(w);
  }
  if (!runs.length) return 0;
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)];
}

/* 缩放城市，使街道净宽接近 target 米（同步缩放高度图） */
function rescaleCity(cityRoot, target) {
  const w = measureStreetWidth();
  if (!w) return 1;
  const k = clamp(target / w, 0.25, 4);
  cityRoot.scale.setScalar(k);
  cityRoot.updateMatrixWorld(true);
  HM.cell *= k;
  HM.minX *= k;
  HM.minZ *= k;
  for (let i = 0; i < HM.data.length; i++) HM.data[i] *= k;
  state.streetW = w * k;
  state.streetRaw = w;
  return k;
}

/* 该点周围的空旷半径（用于找马路中间） */
function openRadius(x, z, max = 7) {
  for (let r = 1; r <= max; r++) {
    for (let a = 0; a < 8; a++) {
      const ang = a * Math.PI / 4;
      if (wallAt(x + Math.cos(ang) * r, z + Math.sin(ang) * r)) return r - 1;
    }
  }
  return max;
}

function findRoadPoint(minOpen = 3, near = null, maxDist = 0) {
  const spanX = HM.w * HM.cell, spanZ = HM.h * HM.cell;
  for (let i = 0; i < 900; i++) {
    let x, z;
    if (near && maxDist) {
      const a = rand(0, Math.PI * 2), d = rand(maxDist * 0.35, maxDist);
      x = near.x + Math.cos(a) * d;
      z = near.z + Math.sin(a) * d;
    } else {
      x = HM.minX + rand(spanX * 0.08, spanX * 0.92);
      z = HM.minZ + rand(spanZ * 0.08, spanZ * 0.92);
    }
    if (Math.abs(heightAt(x, z)) > 0.45) continue;
    if (openRadius(x, z, minOpen + 1) < minOpen) continue;
    return new THREE.Vector3(x, 0, z);
  }
  return new THREE.Vector3(0, 0, 0);
}

function pickSpawn() {
  let best = null;
  for (let i = 0; i < 2500; i++) {
    const x = HM.minX + rand(HM.w * HM.cell * 0.2, HM.w * HM.cell * 0.8);
    const z = HM.minZ + rand(HM.h * HM.cell * 0.2, HM.h * HM.cell * 0.8);
    if (Math.abs(heightAt(x, z)) > 0.4) continue;
    const r = openRadius(x, z, 7);
    if (r < 3) continue;
    // 找一条能向前开的方向
    for (const head of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const fx = Math.sin(head), fz = Math.cos(head);
      let clear = true;
      for (let d = 2; d <= 22; d += 2) if (blockedAt(x + fx * d, z + fz * d, 1.2)) { clear = false; break; }
      if (!clear) continue;
      const score = r * 10 + 22;
      if (!best || score > best.score) best = { pos: new THREE.Vector3(x, 0, z), heading: head, score };
      break;
    }
    if (best && best.score > 90) break;
  }
  return best || { pos: new THREE.Vector3(0, 0, 0), heading: 0 };
}

/* ---------- 邮箱 / 标记 ---------- */
function makeMailbox(pos) {
  const g = new THREE.Group();
  const red = new THREE.MeshToonMaterial({ color: 0xdb3b32, gradientMap: GRAD });
  const dark = new THREE.MeshToonMaterial({ color: 0x39404a, gradientMap: GRAD });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.86, 0.5), red);
  body.position.y = 1.06;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.5, 12, 1, false, 0, Math.PI), red);
  top.rotation.z = Math.PI / 2;
  top.position.y = 1.49;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.66, 8), dark);
  pole.position.y = 0.33;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.04), dark);
  slot.position.set(0, 1.3, 0.26);
  [body, top, pole, slot].forEach(m => { m.castShadow = true; g.add(m); });
  addOutline(g, 0.022);
  g.position.copy(pos);
  scene.add(g);
  return g;
}

function iconSprite(text) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.font = '92px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 70);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
}

function makeMarker(color, icon) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.7, 0.13, 8, 28),
    new THREE.MeshBasicMaterial({ color })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.14;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35, 1.35, 11, 14, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 5.6;
  const sp = iconSprite(icon);
  sp.position.y = 3.2;
  sp.scale.setScalar(1.6);
  g.add(ring, beam, sp);
  g.userData.ring = ring;
  g.userData.icon = sp;
  scene.add(g);
  return g;
}

/* ---------- 玩家（电动车 + 骑手） ---------- */
const player = new THREE.Group();
scene.add(player);
const rig = new THREE.Group();       // 模型朝 +X，转成朝 +Z
rig.rotation.y = -Math.PI / 2;
player.add(rig);
const bikeHolder = new THREE.Group();
const riderHolder = new THREE.Group();
rig.add(bikeHolder, riderHolder);

/* 下车后在世界里独立行走的角色容器 */
const walker = new THREE.Group();
walker.visible = false;
scene.add(walker);
const walkerRig = new THREE.Group();
walkerRig.rotation.y = -Math.PI / 2;
walker.add(walkerRig);

const foot = { speed: 0, vy: 0, air: false, heading: 0 };

/* ---------- 骨骼动画 ---------- */
const boy = { pivot: null, mixer: null, actions: {}, cur: '', seat: new THREE.Vector3() };

/* 同名动画有两套（Armature| 前缀 / 无前缀），挑绑定成功率最高的那条 */
function pickClip(anims, key, root) {
  const hits = anims
    .filter(c => c.name.toLowerCase().endsWith(key))
    .map(c => {
      let ok = 0;
      for (const t of c.tracks) if (root.getObjectByName(t.name.split('.')[0])) ok++;
      return { c, ok };
    })
    .sort((a, b) => b.ok - a.ok);
  return hits.length ? hits[0].c : null;
}

/* 动画自带位移会让角色飘走，去掉根节点平移，改由代码推进 */
function stripRootMotion(clip) {
  const roots = ['Armature', 'Root'];
  clip.tracks = clip.tracks.filter(t => {
    const [node, prop] = t.name.split('.');
    return !(prop === 'position' && roots.includes(node));
  });
  return clip;
}

function playAnim(name, { fade = 0.18, once = false, speed = 1 } = {}) {
  const a = boy.actions[name];
  if (!a) return null;
  a.timeScale = speed;
  if (boy.cur === name) return a;
  const prev = boy.actions[boy.cur];
  a.reset();
  if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
  else a.setLoop(THREE.LoopRepeat, Infinity);
  a.fadeIn(fade).play();
  if (prev && prev !== a) prev.fadeOut(fade);
  boy.cur = name;
  return a;
}

function setRideBtn() {
  const b = $('btnRide');
  if (b) b.textContent = state.onBike ? '下车' : '上车';
}

function dismount() {
  if (!state.onBike || !boy.pivot) return;
  if (Math.abs(state.speed) > 3.2) { toast('停稳后才能下车'); return; }
  state.speed = 0;
  state.onBike = false;
  walkerRig.add(boy.pivot);
  boy.pivot.position.set(0, 0, 0);

  const side = new THREE.Vector3(Math.cos(state.heading), 0, -Math.sin(state.heading));
  let p = player.position.clone().addScaledVector(side, 1.15);
  if (blockedAt(p.x, p.z, CFG.footRadius)) p = player.position.clone().addScaledVector(side, -1.15);
  if (blockedAt(p.x, p.z, CFG.footRadius)) p = player.position.clone();
  walker.position.set(p.x, Math.max(0, heightAt(p.x, p.z)), p.z);
  foot.heading = state.heading;
  foot.speed = 0; foot.vy = 0; foot.air = false;
  walker.rotation.y = foot.heading;
  walker.visible = true;
  boy.cur = '';
  playAnim('idle', { fade: 0.12 });
  setRideBtn();
  toast('下车 · 摇杆走，油门跑，刹车跳');
}

function mount() {
  if (state.onBike || !boy.pivot) return;
  if (walker.position.distanceTo(player.position) > CFG.mountRange) { toast('走到电动车旁再上车'); return; }
  state.onBike = true;
  walker.visible = false;
  riderHolder.add(boy.pivot);
  boy.pivot.position.copy(boy.seat);
  boy.cur = '';
  playAnim('sit', { fade: 0.15 });
  setRideBtn();
  toast('上车 · 油门加速，刹车减速');
}

function toggleRide() { state.onBike ? dismount() : mount(); }

function focusPos() { return state.onBike ? player.position : walker.position; }
function focusHeading() { return state.onBike ? state.heading : foot.heading; }
function focusSpeed() { return state.onBike ? state.speed : foot.speed; }

/* ---------- HUD ---------- */
let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
}
function syncHud() {
  $('coin').textContent = state.coin >= 10000 ? (state.coin / 10000).toFixed(1) + '万' : state.coin;
  $('parcel').textContent = state.parcel;
  $('lvNum').textContent = state.lv;
  $('lvFill').style.width = (state.xp / state.xpMax * 100) + '%';
  $('lvTxt').textContent = state.xp + '/' + state.xpMax;
}
function addXp(n) {
  state.xp += n;
  while (state.xp >= state.xpMax) {
    state.xp -= state.xpMax;
    state.lv++;
    state.xpMax = Math.round(state.xpMax * 1.35);
    toast('升级！Lv.' + state.lv);
  }
  syncHud();
}

const pickupMarker = makeMarker(0xff5a4a, '📮');
const dropMarker = makeMarker(0x38c76a, '🏠');
dropMarker.visible = false;

function nextTask() {
  if (state.phase === 'pickup') {
    let mb = state.mailboxes[Math.floor(Math.random() * state.mailboxes.length)];
    for (let i = 0; i < 6; i++) {
      const c = state.mailboxes[Math.floor(Math.random() * state.mailboxes.length)];
      if (c.position.distanceTo(focusPos()) > 25) { mb = c; break; }
    }
    state.target = mb.position.clone();
    pickupMarker.position.copy(state.target);
    pickupMarker.visible = true;
    dropMarker.visible = false;
    $('taskTitle').textContent = '新的信件';
    $('taskDesc').textContent = '去红色邮箱领取下一封信';
    $('taskIcon').textContent = '📮';
  } else {
    const p = findRoadPoint(2.5, focusPos(), 60);
    state.target = p;
    dropMarker.position.copy(p);
    dropMarker.visible = true;
    pickupMarker.visible = false;
    $('taskTitle').textContent = '送信中';
    $('taskDesc').textContent = '把信送到绿色光柱的住户';
    $('taskIcon').textContent = '✉️';
  }
}

function reachTarget() {
  if (state.phase === 'pickup') {
    state.parcel++;
    state.phase = 'deliver';
    toast('收到一封信 ✉️');
    flyLetter();
  } else {
    state.parcel = Math.max(0, state.parcel - 1);
    const gain = 120 + Math.floor(Math.random() * 80);
    state.coin += gain;
    addXp(35);
    state.phase = 'pickup';
    toast('送达！+' + gain + ' 金币');
    coinPop(gain);
  }
  syncHud();
  nextTask();
}

/* ---------- 输入 ---------- */
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; });
addEventListener('keyup', e => { keys[e.code] = false; });

$('hint').textContent = IS_MOBILE
  ? '摇杆转向 · 油门/刹车 · 「下车」步行'
  : 'W/S 油门刹车 · A/D 转向 · F 上下车 · 步行时 Shift 跑 / 空格跳';
addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
addEventListener('gesturestart', e => e.preventDefault());
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('dblclick', e => e.preventDefault());
addEventListener('orientationchange', () => setTimeout(resize, 250));
document.addEventListener('visibilitychange', () => { if (!document.hidden) clock.getDelta(); });

const stick = $('stick'), knob = $('knob');
let stickId = null;
const stickVec = { x: 0, y: 0 };
function stickMove(t) {
  const r = stick.getBoundingClientRect();
  const dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
  const max = r.width / 2, len = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, max / len);
  stickVec.x = dx * k / max;
  stickVec.y = dy * k / max;
  knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
}
function stickEnd() { stickId = null; stickVec.x = stickVec.y = 0; knob.style.transform = 'translate(0,0)'; }
stick.addEventListener('touchstart', e => { stickId = e.changedTouches[0].identifier; stickMove(e.changedTouches[0]); e.preventDefault(); }, { passive: false });
stick.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) if (t.identifier === stickId) stickMove(t);
  e.preventDefault();
}, { passive: false });
stick.addEventListener('touchend', stickEnd);
stick.addEventListener('touchcancel', stickEnd);
stick.addEventListener('mousedown', e => { stickId = 'm'; stickMove(e); });
addEventListener('mousemove', e => { if (stickId === 'm') stickMove(e); });
addEventListener('mouseup', () => { if (stickId === 'm') stickEnd(); });

let gasOn = false, brakeOn = false, jumpQueued = false;
function hold(el, set) {
  const on = e => { set(true); e.preventDefault(); };
  const off = () => set(false);
  el.addEventListener('touchstart', on, { passive: false });
  el.addEventListener('touchend', off);
  el.addEventListener('touchcancel', off);
  el.addEventListener('mousedown', on);
  el.addEventListener('mouseup', off);
  el.addEventListener('mouseleave', off);
}
hold($('gas'), v => gasOn = v);
hold($('brake'), v => {
  if (v && !brakeOn && !state.onBike) jumpQueued = true;   // 下车时刹车键 = 跳
  brakeOn = v;
});
if ($('btnRide')) $('btnRide').addEventListener('click', toggleRide);
addEventListener('keydown', e => {
  if (e.code === 'KeyF') toggleRide();
  if (e.code === 'Space' && !state.onBike) jumpQueued = true;
});

const PANELS = {
  bag: ['🎒 背包', [['✉️', '平信'], ['📦', '包裹'], ['🥤', '汽水'], ['🔧', '扳手'], ['🗺️', '地图'], ['🎫', '优惠券']]],
  task: ['📒 任务笔记', [['📮', '取信'], ['🏠', '送信'], ['⭐', '好评'], ['⏱️', '限时'], ['🏅', '成就'], ['🧧', '红包']]],
  shop: ['🛒 商店', [['🛵', '车辆改装'], ['⚡', '电量+'], ['🎽', '皮肤'], ['🧰', '扩容'], ['🔔', '喇叭'], ['💡', '车灯']]]
};
document.querySelectorAll('.bbtn').forEach(b => b.addEventListener('click', () => {
  const [title, cells] = PANELS[b.dataset.panel];
  $('pTitle').textContent = title;
  $('pList').innerHTML = cells.map(([e, t]) => `<div class="cell"><em>${e}</em>${t}</div>`).join('');
  $('mask').classList.add('on');
}));
$('pClose').onclick = () => $('mask').classList.remove('on');
$('btnGear').onclick = () => toast('Demo 版本 · 送信赚金币升级');
document.querySelector('.taskbar').addEventListener('click', () =>
  document.querySelector('.bbtn[data-panel="task"]').click());
document.querySelectorAll('.res .plus').forEach(p => p.addEventListener('click', e => {
  e.stopPropagation();
  document.querySelector('.bbtn[data-panel="shop"]').click();
}));

/* ---------- 小地图 ---------- */
const mini = $('mini'), mg = mini.getContext('2d');
function buildMiniImage() {
  const cv = document.createElement('canvas');
  cv.width = HM.w; cv.height = HM.h;
  const g = cv.getContext('2d');
  const img = g.createImageData(HM.w, HM.h);
  for (let i = 0; i < HM.w * HM.h; i++) {
    const h = HM.data[i];
    let r, gg, b;
    if (HM.occ && HM.occ[i]) { r = 186; gg = 178; b = 166; }
    else if (Math.abs(h) <= 0.06) { r = 42; gg = 48; b = 54; }
    else if (h < WALL) { r = 96; gg = 104; b = 112; }
    else if (h < 14) { r = 168; gg = 158; b = 142; }
    else { r = 206; gg = 198; b = 186; }
    img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  HM.img = cv;
}
function drawMini() {
  const S = mini.width, R = 62;
  const fp = focusPos();
  mg.fillStyle = '#1a222a';
  mg.fillRect(0, 0, S, S);
  if (HM.img) {
    const k = S / (R * 2);
    const sx = (fp.x - R - HM.minX) / HM.cell;
    const sz = (fp.z - R - HM.minZ) / HM.cell;
    const sw = (R * 2) / HM.cell;
    mg.imageSmoothingEnabled = false;
    mg.drawImage(HM.img, sx, sz, sw, sw, 0, 0, S, S);
    if (state.target) {
      const dx = state.target.x - fp.x, dz = state.target.z - fp.z;
      const d = Math.hypot(dx, dz);
      const c = d > R ? R / d : 1;
      mg.fillStyle = state.phase === 'pickup' ? '#ff5a4a' : '#38c76a';
      mg.beginPath();
      mg.arc((dx * c + R) * k, (dz * c + R) * k, 7, 0, 7);
      mg.fill();
    }
    if (!state.onBike) {
      const dx = (player.position.x - fp.x) * k, dz = (player.position.z - fp.z) * k;
      if (Math.abs(dx) < S / 2 - 4 && Math.abs(dz) < S / 2 - 4) {
        mg.fillStyle = '#ff9d2e';
        mg.beginPath();
        mg.arc(S / 2 + dx, S / 2 + dz, 4, 0, 7);
        mg.fill();
      }
    }
    mg.fillStyle = '#10161c';
    for (const car of traffic) {
      if (car.mesh.position.y < -10) continue;
      const dx = (car.x - fp.x) * k, dz = (car.z - fp.z) * k;
      if (Math.abs(dx) > S / 2 - 3 || Math.abs(dz) > S / 2 - 3) continue;
      mg.fillRect(S / 2 + dx - 2, S / 2 + dz - 2, 4, 4);
    }
  }
  mg.save();
  mg.translate(S / 2, S / 2);
  mg.rotate(-focusHeading());
  mg.fillStyle = '#ffd24a';
  mg.beginPath();
  mg.moveTo(0, -10); mg.lineTo(7, 9); mg.lineTo(0, 4); mg.lineTo(-7, 9);
  mg.closePath();
  mg.fill();
  mg.restore();
}

/* ---------- 物理 ---------- */
const forward = new THREE.Vector3();
function updatePlayer(dt) {
  let th = 0, st = 0;
  if (AUTO) th += 1;
  if (keys.KeyW || keys.ArrowUp || gasOn) th += 1;
  if (keys.KeyS || keys.ArrowDown || brakeOn) th -= 1;
  if (keys.KeyA || keys.ArrowLeft) st += 1;
  if (keys.KeyD || keys.ArrowRight) st -= 1;
  st -= stickVec.x;
  if (stickVec.y < -0.25) th += -stickVec.y;
  if (stickVec.y > 0.25) th -= stickVec.y;
  th = clamp(th, -1, 1);
  st = clamp(st, -1, 1);

  if (th > 0) state.speed += CFG.accel * th * dt;
  else if (th < 0) {
    if (state.speed > 0.1) state.speed -= CFG.brake * (-th) * dt;
    else state.speed -= CFG.accel * 0.5 * (-th) * dt;
  }
  state.speed -= state.speed * CFG.drag * dt;
  if (keys.Space) state.speed -= Math.sign(state.speed) * CFG.brake * 1.2 * dt;
  state.speed = clamp(state.speed, -5, CFG.maxSpeed);
  if (Math.abs(state.speed) < 0.05) state.speed = 0;

  const grip = clamp(Math.abs(state.speed) / 3.5, 0, 1);
  state.heading += st * CFG.steer * dt * grip * Math.sign(state.speed || 1);
  player.rotation.y = state.heading;

  forward.set(Math.sin(state.heading), 0, Math.cos(state.heading));
  const step = state.speed * dt;
  const x = player.position.x, z = player.position.z;
  let nx = x + forward.x * step, nz = z + forward.z * step;
  let hit = false;
  if (blockedAt(nx, nz)) {
    hit = true;
    nx = x + forward.x * step;
    nz = z;
    if (blockedAt(nx, nz)) {
      nx = x;
      nz = z + forward.z * step;
      if (blockedAt(nx, nz)) { nx = x; nz = z; }
    }
  }
  if (hit) state.speed *= 0.35;
  if (hit) state.hits = (state.hits || 0) + 1;
  player.position.x = nx;
  player.position.z = nz;
  const gh = heightAt(nx, nz);
  const targetY = Math.abs(gh) < STEP ? gh : 0;
  player.position.y += (targetY - player.position.y) * Math.min(1, dt * 8);

  const lean = -st * clamp(Math.abs(state.speed) / CFG.maxSpeed, 0, 1) * 0.3;
  rig.rotation.z += (lean - rig.rotation.z) * Math.min(1, dt * 8);
}

/* ---------- 步行 / 跑 / 跳 ---------- */
const camF = new THREE.Vector3(), camR = new THREE.Vector3(), moveDir = new THREE.Vector3();
function updateFoot(dt) {
  camera.getWorldDirection(camF);
  camF.y = 0;
  if (camF.lengthSq() < 1e-6) camF.set(0, 0, 1);
  camF.normalize();
  camR.set(-camF.z, 0, camF.x);          // 屏幕右方向

  moveDir.set(0, 0, 0);
  moveDir.addScaledVector(camF, -stickVec.y).addScaledVector(camR, stickVec.x);
  if (keys.KeyW || keys.ArrowUp) moveDir.add(camF);
  if (keys.KeyS || keys.ArrowDown) moveDir.sub(camF);
  if (keys.KeyD || keys.ArrowRight) moveDir.add(camR);
  if (keys.KeyA || keys.ArrowLeft) moveDir.sub(camR);
  if (AUTO) moveDir.add(camF);

  const running = gasOn || keys.ShiftLeft || keys.ShiftRight;
  let mag = Math.min(1, moveDir.length());
  if (mag > 0.08) {
    moveDir.normalize();
    const target = (running ? CFG.runSpeed : CFG.walkSpeed) * mag;
    foot.speed += (target - foot.speed) * Math.min(1, dt * 9);
    const want = Math.atan2(moveDir.x, moveDir.z);
    let dh = want - foot.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    foot.heading += dh * Math.min(1, dt * CFG.footTurn);
  } else {
    mag = 0;
    foot.speed += (0 - foot.speed) * Math.min(1, dt * 12);
    if (foot.speed < 0.05) foot.speed = 0;
  }
  walker.rotation.y = foot.heading;

  if (jumpQueued) {
    jumpQueued = false;
    if (!foot.air) {
      foot.air = true;
      foot.vy = CFG.jumpVel;
      boy.cur = '';
      playAnim('jump', { fade: 0.06, once: true, speed: 1.35 });
    }
  }

  const fx = Math.sin(foot.heading), fz = Math.cos(foot.heading);
  const step = foot.speed * dt;
  const x = walker.position.x, z = walker.position.z;
  let nx = x + fx * step, nz = z + fz * step;
  if (blockedAt(nx, nz, CFG.footRadius)) {
    nx = x + fx * step; nz = z;
    if (blockedAt(nx, nz, CFG.footRadius)) {
      nx = x; nz = z + fz * step;
      if (blockedAt(nx, nz, CFG.footRadius)) { nx = x; nz = z; foot.speed *= 0.3; }
    }
  }
  walker.position.x = nx;
  walker.position.z = nz;

  const gh = heightAt(nx, nz);
  const ground = Math.abs(gh) < STEP + 0.6 ? gh : 0;
  if (foot.air) {
    foot.vy -= CFG.gravity * dt;
    walker.position.y += foot.vy * dt;
    if (walker.position.y <= ground && foot.vy < 0) {
      walker.position.y = ground;
      foot.air = false;
      foot.vy = 0;
      boy.cur = '';
    }
  } else {
    walker.position.y += (ground - walker.position.y) * Math.min(1, dt * 10);
  }

  if (!foot.air) {
    if (foot.speed > CFG.walkSpeed * 1.15) playAnim('run', { fade: 0.16, speed: clamp(foot.speed / CFG.runSpeed, 0.65, 1.5) });
    else if (foot.speed > 0.2) playAnim('walk', { fade: 0.16, speed: clamp(foot.speed / CFG.walkSpeed, 0.5, 1.6) });
    else playAnim('idle', { fade: 0.2 });
  }
}

const camGoal = new THREE.Vector3(), lookGoal = new THREE.Vector3();
const camDir = new THREE.Vector3();
const INSPECT = /(\?|&)insp/.test(location.search);
function cameraDistance(want, p) {
  for (let d = 3; d <= want; d += 0.6) {
    const cy = p.y + 2.6 + d * 0.22;
    if (heightAt(p.x - camDir.x * d, p.z - camDir.z * d) > cy - 0.3) return Math.max(5.5, d - 0.8);
  }
  return want;
}
function updateCamera(dt) {
  const p = focusPos();
  if (INSPECT) {
    camera.position.set(p.x + 3.4, p.y + 1.2, p.z + 0.6);
    camera.lookAt(p.x, p.y + 0.9, p.z);
    return;
  }
  /* 骑车时机身朝向即镜头朝向；步行时镜头慢慢跟上，避免和「相机相对」操作互相带偏 */
  if (state.onBike) {
    state.camYaw = state.heading;
    camDir.copy(forward);
  } else {
    let dh = foot.heading - state.camYaw;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const rate = foot.speed > 0.3 ? 1.8 : 0.5;
    state.camYaw += dh * Math.min(1, dt * rate);
    camDir.set(Math.sin(state.camYaw), 0, Math.cos(state.camYaw));
  }

  const base = state.onBike ? 9.6 + Math.abs(state.speed) * 0.18 : 5.6 + foot.speed * 0.2;
  const back = cameraDistance(base, p);
  const high = state.onBike ? 2.6 : 1.9;
  camGoal.set(p.x - camDir.x * back, p.y + high + back * 0.22, p.z - camDir.z * back);
  lookGoal.set(p.x + camDir.x * 4.2, p.y + (state.onBike ? 1.3 : 1.1), p.z + camDir.z * 4.2);
  const k = Math.min(1, dt * (state.onBike ? 6 : 7));
  camera.position.lerp(camGoal, k);
  camera.lookAt(lookGoal);
}

function updateMarkers(dt, time) {
  [pickupMarker, dropMarker].forEach(m => {
    if (!m.visible) return;
    m.userData.ring.rotation.z += dt * 1.6;
    m.userData.icon.position.y = 3.2 + Math.sin(time * 2.2) * 0.22;
  });
  if (!state.target) return;
  const p = focusPos();
  const d = Math.hypot(state.target.x - p.x, state.target.z - p.z);
  $('dist').textContent = Math.round(d) + ' m';
  const ang = Math.atan2(state.target.x - p.x, state.target.z - p.z) - focusHeading();
  $('arw').style.transform = `rotate(${(-ang * 180 / Math.PI)}deg)`;
  if (d < CFG.reachRadius && Math.abs(focusSpeed()) < 6) reachTarget();
}

/* ---------- 主循环 ---------- */
const clock = new THREE.Clock();
function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  if (state.onBike) updatePlayer(dt);
  else updateFoot(dt);
  if (boy.mixer) boy.mixer.update(dt);
  updateTraffic(dt);
  updateCamera(dt);
  updateMarkers(dt, time);

  const fp = focusPos();
  sun.position.set(fp.x + 46, 86, fp.z + 38);
  sun.target.position.copy(fp);
  sky.position.set(camera.position.x, 0, camera.position.z);
  for (const c of clouds) {
    c.sp.position.x += c.spd * dt;
    if (c.sp.position.x > camera.position.x + 400) c.sp.position.x = camera.position.x - 400;
  }

  $('spd').textContent = Math.round(Math.abs(focusSpeed()) * 3.6);
  if (DEBUG && time - (state.dbgT || 0) > 0.5) {
    state.dbgT = time;
    const r = renderer.info.render;
    $('dbg').textContent = `draw=${r.calls} tri=${(r.triangles / 1000) | 0}k fps=${(1 / Math.max(dt, 0.001)) | 0}\n` +
      `pos=${fp.x.toFixed(0)},${fp.z.toFixed(0)} y=${fp.y.toFixed(2)}` +
      ` ${state.onBike ? '骑车' : '步行 ' + boy.cur} 街宽=${(state.streetW || 0).toFixed(1)}m`;
  }
  drawMini();
  renderer.render(scene, camera);
}

/* ---------- 启动 ---------- */
async function boot() {
  resize();
  setProgress(0.03, '加载城市模型…');
  const city = await loadOne('./assets/city-lowpoly.fbx', f => setProgress(0.03 + f * 0.42));
  setProgress(0.48, '布置街道…');
  normalize(city, { span: CFG.citySpan });
  toonify(city, { map: inkTexture(await loadTex('./assets/City_low_poly_1024.png')) });
  const cityRoot = new THREE.Group();
  cityRoot.add(city);
  scene.add(cityRoot);
  await new Promise(r => setTimeout(r, 16));

  setProgress(0.55, '计算碰撞地图…');
  buildHeightmap(city);
  state.level = levelToGround(city);
  state.scale = rescaleCity(cityRoot, CFG.streetWidth);
  buildCollision(cityRoot);
  buildMiniImage();
  await new Promise(r => setTimeout(r, 16));

  setProgress(0.62, '优化渲染批次…');
  const merged = mergeCity(cityRoot);
  if (merged) {
    scene.add(merged);
    setProgress(0.66, '勾描边线…');
    await new Promise(r => setTimeout(r, 16));
    addOutline(merged, 0.105);
  }

  setProgress(0.7, '加载电动车…');
  const bikeRoot = await loadOne('./assets/motuo.fbx');
  const bikeSize = normalize(bikeRoot, { span: CFG.bikeLen });
  toonify(bikeRoot, { map: inkTexture(await loadTex('./assets/motuo_basecolor.jpg'), { threshold: 0.16 }) });
  const bikeFlat = flatten(bikeRoot);
  const bikeMesh = new THREE.Mesh(bikeFlat.geometry, bikeFlat.material);
  bikeMesh.castShadow = true;
  bikeMesh.receiveShadow = true;
  bikeHolder.add(bikeMesh);
  addOutline(bikeHolder, 0.021);

  setProgress(0.85, '加载骑手…');
  const boyRoot = await loadOne('./assets/the-boy.fbx');
  normalize(boyRoot, { height: CFG.riderHeight });
  toonify(boyRoot, { map: inkTexture(await loadTex('./assets/the-boy_basecolor.jpg'), { threshold: 0.16 }) });
  boyRoot.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  addOutline(boyRoot, 0.013);

  boy.pivot = new THREE.Group();
  boy.pivot.add(boyRoot);
  boy.mixer = new THREE.AnimationMixer(boyRoot);

  const clipOf = k => pickClip(boyRoot.animations, k, boyRoot);
  const sitClip = clipOf('sit');
  const walkClip = clipOf('walk');
  const runClip = clipOf('run');
  const jumpClip = clipOf('jump');
  if (walkClip) stripRootMotion(walkClip);
  if (runClip) stripRootMotion(runClip);
  if (jumpClip) stripRootMotion(jumpClip);
  if (sitClip) boy.actions.sit = boy.mixer.clipAction(sitClip);
  if (walkClip) {
    boy.actions.walk = boy.mixer.clipAction(walkClip);
    /* 没有站立待机动画：用行走片段的第一帧当站姿 */
    const idle = boy.mixer.clipAction(walkClip.clone());
    idle.timeScale = 0;
    boy.actions.idle = idle;
  }
  if (runClip) boy.actions.run = boy.mixer.clipAction(runClip);
  if (jumpClip) boy.actions.jump = boy.mixer.clipAction(jumpClip);

  /* 用骑坐姿势下的骨盆高度对齐座垫，避免人浮在车上或陷进车里 */
  scene.add(boy.pivot);
  boy.pivot.position.set(0, 0, 0);
  playAnim('sit', { fade: 0 });
  boy.mixer.update(0.001);
  boy.pivot.updateMatrixWorld(true);
  const pelvis = boyRoot.getObjectByName('Pelvis') || boyRoot.getObjectByName('Hip');
  const pelvisY = pelvis ? pelvis.getWorldPosition(new THREE.Vector3()).y : CFG.riderHeight * 0.5;
  boy.seat.set(-0.10, bikeSize.y * 0.60 - pelvisY, 0);
  scene.remove(boy.pivot);
  riderHolder.add(boy.pivot);
  boy.pivot.position.copy(boy.seat);
  setRideBtn();

  setProgress(0.93, '投放邮箱…');
  for (let i = 0; i < 9; i++) {
    const p = findRoadPoint(3);
    const a = Math.random() * Math.PI * 2;
    p.x += Math.cos(a) * 2.2;
    p.z += Math.sin(a) * 2.2;
    p.y = Math.max(0, heightAt(p.x, p.z));
    state.mailboxes.push(makeMailbox(p));
  }

  setProgress(0.96, '布置车流与街景…');
  placeParked(IS_MOBILE ? 9 : 14);
  placeSakura(IS_MOBILE ? 12 : 20);
  await new Promise(r => setTimeout(r, 16));

  const spawn = pickSpawn();
  player.position.copy(spawn.pos);
  state.heading = spawn.heading;
  player.rotation.y = spawn.heading;
  forward.set(Math.sin(spawn.heading), 0, Math.cos(spawn.heading));
  state.camYaw = spawn.heading;
  camera.position.set(spawn.pos.x - forward.x * 8, 4.2, spawn.pos.z - forward.z * 8);
  camera.lookAt(spawn.pos.x, 1.2, spawn.pos.z);
  initTraffic(IS_MOBILE ? 7 : 11);
  if (/(\?|&)foot/.test(location.search)) dismount();

  syncHud();
  nextTask();
  if (/(\?|&)fx/.test(location.search)) setInterval(() => { flyLetter(); coinPop(128); }, 700);
  setProgress(1, '出发！');
  $('loading').style.display = 'none';
  renderer.render(scene, camera);

  if (/(\?|&)footest/.test(location.search)) {
    const boneOf = boyRoot.getObjectByName('R_Thigh');
    const snap = () => boneOf ? boneOf.quaternion.clone() : null;
    const res = [];
    const run2 = (label, secs, opts) => {
      gasOn = !!opts.run;
      stickVec.x = 0; stickVec.y = -1;
      if (opts.stop) { stickVec.y = 0; gasOn = false; }
      if (opts.jump) jumpQueued = true;
      const p0 = walker.position.clone();
      const q0 = snap();
      let air = 0, maxY = walker.position.y;
      const n = Math.round(secs * 60);
      for (let i = 0; i < n; i++) {
        updateFoot(1 / 60);
        boy.mixer.update(1 / 60);
        if (foot.air) air += 1 / 60;
        maxY = Math.max(maxY, walker.position.y);
      }
      const q1 = snap();
      const bone = q0 && q1 ? (1 - Math.abs(q0.dot(q1))).toFixed(4) : 'n/a';
      res.push(`${label}: 位移${p0.distanceTo(walker.position).toFixed(2)}m 速度${foot.speed.toFixed(2)}m/s ` +
        `动作=${boy.cur} 骨骼变化=${bone} 滞空${air.toFixed(2)}s 最高y=${(maxY - p0.y).toFixed(2)}m`);
    };
    dismount();
    run2('走 2s', 2, {});
    run2('跑 2s', 2, { run: true });
    run2('跳', 1.6, { jump: true, run: false });
    run2('站 1s', 1, { stop: true });
    stickVec.x = stickVec.y = 0; gasOn = false;
    $('dbg').textContent = res.join('\n');
    renderer.render(scene, camera);
    return;
  }

  if (SELFTEST) {
    gasOn = true;
    const res = [];
    for (let t = 0; t < 6; t++) {
      const sp = pickSpawn();
      player.position.copy(sp.pos);
      state.heading = sp.heading;
      state.speed = 0;
      state.hits = 0;
      let dist = 0;
      const p0 = player.position.clone();
      for (let i = 0; i < 1200; i++) {
        const before = player.position.clone();
        updatePlayer(1 / 60);
        dist += before.distanceTo(player.position);
      }
      res.push(`#${t} 行驶${dist.toFixed(0)}m 直线${p0.distanceTo(player.position).toFixed(0)}m 撞击${state.hits}次 末速${(state.speed * 3.6).toFixed(0)}km/h`);
    }
    $('dbg').textContent = `街宽=${(state.streetW || 0).toFixed(1)}m 墙格=${state.wallCells}\n` + res.join('\n');
    renderer.render(scene, camera);
    return;
  }

  if (DEBUG) { loop(); return; }
  const gate = $('start');
  gate.classList.add('on');
  $('btnStart').addEventListener('click', () => {
    gate.classList.remove('on');
    goFullscreen();
    resize();
    clock.getDelta();
    loop();
  }, { once: true });
}

function goFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (fn && !document.fullscreenElement) fn.call(el).catch(() => {});
  if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(() => {});
}

boot().catch(e => {
  $('ldErr').textContent = '加载失败：\n' + (e && (e.stack || e.message || e));
});
