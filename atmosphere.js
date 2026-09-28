import * as THREE from 'three';

// All colours are authored in sRGB; Three converts them to linear light.
export const PALETTES = {
  day: {
    zenith: '#9aaeb1', horizon: '#e8dac0', lower: '#c3c6b3', fog: '#d9d5bf',
    sun: '#fff0bf', light: '#ffe4b0', ground: '#969b7d', ambient: '#e4dfcc',
    strength: 2.65, fill: 1.35, exposure: 1.12, elevation: 0.43,
  },
  evening: {
    zenith: '#9197ad', horizon: '#efd1af', lower: '#b7bbb0', fog: '#d8c6b6',
    sun: '#ffda98', light: '#ffd09a', ground: '#8a9390', ambient: '#d7d5e2',
    strength: 2.25, fill: 1.25, exposure: 1.08, elevation: 0.25,
  },
};

export function createAtmosphere(scene, renderer, sun, hemisphere, ambient) {
  const uniforms = {
    zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
    lower: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() },
    up: { value: new THREE.Vector3(0, 1, 0) },
    sunDir: { value: new THREE.Vector3(0.65, 0.43, 0.62).normalize() },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDirection;
      void main() {
        vDirection = mat3(modelMatrix) * position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 zenith, horizon, lower, sunColor, up, sunDir;
      varying vec3 vDirection;
      void main() {
        vec3 d = normalize(vDirection);
        float h = dot(d, up);
        vec3 col = mix(horizon, zenith, pow(smoothstep(0.0, 0.85, h), 0.65));
        col = mix(col, lower, 1.0 - smoothstep(-0.8, 0.02, h));
        float towardSun = max(0.0, dot(d, sunDir));
        col += sunColor * pow(towardSun, 28.0) * 0.095;
        float disk = smoothstep(cos(0.035), cos(0.031), towardSun);
        col = mix(col, sunColor * 1.35, disk);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  scene.add(sky);

  let palette = PALETTES.day;
  let eastWeight = 0.68, northWeight = 0.62;
  const direction = new THREE.Vector3();
  const lightOffset = new THREE.Vector3();
  function orientSun(frame) {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(frame);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(frame);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(frame);
    const north = new THREE.Vector3(0, 1, 0).addScaledVector(up, -up.y);
    if (north.lengthSq() < 1e-6) north.copy(forward);
    north.normalize();
    const east = new THREE.Vector3().crossVectors(north, up).normalize();
    const desired = forward.addScaledVector(right, -0.55).normalize().multiplyScalar(0.92);
    eastWeight = desired.dot(east); northWeight = desired.dot(north);
  }
  function setTheme(theme) {
    palette = PALETTES[theme] || PALETTES.day;
    for (const name of ['zenith', 'horizon', 'lower']) uniforms[name].value.set(palette[name]);
    uniforms.sunColor.value.set(palette.sun);
    scene.fog.color.set(palette.fog);
    sun.color.set(palette.light);
    sun.intensity = palette.strength;
    hemisphere.color.set(palette.zenith);
    hemisphere.groundColor.set(palette.ground);
    hemisphere.intensity = palette.fill;
    ambient.color.set(palette.ambient);
    renderer.toneMappingExposure = palette.exposure;
  }
  function update(camera, focus, up, east, north) {
    uniforms.up.value.copy(up);
    direction.copy(up).multiplyScalar(palette.elevation)
      .addScaledVector(east, eastWeight).addScaledVector(north, northWeight).normalize();
    uniforms.sunDir.value.copy(direction);
    sky.position.copy(camera.position);
    sky.scale.setScalar(camera.far * 0.82);
    lightOffset.copy(direction).multiplyScalar(380);
    sun.position.copy(focus).add(lightOffset);
    sun.target.position.copy(focus);
    // HemisphereLight also follows local gravity, including the planet's far side.
    hemisphere.position.copy(up);
  }
  setTheme('day');
  return { sky, setTheme, update, orientSun };
}

// Subtle drifting seeds: one instanced draw, no per-frame geometry allocations.
export function createDriftingSeeds(scene, count) {
  const geometry = new THREE.PlaneGeometry(0.3, 0.12);
  const material = new THREE.MeshBasicMaterial({
    color: '#f6e6bc', side: THREE.DoubleSide, transparent: true, opacity: 0.5,
    depthWrite: false, fog: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const dummy = new THREE.Object3D();
  const seeds = Array.from({ length: count }, (_, i) => ({
    x: ((i * 37.79) % 150) - 75,
    z: ((i * 57.17) % 150) - 75,
    y: 2 + ((i * 13.7) % 30), phase: i * 2.39,
  }));
  return (time, focus, up, east, north) => {
    seeds.forEach((seed, i) => {
      const x = ((seed.x + time * 1.6 + 75) % 150) - 75;
      dummy.position.copy(focus).addScaledVector(east, x)
        .addScaledVector(north, seed.z)
        .addScaledVector(up, seed.y + Math.sin(time * 0.5 + seed.phase) * 1.8);
      dummy.rotation.set(time * 0.4 + seed.phase, seed.phase, time * 0.3);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
}
