// Sun with soft shadows (shadow camera follows the drone) plus hemisphere fill.
import * as THREE from 'three';

export function createLights(scene, sunDir) {
  const hemi = new THREE.HemisphereLight('#cfe3ff', '#56703a', 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff3e0', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = s.bottom = -28;
  s.right = s.top = 28;
  s.near = 1;
  s.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  const focus = new THREE.Vector3();
  const texel = 56 / 2048;
  return {
    sun,
    hemi,
    /** Keep the shadow frustum around `p`, snapped to texels to avoid shimmer. */
    follow(p) {
      focus.set(Math.round(p.x / texel) * texel, Math.round(p.y / texel) * texel, Math.round(p.z / texel) * texel);
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(sunDir, 120);
    },
    setShadows(on) {
      sun.castShadow = on;
    },
  };
}
