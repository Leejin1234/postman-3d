import * as THREE from 'three';

// The source road and its paint use different tessellation on the sphere.
// Merely lowering the paint vertices leaves long triangles bridging road creases.
// Clip every paint triangle against the radial cone of each underlying road face,
// then project each fragment onto that face. The result follows creases exactly.
export function conformRoadMarkings(root, center, clearance = 0.012) {
  root.updateMatrixWorld(true);
  const roads = [], meshes = [];
  const stats = { sourceTriangles: 0, triangles: 0, unmatched: 0, maxOriginalGap: 0 };
  const vertex = new THREE.Vector3();
  function triangle(mesh, start) {
    const { position } = mesh.geometry.attributes, index = mesh.geometry.index;
    return [0, 1, 2].map(k => new THREE.Vector3()
      .fromBufferAttribute(position, index ? index.getX(start + k) : start + k)
      .applyMatrix4(mesh.matrixWorld).sub(center));
  }
  function cap(points) {
    const directions = points.map(p => p.clone().normalize());
    const axis = directions[0].clone().add(directions[1]).add(directions[2]).normalize();
    const angle = Math.max(...directions.map(p => Math.acos(THREE.MathUtils.clamp(axis.dot(p), -1, 1))));
    return { axis, angle };
  }
  root.traverse(mesh => {
    if (!mesh.isMesh || !/^Roads/i.test(mesh.name)) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!mesh.geometry.groups.length) return;
    meshes.push({ mesh, mats });
    for (const group of mesh.geometry.groups) {
      if (mats[group.materialIndex]?.name !== 'City_Road') continue;
      for (let i = group.start; i < group.start + group.count; i += 3) {
        const points = triangle(mesh, i);
        const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
        if (normal.lengthSq() < 0.5) continue;
        if (normal.dot(points[0]) < 0) normal.negate();
        const edges = points.map((p, k) => {
          const edge = p.clone().cross(points[(k + 1) % 3]).normalize();
          if (edge.dot(points[(k + 2) % 3]) < 0) edge.negate();
          return edge;
        });
        roads.push({ ...cap(points), normal, height: normal.dot(points[0]), edges });
      }
    }
  });
  if (!roads.length) return stats;

  function clip(poly, edge) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = edge.dot(a.p), db = edge.dot(b.p);
      const insideA = da >= 0, insideB = db >= 0;
      if (insideA) out.push(a);
      if (insideA !== insideB) {
        const t = da / (da - db);
        out.push({ p: a.p.clone().lerp(b.p, t), weights: a.weights.map((v, k) => v + (b.weights[k] - v) * t) });
      }
    }
    return out;
  }

  for (const { mesh, mats } of meshes) {
    const source = mesh.geometry;
    if (!source.groups.some(g => mats[g.materialIndex]?.name === 'City_RoadLine')) continue;
    const attributes = Object.entries(source.attributes);
    const buffers = Object.fromEntries(attributes.map(([name]) => [name, []]));
    const groups = [];
    const inverse = mesh.matrixWorld.clone().invert();
    const normalToLocal = new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld).transpose();
    const localNormal = new THREE.Vector3();
    const localPoint = new THREE.Vector3();
    let count = 0;
    function emit(indices, weights, position, normal) {
      for (const [name, attr] of attributes) {
        const out = buffers[name];
        for (let c = 0; c < attr.itemSize; c++) {
          if (name === 'position' && position) out.push(position.getComponent(c));
          else if (name === 'normal' && normal) out.push(normal.getComponent(c));
          else out.push(indices.reduce((sum, index, k) => sum + attr.getComponent(index, c) * weights[k], 0));
        }
      }
      count++;
    }
    for (const group of source.groups) {
      const start = count;
      const isPaint = mats[group.materialIndex]?.name === 'City_RoadLine';
      for (let i = group.start; i < group.start + group.count; i += 3) {
        const indices = [0, 1, 2].map(k => source.index ? source.index.getX(i + k) : i + k);
        if (!isPaint) {
          for (let k = 0; k < 3; k++) emit(indices, [0, 1, 2].map(j => j === k ? 1 : 0));
          continue;
        }
        stats.sourceTriangles++;
        const points = triangle(mesh, i), bounds = cap(points);
        let emitted = false;
        for (const road of roads) {
          if (bounds.axis.dot(road.axis) < Math.cos(bounds.angle + road.angle + 1e-6)) continue;
          let poly = points.map((p, k) => ({ p, weights: [0, 1, 2].map(j => j === k ? 1 : 0) }));
          for (const edge of road.edges) {
            poly = clip(poly, edge);
            if (poly.length < 3) break;
          }
          if (poly.length < 3) continue;
          const projected = poly.map(v => {
            const scale = road.height / road.normal.dot(v.p);
            stats.maxOriginalGap = Math.max(stats.maxOriginalGap, v.p.length() * (1 - scale));
            // Keep fragments inside the same radial face cone. A face-normal
            // offset can push thin fragments sideways across a curved seam.
            return v.p.clone().multiplyScalar(scale + clearance / v.p.length()).add(center);
          });
          localNormal.copy(road.normal).applyMatrix3(normalToLocal).normalize();
          // Test winding in the same local Float32 coordinates sent to the GPU.
          // Source markings contain both windings; DoubleSide flips lighting
          // normals on back faces, so outward normals alone create dark patches.
          const localProjected = projected.map(p => {
            const local = p.clone().applyMatrix4(inverse);
            return local.set(Math.fround(local.x), Math.fround(local.y), Math.fround(local.z));
          });
          for (let k = 1; k < poly.length - 1; k++) {
            const a = projected[0], b = projected[k], c = projected[k + 1];
            if (vertex.copy(b).sub(a).cross(localPoint.copy(c).sub(a)).lengthSq() < 1e-12) continue;
            vertex.copy(localProjected[k]).sub(localProjected[0])
              .cross(localPoint.copy(localProjected[k + 1]).sub(localProjected[0]));
            if (vertex.lengthSq() < 1e-18) continue;
            const order = vertex.dot(localNormal) < 0 ? [0, k + 1, k] : [0, k, k + 1];
            for (const j of order) {
              const smoothNormal = projected[j].clone().sub(center).normalize().applyMatrix3(normalToLocal).normalize();
              emit(indices, poly[j].weights, localProjected[j], smoothNormal);
            }
            stats.triangles++;
            emitted = true;
          }
        }
        if (!emitted) stats.unmatched++;
      }
      groups.push({ start, count: count - start, materialIndex: group.materialIndex });
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, attr] of attributes) {
      geometry.setAttribute(name, new THREE.Float32BufferAttribute(buffers[name], attr.itemSize));
    }
    for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    mesh.geometry = geometry;
    // At distant/low angles the depth buffer can quantize paint and asphalt to
    // the same value. Bias only the paint's raster depth, not its world position.
    for (const material of mats) {
      if (material.name !== 'City_RoadLine') continue;
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      material.polygonOffsetUnits = -2;
    }
    // No disposal here: the source FBX geometry may be shared by another mesh.
  }
  return stats;
}
