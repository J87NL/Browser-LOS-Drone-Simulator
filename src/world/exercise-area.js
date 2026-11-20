import * as THREE from 'three';
import { EIGHT_POLES, HOVER_SPOT, LANDING_SPOT } from '../race/exercises.js';
import { terrainHeight } from './terrain-height.js';

function targetTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const scale = 256 / LANDING_SPOT.half;
  g.fillStyle = '#2d3238';
  g.fillRect(0, 0, 512, 512);
  [...LANDING_SPOT.rings].reverse().forEach((ring, i) => {
    g.fillStyle = i % 2 ? '#d62828' : '#f4f4f4';
    g.beginPath();
    g.arc(256, 256, ring.radius * scale, 0, Math.PI * 2);
    g.fill();
  });
  g.fillStyle = '#111418';
  g.beginPath();
  g.arc(256, 256, 8, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#111418' : '#f5d90a';
    g.fillRect(0, i * 8, 4, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function createExerciseArea(scene, collision) {
  const group = new THREE.Group();

  const hoverGround = terrainHeight(HOVER_SPOT.x, HOVER_SPOT.z);
  const ringMat = new THREE.MeshStandardMaterial({ color: '#4cc3ff', emissive: '#4cc3ff', emissiveIntensity: 0.2, roughness: 0.4 });
  for (const height of [HOVER_SPOT.low, HOVER_SPOT.high]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(HOVER_SPOT.radius, 0.035, 10, 64), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(HOVER_SPOT.x, hoverGround + height, HOVER_SPOT.z);
    group.add(ring);
  }
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(HOVER_SPOT.radius - 0.08, HOVER_SPOT.radius, 64),
    new THREE.MeshStandardMaterial({ color: '#4cc3ff', roughness: 0.8 }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(HOVER_SPOT.x, hoverGround + 0.13, HOVER_SPOT.z);
  group.add(marker);

  const landingGround = terrainHeight(LANDING_SPOT.x, LANDING_SPOT.z);
  const side = new THREE.MeshStandardMaterial({ color: '#2d3238', roughness: 0.8 });
  const top = new THREE.MeshStandardMaterial({ map: targetTexture(), roughness: 0.8 });
  const size = LANDING_SPOT.half * 2;
  const platform = new THREE.Mesh(new THREE.BoxGeometry(size, LANDING_SPOT.top, size), [side, side, top, side, side, side]);
  platform.position.set(LANDING_SPOT.x, landingGround + LANDING_SPOT.top / 2, LANDING_SPOT.z);
  platform.receiveShadow = true;
  platform.castShadow = true;
  group.add(platform);
  collision.addBox({
    x: LANDING_SPOT.x, y: landingGround + LANDING_SPOT.top / 2, z: LANDING_SPOT.z,
    hx: LANDING_SPOT.half, hy: LANDING_SPOT.top / 2, hz: LANDING_SPOT.half, landable: 'all',
  });

  const poleMat = new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.6 });
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.07, EIGHT_POLES.height, 12);
  for (const pole of [EIGHT_POLES.left, EIGHT_POLES.right]) {
    const y0 = terrainHeight(pole.x, pole.z);
    const mesh = new THREE.Mesh(poleGeo, poleMat);
    mesh.position.set(pole.x, y0 + EIGHT_POLES.height / 2, pole.z);
    mesh.castShadow = true;
    group.add(mesh);
    collision.addCylinder({ x: pole.x, z: pole.z, y0, y1: y0 + EIGHT_POLES.height, r: 0.07 });
  }

  scene.add(group);
  return {
    update(hovering) {
      ringMat.emissiveIntensity = hovering ? 0.9 : 0.2;
      ringMat.emissive.set(hovering ? '#6ee07a' : '#4cc3ff');
      ringMat.color.set(hovering ? '#6ee07a' : '#4cc3ff');
    },
  };
}
