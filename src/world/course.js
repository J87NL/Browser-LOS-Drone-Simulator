// Launch pad, gates, slalom poles, flags, a dive tower and hay bales.
import * as THREE from 'three';
import { terrainHeight } from './terrain-height.js';

export const PAD = { x: 0, z: 0, half: 0.6, top: 0.05 };

/** Yaw that points a flag's local +X (the banner) downwind. */
export function flagYaw(wind) {
  return Math.atan2(-wind.z, wind.x);
}

const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Move a flag's banner collider to match its current rotation (banner along local +X). */
export function placeBanner(flag) {
  const c = flag.userData.collider;
  const { x, z } = flag.userData.pole;
  const yaw = flag.rotation.y;
  c.cos = Math.cos(yaw);
  c.sin = Math.sin(yaw);
  c.x = x + Math.cos(yaw) * 0.35; // local +X in world is (cos, 0, -sin)
  c.z = z - Math.sin(yaw) * 0.35;
}

function padTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2d3238';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#f5c518';
  g.lineWidth = 14;
  g.strokeRect(12, 12, 232, 232);
  g.lineWidth = 6;
  g.beginPath();
  g.arc(128, 128, 82, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#f2f2f2';
  g.font = 'bold 120px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('H', 128, 134);
  // Arrow pointing "forward" (-Z, the top of the texture).
  g.fillStyle = '#f5c518';
  g.beginPath();
  g.moveTo(128, 26);
  g.lineTo(112, 46);
  g.lineTo(144, 46);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function stripeTexture(a, b, stripes = 8) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect(0, (i * 64) / stripes, 4, 64 / stripes);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function createCourse(scene, collision) {
  const group = new THREE.Group();
  const shadow = (m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const box = (w, h, d, mat, x, y, z, yaw = 0, collide = true, landable = false) => {
    const mesh = shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    group.add(mesh);
    if (collide) collision.addBox({ x, y, z, hx: w / 2, hy: h / 2, hz: d / 2, yaw, landable });
    return mesh;
  };

  // --- Launch pad
  const padMat = new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.8 });
  const sideMat = new THREE.MeshStandardMaterial({ color: '#2d3238', roughness: 0.8 });
  const pad = shadow(
    new THREE.Mesh(new THREE.BoxGeometry(PAD.half * 2, PAD.top, PAD.half * 2), [sideMat, sideMat, padMat, sideMat, sideMat, sideMat]),
  );
  pad.position.set(PAD.x, PAD.top / 2, PAD.z);
  group.add(pad);
  // Every face of the low pad is a landing surface: skidding into its edge is not a crash.
  collision.addBox({ x: PAD.x, y: PAD.top / 2, z: PAD.z, hx: PAD.half, hy: PAD.top / 2, hz: PAD.half, landable: 'all' });

  // --- Gates: square frames on short legs. [x, z, yaw, colour]
  const gates = [
    [0, -22, 0, '#ff6a13'],
    [16, -42, -0.6, '#16c7e8'],
    [-2, -64, 0.2, '#e8168f'],
    [-20, -44, 0.9, '#f5d90a'],
    [30, -15, -1.3, '#7ae816'],
  ];
  const inner = 1.6;
  const bar = 0.14;
  const bottom = 0.6;
  for (const [x, z, yaw, color] of gates) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, emissive: color, emissiveIntensity: 0.12 });
    const g0 = terrainHeight(x, z);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const off = (lx) => [x + lx * c, z - lx * s];
    const half = inner / 2 + bar / 2;
    for (const side of [-1, 1]) {
      const [px, pz] = off(side * half);
      const h = bottom + inner + bar * 2;
      box(bar, h, bar, mat, px, g0 + h / 2, pz, yaw);
    }
    box(inner + bar * 2, bar, bar, mat, x, g0 + bottom + inner + bar * 1.5, z, yaw);
    box(inner, bar, bar, mat, x, g0 + bottom + bar / 2, z, yaw);
  }

  // --- Slalom poles (red/white)
  const poleMat = new THREE.MeshStandardMaterial({ map: stripeTexture('#e8322b', '#f4f4f4', 10), roughness: 0.6 });
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 3.5, 12);
  for (let i = 0; i < 6; i++) {
    const x = -28 + (i % 2) * 4;
    const z = -8 - i * 9;
    const y0 = terrainHeight(x, z);
    const m = shadow(new THREE.Mesh(poleGeo, poleMat));
    m.position.set(x, y0 + 1.75, z);
    group.add(m);
    collision.addCylinder({ x, z, y0, y1: y0 + 3.5, r: 0.06 });
  }

  // --- Feather flags around the field
  const flagColors = ['#ff6a13', '#16c7e8', '#e8168f', '#f5d90a', '#ffffff'];
  const flagGeo = new THREE.PlaneGeometry(0.7, 2.4, 6, 1);
  {
    const p = flagGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + 0.35;
      const y = p.getY(i);
      // Curved top, gentle wave.
      p.setZ(i, Math.sin(x * 4) * 0.08);
      if (y > 0) p.setY(i, y - x * x * 0.9);
    }
    flagGeo.translate(0.35, 0, 0); // banner starts at the pole and extends along local +X
    flagGeo.computeVertexNormals();
  }
  const flagPoleGeo = new THREE.CylinderGeometry(0.025, 0.03, 3.2, 8);
  const flagPoleMat = new THREE.MeshStandardMaterial({ color: '#cfd4da', metalness: 0.6, roughness: 0.35 });
  const flags = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const r = 52 + (i % 3) * 6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y0 = terrainHeight(x, z);
    const pole = shadow(new THREE.Mesh(flagPoleGeo, flagPoleMat));
    pole.position.set(x, y0 + 1.6, z);
    group.add(pole);
    const mat = new THREE.MeshStandardMaterial({ color: flagColors[i % flagColors.length], side: THREE.DoubleSide, roughness: 0.75 });
    const flag = shadow(new THREE.Mesh(flagGeo, mat));
    flag.position.set(x, y0 + 1.95, z);
    flag.rotation.y = a + Math.PI / 2;
    flag.userData.phase = i;
    group.add(flag);
    flags.push(flag);
    collision.addCylinder({ x, z, y0, y1: y0 + 3.2, r: 0.05 }); // pole
    // The banner: a thin box that follows the flag's rotation (see update()).
    flag.userData.collider = collision.addBox({
      x, y: y0 + 1.95, z, hx: 0.35, hy: 1.2, hz: 0.05, reach: 0.75,
    });
    flag.userData.pole = { x, z };
    placeBanner(flag);
  }

  // --- Dive tower: scaffold with a platform, good for LOS power loops.
  {
    const tx = 24;
    const tz = -70;
    const y0 = terrainHeight(tx, tz);
    const h = 9;
    const w = 3;
    const steel = new THREE.MeshStandardMaterial({ color: '#8a929b', metalness: 0.7, roughness: 0.4 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.16, h, 0.16, steel, tx + sx * w / 2, y0 + h / 2, tz + sz * w / 2);
    for (const yy of [3, 6]) {
      box(w, 0.1, 0.1, steel, tx, y0 + yy, tz - w / 2);
      box(w, 0.1, 0.1, steel, tx, y0 + yy, tz + w / 2);
    }
    const deck = new THREE.MeshStandardMaterial({ color: '#c9772b', roughness: 0.7 });
    box(w + 0.4, 0.15, w + 0.4, deck, tx, y0 + h, tz, 0, true, 'top'); // you may land on the deck
  }

  // --- Hay bales
  const hay = new THREE.MeshStandardMaterial({ color: '#d6b45a', roughness: 1 });
  const bales = [
    [10, 6, 0.2], [11.3, 6.1, 0.15], [10.6, 6.05, 0.18, 1],
    [-12, -20, 1.1], [-12.6, -18.8, 1.1],
  ];
  for (const [x, z, yaw, level = 0] of bales) {
    const y0 = terrainHeight(x, z);
    box(1.2, 0.8, 0.8, hay, x, y0 + 0.4 + level * 0.8, z, yaw, true, 'top'); // landable on top
  }

  scene.add(group);

  return {
    group,
    keepOut: [
      { x: 0, z: 0, r: 30 },
      { x: 0, z: -40, r: 38 },
      { x: 24, z: -70, r: 10 },
      { x: -26, z: -30, r: 12 },
      { x: 30, z: -15, r: 6 },
    ],
    /** Flags turn to fly downwind and flutter more in stronger wind. */
    update(t, dt, wind = null) {
      const ws = wind ? Math.hypot(wind.x, wind.z) : 0;
      const turn = 1 - Math.exp(-3 * dt);
      for (const f of flags) {
        if (ws > 0.3) {
          f.rotation.y += angleDelta(f.rotation.y, flagYaw(wind)) * turn;
          placeBanner(f);
        }
        f.rotation.z = Math.sin(t * (1.3 + ws * 0.5) + f.userData.phase) * (0.04 + ws * 0.01);
      }
    },
  };
}
