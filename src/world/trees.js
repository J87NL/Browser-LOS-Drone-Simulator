// Instanced low-poly trees in three variants, with cylinder colliders.
// Trees are generated in a random order; low quality simply uses a prefix.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD } from '../config.js';
import { terrainHeight, fbm } from './terrain-height.js';
import { mulberry32 } from './rng.js';

function coniferGeometry() {
  const parts = [];
  const layers = [
    [1.6, 2.2, 1.6],
    [1.25, 1.9, 2.7],
    [0.85, 1.6, 3.7],
  ];
  for (const [r, h, y] of layers) {
    const g = new THREE.ConeGeometry(r, h, 7, 1);
    g.translate(0, y, 0);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

function blobGeometry(sx, sy, y, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.scale(sx, sy, sx);
  g.translate(0, y, 0);
  return g;
}

const VARIANTS = [
  // canopy geometry, canopy colour, trunk height, trunk radius, collider radius/top/bottom (in unit tree space)
  { name: 'conifer', geo: coniferGeometry, color: '#2f5d34', trunkH: 1.2, trunkR: 0.16, canopyR: 1.1, canopyY0: 0.6, canopyY1: 4.5 },
  { name: 'broadleaf', geo: () => blobGeometry(1.8, 1.5, 3.2), color: '#4f7f35', trunkH: 2.2, trunkR: 0.2, canopyR: 1.4, canopyY0: 1.9, canopyY1: 4.6 },
  { name: 'poplar', geo: () => blobGeometry(0.9, 2.6, 4.2), color: '#5c8a3a', trunkH: 2.0, trunkR: 0.14, canopyR: 0.7, canopyY0: 1.7, canopyY1: 6.6 },
];

function keepOut(x, z, keepOutZones) {
  for (const k of keepOutZones) if (Math.hypot(x - k.x, z - k.z) < k.r) return true;
  return false;
}

/**
 * @param {THREE.Scene} scene
 * @param {import('../physics/colliders.js').CollisionWorld} collision
 * @param {{x:number,z:number,r:number}[]} keepOutZones
 */
export function createTrees(scene, collision, keepOutZones) {
  const rand = mulberry32(WORLD.seed + 99);
  const total = WORLD.treeCountHigh;
  const trees = [];
  let guard = 0;
  while (trees.length < total && guard++ < total * 40) {
    const a = rand() * Math.PI * 2;
    const r = 35 + Math.sqrt(rand()) * 360;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (keepOut(x, z, keepOutZones)) continue;
    // Clumps: accept more where the noise is high.
    if (fbm(x / 60 + 11, z / 60 - 7, 3) < 0.38 + rand() * 0.25) continue;
    const variant = rand() < 0.45 ? 0 : rand() < 0.7 ? 1 : 2;
    const scale = 0.75 + rand() * 0.75;
    trees.push({ x, z, y: terrainHeight(x, z) - 0.1, variant, scale, rot: rand() * Math.PI * 2, tint: rand() });
  }

  const trunkGeo = new THREE.CylinderGeometry(0.7, 1, 1, 6, 1);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 0.95, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  trunks.castShadow = true;
  trunks.receiveShadow = true;

  const canopies = VARIANTS.map((v) => {
    const count = trees.filter((t) => t.variant === VARIANTS.indexOf(v)).length;
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
    const mesh = new THREE.InstancedMesh(v.geo(), mat, Math.max(1, count));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.added = 0;
    mesh.userData.prefix = [];
    return mesh;
  });

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const colliders = [];

  trees.forEach((t, i) => {
    const v = VARIANTS[t.variant];
    q.setFromAxisAngle(up, t.rot);
    p.set(t.x, t.y, t.z);
    s.set(v.trunkR * t.scale, v.trunkH * t.scale, v.trunkR * t.scale);
    trunks.setMatrixAt(i, m.compose(p, q, s));

    const cm = canopies[t.variant];
    s.setScalar(t.scale);
    cm.setMatrixAt(cm.userData.added, m.compose(p, q, s));
    col.set(v.color).offsetHSL((t.tint - 0.5) * 0.05, (t.tint - 0.5) * 0.15, (t.tint - 0.5) * 0.08);
    cm.setColorAt(cm.userData.added, col);
    cm.userData.added++;

    const trunk = collision.addCylinder({ x: t.x, z: t.z, y0: t.y, y1: t.y + v.canopyY0 * t.scale, r: v.trunkR * t.scale });
    const canopy = collision.addCylinder({
      x: t.x, z: t.z, y0: t.y + v.canopyY0 * t.scale, y1: t.y + v.canopyY1 * t.scale, r: v.canopyR * t.scale,
    });
    colliders.push([trunk, canopy]);
  });
  // For each variant, how many of its instances belong to the first N trees.
  const variantPrefix = (n) => VARIANTS.map((_, vi) => trees.slice(0, n).filter((t) => t.variant === vi).length);

  scene.add(trunks, ...canopies);

  return {
    count: trees.length,
    setCount(n) {
      n = Math.min(n, trees.length);
      trunks.count = n;
      variantPrefix(n).forEach((c, vi) => (canopies[vi].count = c));
      colliders.forEach((pair, i) => pair.forEach((c) => (c.enabled = i < n)));
    },
    setShadows(on) {
      trunks.castShadow = on;
      canopies.forEach((c) => (c.castShadow = on));
    },
  };
}
