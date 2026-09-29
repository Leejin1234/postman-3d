import * as T from 'three';
import { mergeGeometries } from './vendor/utils/BufferGeometryUtils.js';

const hash = name => { let h = 2166136261; for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

// Original geometry, inspired by Polygon Runway's forked trunks and pointed leaf crowns.
export function buildStylizedTree(seed = 1, stride = 1) {
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const parts = [], leafPositions = [], leafNormals = [], leafColors = [];
  const bark = new T.Color('#70402b'), barkLight = new T.Color('#9a5736');
  function branch(start, end, bottom, top) {
    const a = new T.Vector3(...start), b = new T.Vector3(...end), d = b.clone().sub(a);
    const geo = new T.CylinderGeometry(top, bottom, d.length(), 7, 1).toNonIndexed();
    geo.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.clone().normalize()));
    geo.translate(...a.add(b).multiplyScalar(.5).toArray());
    const colors = [];
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const color = bark.clone().lerp(barkLight, .25 + .4 * Math.max(0, geo.attributes.normal.getX(i)));
      colors.push(color.r, color.g, color.b);
    }
    geo.deleteAttribute('uv'); geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); parts.push(geo);
  }
  branch([0, 0, 0], [.035, .29, -.012], .049, .034);
  branch([.035, .28, -.012], [-.035, .49, .025], .035, .024);
  branch([-.035, .47, .025], [-.16, .69, .015], .024, .009);
  branch([-.005, .39, .014], [.17, .55, -.035], .025, .017);
  branch([.17, .54, -.035], [.21, .77, -.015], .017, .006);
  branch([-.045, .48, .02], [-.045, .73, .16], .021, .007);
  const crowns = [[-.17,.71,0,.23,.23,.23],[.19,.76,-.015,.24,.25,.23],[-.02,.89,.015,.24,.22,.22],[-.03,.75,.18,.22,.20,.20],[.015,.70,-.17,.24,.21,.20]];
  const dark = new T.Color('#245936'), mid = new T.Color('#56823c'), light = new T.Color('#b5c966');
  const center = new T.Vector3(), normal = new T.Vector3(), tangent = new T.Vector3(), bitangent = new T.Vector3(), point = new T.Vector3();
  for (const [x,y,z,rx,ry,rz] of crowns) {
    for (let i = 0; i < 92; i++) {
      const h = random() * 2 - 1, angle = random() * Math.PI * 2, radial = Math.sqrt(1 - h * h);
      normal.set(radial * Math.cos(angle), h, radial * Math.sin(angle));
      const depth = .72 + random() * .28;
      center.set(x + normal.x * rx * depth, y + normal.y * ry * depth, z + normal.z * rz * depth);
      tangent.set(Math.cos(angle), .25 + random() * .65, Math.sin(angle)).normalize();
      bitangent.crossVectors(normal, tangent);
      if (bitangent.lengthSq() < .01) bitangent.set(1,0,0).cross(normal);
      bitangent.normalize(); tangent.crossVectors(bitangent, normal).normalize();
      tangent.applyAxisAngle(normal, random() * Math.PI * 2);
      bitangent.crossVectors(normal,tangent).normalize();
      const length = (.062 + random() * .045) * Math.sqrt(stride), width = length * (.40 + random() * .20);
      const tint = T.MathUtils.clamp((center.y - .50) / .52 + (random() - .5) * .24, 0, 1);
      const color = tint < .5 ? dark.clone().lerp(mid, tint * 2) : mid.clone().lerp(light, (tint - .5) * 2);
      if (i % stride !== 0) continue;
      // Folded pointed leaf: the ridge catches light without a texture or alpha overdraw.
      const shape = [[0,-length,0],[-width,0,0],[0,length,0],[width,0,0],[0,0,.013]];
      for (const index of [0,1,4,1,2,4,2,3,4,3,0,4]) {
        const v = shape[index]; point.copy(center).addScaledVector(tangent,v[1]).addScaledVector(bitangent,v[0]).addScaledVector(normal,v[2]);
        leafPositions.push(point.x,point.y,point.z);
        // Use crown normals for cohesive soft foliage lighting.
        leafNormals.push(normal.x,normal.y,normal.z);
        const shade = index === 4 ? 1.045 : 1;
        leafColors.push(color.r * shade,color.g * shade,color.b * shade);
      }
    }
  }
  const leaves = new T.BufferGeometry();
  leaves.setAttribute('position',new T.Float32BufferAttribute(leafPositions,3));
  leaves.setAttribute('normal',new T.Float32BufferAttribute(leafNormals,3));
  leaves.setAttribute('color',new T.Float32BufferAttribute(leafColors,3));
  const trunk = mergeGeometries(parts, false), geometry = mergeGeometries([trunk,leaves], false);
  for (const part of [...parts,leaves]) part.dispose();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { geometry, trunk };
}

