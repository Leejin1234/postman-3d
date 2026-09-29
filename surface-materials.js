import * as THREE from 'three';

// World-space triplanar mapping does not depend on the FBX palette UVs or the
// rounded road mesh's empty UVs. It remains continuous around the whole planet.
function surfaceMaterial(name, base, detail, { color, period, strength, grass = false }) {
  const material = new THREE.MeshStandardMaterial({
    name, color, roughness: 1, metalness: 0, side: THREE.DoubleSide
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      surfaceBase: { value: base }, surfaceDetail: { value: detail },
      surfaceScale: { value: 1 / period }, surfaceStrength: { value: strength }
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 surfacePosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nsurfacePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 surfacePosition;
        uniform sampler2D surfaceBase;
        uniform sampler2D surfaceDetail;
        uniform float surfaceScale;
        uniform float surfaceStrength;
      `)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 surfaceUp = normalize(surfacePosition);
        vec3 surfaceWeight = pow(abs(surfaceUp), vec3(4.0));
        surfaceWeight /= dot(surfaceWeight, vec3(1.0));
        vec3 sp = surfacePosition * surfaceScale;
        vec3 surfaceAlbedo = texture2D(surfaceBase, sp.yz).rgb * surfaceWeight.x
          + texture2D(surfaceBase, sp.xz).rgb * surfaceWeight.y
          + texture2D(surfaceBase, sp.xy).rgb * surfaceWeight.z;
        ${grass ? `float grassLight = dot(surfaceAlbedo, vec3(.2126,.7152,.0722));
        surfaceAlbedo = mix(vec3(grassLight), surfaceAlbedo, .56) * 1.55 + vec3(.018,.02,.005);` : ''}
        diffuseColor.rgb *= surfaceAlbedo;
        vec4 detailX = texture2D(surfaceDetail, sp.yz);
        vec4 detailY = texture2D(surfaceDetail, sp.xz);
        vec4 detailZ = texture2D(surfaceDetail, sp.xy);
        vec4 surfaceDetailValue = detailX * surfaceWeight.x + detailY * surfaceWeight.y + detailZ * surfaceWeight.z;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor *= clamp(surfaceDetailValue.a, .65, 1.0);
      `)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 nx = detailX.xy * 2.0 - 1.0;
        vec2 ny = detailY.xy * 2.0 - 1.0;
        vec2 nz = detailZ.xy * 2.0 - 1.0;
        vec3 worldDetail = vec3(0.0, nx.x, nx.y) * surfaceWeight.x
          + vec3(ny.x, 0.0, ny.y) * surfaceWeight.y
          + vec3(nz.x, nz.y, 0.0) * surfaceWeight.z;
        worldDetail -= surfaceUp * dot(worldDetail, surfaceUp);
        normal = normalize(normal + mat3(viewMatrix) * worldDetail * surfaceStrength);
      `);
  };
  material.customProgramCacheKey = () => `planet-surface-v1-${grass ? 'grass' : 'stone'}`;
  return material;
}

export async function installSurfaceMaterials(city, renderer, loadTexture) {
  const kinds = ['grass-v2', 'asphalt', 'pavers'];
  const textures = await Promise.all(kinds.map(async kind => {
    const [base, detail] = await Promise.all(['base', 'detail'].map(channel =>
      loadTexture(`./assets/surfaces/${kind}-${channel}-512.webp`)));
    for (const texture of [base, detail]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texture.colorSpace = texture === base ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.needsUpdate = true;
    }
    return { base, detail };
  }));
  const [grass, asphalt, pavers] = textures;
  const replacements = {
    City_Grass: surfaceMaterial('City_Grass', grass.base, grass.detail, { color: 0xffffff, period: 24, strength: .27, grass: true }),
    City_Meadow: surfaceMaterial('City_Meadow', grass.base, grass.detail, { color: 0xf1edda, period: 28, strength: .22, grass: true }),
    City_Road: surfaceMaterial('City_Road', asphalt.base, asphalt.detail, { color: 0xc2c4be, period: 12, strength: .16 }),
    City_Sidewalk: surfaceMaterial('City_Sidewalk', pavers.base, pavers.detail, { color: 0xe4e1d0, period: 12, strength: .24 })
  };
  const counts = Object.fromEntries(Object.keys(replacements).map(name => [name, 0]));
  city.traverse(mesh => {
    if (!mesh.isMesh || !/^(Planet|Roads)/.test(mesh.name)) return;
    const single = !Array.isArray(mesh.material);
    const materials = (single ? [mesh.material] : mesh.material).map(old => {
      const replacement = replacements[old.name];
      if (!replacement) return old;
      counts[old.name]++;
      return replacement;
    });
    mesh.material = single ? materials[0] : materials;
  });
  return { counts, textureCount: textures.length * 2, resolution: 512 };
}
