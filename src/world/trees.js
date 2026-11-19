// Instanced low-poly trees in three variants, with cylinder colliders.
// Trees are generated in a random order; low quality simply uses a prefix.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD } from '../config.js';
import { terrainHeight, fbm } from './terrain-height.js';
import { mulberry32 } from './rng.js';

/**
 * Jitter vertices (welded first, so faces stay closed) and add vertex colours
 * that darken towards the bottom and inside of the crown, which reads as
 * self-shadowing.
 */
function finishCanopy(geo, seed, amount, y0, y1) {
  geo = mergeVertices(geo.deleteAttribute('normal').deleteAttribute('uv'));
  const rand = mulberry32(seed);
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + (rand() - 0.5) * amount;
    p.setXYZ(i, x * k, y + (rand() - 0.5) * amount * 0.6, z * k);
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    const shade = 0.55 + t * 0.45 + (rand() - 0.5) * 0.12;
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function coniferGeometry() {
  const parts = [];
  const layers = [
    [1.7, 1.9, 1.5],
    [1.45, 1.8, 2.3],
    [1.15, 1.6, 3.1],
    [0.85, 1.4, 3.85],
    [0.5, 1.2, 4.5],
  ];
  for (const [r, h, y] of layers) {
    const g = new THREE.ConeGeometry(r, h, 9, 2, true);
    g.translate(0, y, 0);
    parts.push(g);
  }
  return finishCanopy(mergeGeometries(parts), 11, 0.22, 0.5, 5.1);
}

function clusterGeometry(blobs, seed, y0, y1) {
  const parts = blobs.map(([x, y, z, r, sy = 1]) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1, sy, 1);
    g.translate(x, y, z);
    return g;
  });
  return finishCanopy(mergeGeometries(parts), seed, 0.25, y0, y1);
}

const broadleaf = () => clusterGeometry([
  [0, 3.3, 0, 1.45], [1.0, 2.9, 0.3, 1.0], [-0.9, 3.0, -0.4, 1.05], [0.2, 3.0, -1.0, 0.95],
  [-0.3, 2.8, 1.0, 1.0], [0.3, 4.1, 0.2, 1.0], [-0.5, 3.9, -0.3, 0.9],
], 21, 1.9, 5.0);

const poplar = () => clusterGeometry([
  [0, 3.0, 0, 0.85, 1.5], [0.15, 4.4, 0.1, 0.75, 1.6], [-0.1, 5.6, -0.05, 0.55, 1.5], [0.2, 2.4, -0.2, 0.7, 1.2],
], 31, 1.7, 6.6);

const VARIANTS = [
  // canopy geometry, canopy colour, trunk height, trunk radius, collider radius/top/bottom (in unit tree space)
  // canopyR: size of the soft ground shadow. canopy: collision bands [y0, y1, radius]
  // (unit tree) that follow the drawn crown, sized to its outer edge (cone rims, blob
  // lobes) including the vertex jitter, so the visible foliage always collides.
  { name: 'conifer', geo: coniferGeometry, color: '#2f5d34', trunkH: 1.2, trunkR: 0.16, canopyR: 1.1,
    canopy: [[0.55, 1.5, 1.75], [1.5, 2.4, 1.45], [2.4, 3.3, 1.15], [3.3, 4.2, 0.85], [4.2, 5.0, 0.5]] },
  { name: 'broadleaf', geo: broadleaf, color: '#4f7f35', trunkH: 2.3, trunkR: 0.2, canopyR: 1.5,
    canopy: [[1.9, 2.4, 1.5], [2.4, 4.6, 2.05], [4.6, 5.1, 1.25]] },
  { name: 'poplar', geo: poplar, color: '#5c8a3a', trunkH: 2.0, trunkR: 0.14, canopyR: 0.75,
    canopy: [[1.5, 4.8, 0.98], [4.8, 6.4, 0.9]] },
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

  // Shared wind: canopies sway a little, more at the top.
  const wind = { value: 0 };
  const windStrength = { value: 1 };
  let lastTime = 0;
  const canopies = VARIANTS.map((v) => {
    const count = trees.filter((t) => t.variant === VARIANTS.indexOf(v)).length;
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
    // Double-sided only so open cone bottoms are not see-through; shadows use
    // the front faces (cheaper, no acne). Shadows do not sway with the wind.
    mat.shadowSide = THREE.FrontSide;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = wind;
      shader.uniforms.uWindStrength = windStrength;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWind;\nuniform float uWindStrength;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec2 tp = instanceMatrix[3].xz;
          #else
            vec2 tp = vec2(0.0);
          #endif
          float sway = sin(uWind * 1.1 + tp.x * 0.13 + tp.y * 0.07) + 0.4 * sin(uWind * 2.3 + tp.x * 0.5);
          float hgt = max(transformed.y - 1.5, 0.0) * uWindStrength;
          transformed.x += sway * 0.025 * hgt;
          transformed.z += sway * 0.012 * hgt;`);
    };
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

    const trunk = collision.addCylinder({ x: t.x, z: t.z, y0: t.y, y1: t.y + v.trunkH * t.scale, r: v.trunkR * t.scale });
    const crown = v.canopy.map(([y0, y1, r]) => collision.addCylinder({
      x: t.x, z: t.z, y0: t.y + y0 * t.scale, y1: t.y + y1 * t.scale, r: r * t.scale,
    }));
    colliders.push([trunk, ...crown]);
  });
  // For each variant, how many of its instances belong to the first N trees.
  const variantPrefix = (n) => VARIANTS.map((_, vi) => trees.slice(0, n).filter((t) => t.variant === vi).length);

  // Soft contact shadows under every tree: they ground the trees at any
  // distance (the sun's shadow map only covers the area around the drone).
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  blobGeo.rotateX(-Math.PI / 2);
  const blobTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const gn = new THREE.Vector3();
  const blobs = new THREE.InstancedMesh(
    blobGeo,
    new THREE.MeshBasicMaterial({ color: '#000', map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    trees.length,
  );
  blobs.renderOrder = 1;
  trees.forEach((t, i) => {
    const v = VARIANTS[t.variant];
    const r = v.canopyR * t.scale * 2.6;
    p.set(t.x, terrainHeight(t.x, t.z) + 0.05, t.z);
    q.setFromUnitVectors(up, collision.groundNormal(t.x, t.z, gn)); // lie on the slope
    s.set(r, 1, r);
    blobs.setMatrixAt(i, m.compose(p, q, s));
  });

  scene.add(trunks, ...canopies, blobs);

  return {
    update(time, windSpeed = 0) {
      // Sway phase advances faster and further in stronger wind.
      wind.value += (time - lastTime) * (1 + windSpeed * 0.25);
      lastTime = time;
      windStrength.value = 1 + Math.min(windSpeed, 10) * 0.12; // capped: shadows and AO do not sway
    },
    count: trees.length,
    setCount(n) {
      n = Math.min(n, trees.length);
      trunks.count = n;
      blobs.count = n;
      variantPrefix(n).forEach((c, vi) => (canopies[vi].count = c));
      colliders.forEach((pair, i) => pair.forEach((c) => (c.enabled = i < n)));
    },
    setShadows(on) {
      trunks.castShadow = on;
      canopies.forEach((c) => (c.castShadow = on));
    },
  };
}