export function replaceStylizedTrees(city, { mobile = false } = {}) {
  city.updateMatrixWorld(true);
  const trees = []; city.traverse(o => { if (o.isMesh && /^Tree_/.test(o.name)) trees.push(o); });
  const variants = Array.from({length:6}, (_, i) => buildStylizedTree(817 + i * 397, mobile ? 2 : 1));
  const distant = Array.from({length:6}, (_, i) => buildStylizedTree(817 + i * 397, 4));
  const profiles = new Map();
  const material = new T.MeshLambertMaterial({ vertexColors:true, side:T.DoubleSide });
  material.name = 'StylizedTree';
  const point = new T.Vector3(), pivot = new T.Vector3(), up = new T.Vector3(), local = new T.Vector3();
  const axis = new T.Vector3(0,1,0), q = new T.Quaternion(), yaw = new T.Quaternion(), scale = new T.Vector3();
  const matrix = new T.Matrix4(); let oldTriangles = 0;
  for (const tree of trees) {
    const id = hash(tree.name), variant = variants[id % variants.length];
    tree.getWorldPosition(pivot); up.copy(pivot).normalize();
    let bottom = Infinity, top = -Infinity;
    const pos = tree.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      point.fromBufferAttribute(pos,i).applyMatrix4(tree.matrixWorld); const h = point.dot(up);
      bottom = Math.min(bottom,h); top = Math.max(top,h);
    }
    let oldTrunkRadius = 0;
    for (let i = 0; i < pos.count; i++) {
      point.fromBufferAttribute(pos,i).applyMatrix4(tree.matrixWorld);
      if (point.dot(up) > bottom + .7) continue;
      local.copy(point).sub(pivot); local.addScaledVector(up,-local.dot(up));
      oldTrunkRadius = Math.max(oldTrunkRadius,local.length());
    }
    const height = T.MathUtils.clamp(top-bottom,22,48);
    const width = height * (.88 + (id % 101) / 500);
    // Preserve narrow street-tree bases instead of widening their collision footprint.
    const ratio = Math.min(1, Math.max(.3,oldTrunkRadius) / (.049 * width));
    const trunkScale = Math.max(.1,Math.floor(ratio * 10)/10), profileKey = `${id % variants.length}:${trunkScale}`;
    if (!profiles.has(profileKey)) {
      const geo = variant.geometry.clone(), trunk = variant.trunk.clone(), far = distant[id % variants.length].geometry.clone();
      const trunkVertexCount = trunk.attributes.position.count;
      for (const g of [geo,trunk,far]) {
        const p = g.attributes.position;
        for (let i=0;i<Math.min(p.count,trunkVertexCount);i++) {
          const blend = 1 - T.MathUtils.smoothstep(p.getY(i),0,.25);
          p.setX(i,p.getX(i)*(1-blend+blend*trunkScale)); p.setZ(i,p.getZ(i)*(1-blend+blend*trunkScale));
        }
        g.computeBoundingBox(); g.computeBoundingSphere();
      }
      profiles.set(profileKey,{geometry:geo,trunk,far});
    }
    pivot.addScaledVector(up,bottom-pivot.dot(up)-.12);
    q.setFromUnitVectors(axis,up).multiply(yaw.setFromAxisAngle(axis,(id%6283)/1000));
    matrix.compose(pivot,q,scale.set(width,height,width));
    // Share crown/base profiles instead of allocating a separate geometry per tree.
    matrix.premultiply(tree.parent.matrixWorld.clone().invert());
    oldTriangles += (tree.geometry.index?.count ?? pos.count)/3;
    matrix.decompose(tree.position,tree.quaternion,tree.scale);
    tree.geometry=profiles.get(profileKey).geometry; tree.material=material;
    tree.userData.collisionGeometry=profiles.get(profileKey).trunk;
    tree.userData.stylizedTree=true;
    tree.userData.treeLod={near:tree.geometry,far:profiles.get(profileKey).far};
  }
  for(const variant of [...variants,...distant]){variant.geometry.dispose();variant.trunk.dispose();}
  city.updateMatrixWorld(true);
  return { trees:trees.length,oldTriangles,triangles:trees.reduce((n,t)=>n+t.geometry.attributes.position.count/3,0),variants:6,sharedGeometries:profiles.size };
}
