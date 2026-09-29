import * as T from 'three';
import { mergeGeometries } from './vendor/utils/BufferGeometryUtils.js';

const hash = name => { let h = 2166136261; for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

// Analytic disks keep a genuinely circular silhouette with only two triangles.
function circularLeaves(material) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 leafDiskUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nleafDiskUv = uv;');
    shader.fragmentShader = 'varying vec2 leafDiskUv;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      if (leafDiskUv.x >= 0.0) {
        vec2 disk = leafDiskUv * 2.0 - 1.0;
        if (dot(disk, disk) > 1.0) discard;
      }`);
  };
  material.customProgramCacheKey = () => 'circular-tree-leaves-v1';
  return material;
}

export function createTreeMaterial() {
  return circularLeaves(new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide}));
}

// Rounded overlapping foliage inspired by brainchildpl's stylized tree tutorial.
export function buildStylizedTree(seed = 1, stride = 1) {
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const parts = [], leafPositions = [], leafNormals = [], leafColors = [], leafUvs = [];
  const bark = new T.Color('#65554a'), barkLight = new T.Color('#877260');
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
    geo.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2).fill(-2),2));
    geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); parts.push(geo);
  }
  branch([0, 0, 0], [.035, .29, -.012], .049, .034);
  branch([.035, .28, -.012], [-.035, .49, .025], .035, .024);
  branch([-.035, .47, .025], [-.16, .69, .015], .024, .009);
  branch([-.005, .39, .014], [.17, .55, -.035], .025, .017);
  branch([.17, .54, -.035], [.21, .77, -.015], .017, .006);
  branch([-.045, .48, .02], [-.045, .73, .16], .021, .007);
  const crowns = [[-.17,.71,0,.23,.23,.23],[.19,.76,-.015,.24,.25,.23],[-.02,.89,.015,.24,.22,.22],[-.03,.75,.18,.22,.20,.20],[.015,.70,-.17,.24,.21,.20]];
  const dark = new T.Color('#39734b'), mid = new T.Color('#78a653'), light = new T.Color('#bcd783');
  const center = new T.Vector3(), normal = new T.Vector3(), tangent = new T.Vector3(), bitangent = new T.Vector3(), point = new T.Vector3();
  for (const [x,y,z,rx,ry,rz] of crowns) {
    for (let i = 0; i < 96; i++) {
      const h = 1 - 2 * (i + .25 + random() * .5) / 96, angle = i * 2.399963 + random() * .3, radial = Math.sqrt(1 - h * h);
      normal.set(radial * Math.cos(angle), h, radial * Math.sin(angle));
      const depth = .88 + random() * .12;
      center.set(x + normal.x * rx * depth, y + normal.y * ry * depth, z + normal.z * rz * depth);
      tangent.set(Math.cos(angle), .25 + random() * .65, Math.sin(angle)).normalize();
      bitangent.crossVectors(normal, tangent);
      if (bitangent.lengthSq() < .01) bitangent.set(1,0,0).cross(normal);
      bitangent.normalize(); tangent.crossVectors(bitangent, normal).normalize();
      tangent.applyAxisAngle(normal, random() * Math.PI * 2);
      bitangent.crossVectors(normal,tangent).normalize();
      const radius = (.064 + random() * .022) * Math.sqrt(stride);
      random(); // Preserve all other random choices and placements.
      const tint = T.MathUtils.clamp((center.y - .50) / .52 + (random() - .5) * .24, 0, 1);
      const color = tint < .5 ? dark.clone().lerp(mid, tint * 2) : mid.clone().lerp(light, (tint - .5) * 2);
      if (i % stride !== 0) continue;
      const shape = [[-1,-1],[1,-1],[1,1],[-1,1]];
      for (const index of [0,2,1,0,3,2]) {
        const v = shape[index]; point.copy(center).addScaledVector(tangent,v[1]*radius).addScaledVector(bitangent,v[0]*radius);
        leafPositions.push(point.x,point.y,point.z);
        leafUvs.push((v[0]+1)*.5,(v[1]+1)*.5);
        // Use crown normals for cohesive soft foliage lighting.
        const ny = normal.y * .6 + .4, nl = Math.hypot(normal.x,ny,normal.z);
        leafNormals.push(normal.x/nl,ny/nl,normal.z/nl);
        const shade = 1;
        leafColors.push(color.r * shade,color.g * shade,color.b * shade);
      }
    }
  }
  const leaves = new T.BufferGeometry();
  leaves.setAttribute('position',new T.Float32BufferAttribute(leafPositions,3));
  leaves.setAttribute('normal',new T.Float32BufferAttribute(leafNormals,3));
  leaves.setAttribute('color',new T.Float32BufferAttribute(leafColors,3));
  leaves.setAttribute('uv',new T.Float32BufferAttribute(leafUvs,2));
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
  const material = createTreeMaterial();
  const depthMaterial = circularLeaves(new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide}));
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
    tree.customDepthMaterial=depthMaterial;
    tree.userData.collisionGeometry=profiles.get(profileKey).trunk;
    tree.userData.stylizedTree=true;
    tree.userData.treeLod={near:tree.geometry,far:profiles.get(profileKey).far};
  }
  for(const variant of [...variants,...distant]){variant.geometry.dispose();variant.trunk.dispose();}
  city.updateMatrixWorld(true);
  return { trees:trees.length,oldTriangles,triangles:trees.reduce((n,t)=>n+t.geometry.attributes.position.count/3,0),variants:6,sharedGeometries:profiles.size };
}
