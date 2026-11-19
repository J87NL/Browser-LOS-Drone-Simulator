// Sky dome, sun, fog and an environment map for soft PBR reflections.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export const FOG_COLOR = new THREE.Color('#b9cde0');

export function createSky(renderer, scene) {
  const sky = new Sky();
  sky.scale.setScalar(4500);
  const u = sky.material.uniforms;
  u.turbidity.value = 2;
  u.rayleigh.value = 1.6;
  if (u.cloudCoverage) u.cloudCoverage.value = 0.2;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.8;

  const elevation = 34;
  const azimuth = 145; // behind the pilot's right shoulder: drone well lit in LOS
  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - elevation),
    THREE.MathUtils.degToRad(azimuth),
  );
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);

  scene.fog = new THREE.Fog(FOG_COLOR, 320, 2900); // far enough to see the distant mountains as haze
  scene.background = FOG_COLOR;

  // Environment lighting from the sky only.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(1000);
  envSky.material = sky.material;
  envScene.add(envSky);
  const env = pmrem.fromScene(envScene, 0, 1, 2000).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  return { sky, sunDir };
}
