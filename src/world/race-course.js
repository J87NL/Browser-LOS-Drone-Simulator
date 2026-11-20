import * as THREE from 'three';
import { RACE_GATES } from '../race/race.js';
import { terrainHeight } from './terrain-height.js';

const BAR = 0.14;
const GATE_COLOR = '#2f7df6';
const NEXT_COLOR = '#ffe14d';

function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#111418';
  g.fillRect(0, 0, 256, 128);
  if (text === 'START') {
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 ? '#f4f4f4' : '#111418';
        g.fillRect(i * 16, j * 16, 16, 16);
        g.fillRect(i * 16, 96 + j * 16, 16, 16);
      }
    }
  }
  g.fillStyle = '#f4f4f4';
  g.font = `bold ${text === 'START' ? 30 : 88}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text === 'START' ? 'START / FINISH' : text, 128, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createGhostModel() {
  const material = new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.4, depthWrite: false });
  const ghost = new THREE.Group();
  ghost.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.11), material));
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.008, 0.012), material);
    arm.position.set(x * 0.039, 0, z * 0.039);
    arm.rotation.y = Math.atan2(-z, x);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.004, 24), material);
    disc.position.set(x * 0.078, 0.02, z * 0.078);
    ghost.add(arm, disc);
  }
  ghost.visible = false;
  return ghost;
}

export function createRaceCourse(scene, collision) {
  const group = new THREE.Group();
  const frames = [];

  const box = (w, h, d, material, x, y, z, yaw) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    collision.addBox({ x, y, z, hx: w / 2, hy: h / 2, hz: d / 2, yaw });
    return mesh;
  };

  RACE_GATES.forEach((gate, index) => {
    const material = new THREE.MeshStandardMaterial({ color: GATE_COLOR, roughness: 0.5, emissive: GATE_COLOR, emissiveIntensity: 0.1 });
    const ground = terrainHeight(gate.x, gate.z);
    const cos = Math.cos(gate.yaw);
    const sin = Math.sin(gate.yaw);
    const half = gate.width / 2 + BAR / 2;
    const top = gate.bottom + gate.height + BAR;
    for (const side of [-1, 1]) {
      box(BAR, top, BAR, material, gate.x + side * half * cos, ground + top / 2, gate.z - side * half * sin, gate.yaw);
    }
    box(gate.width + BAR * 2, BAR, BAR, material, gate.x, ground + top - BAR / 2, gate.z, gate.yaw);
    if (gate.bottom > 0) box(gate.width, BAR, BAR, material, gate.x, ground + gate.bottom - BAR / 2, gate.z, gate.yaw);

    const text = gate.label ?? String(index);
    const panelWidth = text === 'START' ? gate.width : 0.9;
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(panelWidth, panelWidth / 2),
      new THREE.MeshStandardMaterial({ map: labelTexture(text), roughness: 0.7, side: THREE.DoubleSide }),
    );
    panel.position.set(gate.x, ground + top + panelWidth / 4 + 0.05, gate.z);
    panel.rotation.y = gate.yaw;
    panel.castShadow = true;
    group.add(panel);
    frames.push(material);
  });

  const coneMat = new THREE.MeshStandardMaterial({ color: '#ff6a13', roughness: 0.6 });
  const coneGeo = new THREE.ConeGeometry(0.16, 0.45, 14);
  for (let i = 0; i < RACE_GATES.length; i++) {
    const a = RACE_GATES[i];
    const b = RACE_GATES[(i + 1) % RACE_GATES.length];
    for (const t of [0.33, 0.66]) {
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y0 = terrainHeight(x, z);
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(x, y0 + 0.225, z);
      cone.castShadow = true;
      group.add(cone);
      collision.addCylinder({ x, z, y0, y1: y0 + 0.45, r: 0.12 });
    }
  }

  scene.add(group);

  const next = new THREE.Color(NEXT_COLOR);
  const normal = new THREE.Color(GATE_COLOR);
  return {
    group,
    keepOut: [{ x: 50, z: -25, r: 26 }],
    update(time, nextGate) {
      frames.forEach((material, index) => {
        const isNext = index === nextGate;
        material.color.copy(isNext ? next : normal);
        material.emissive.copy(isNext ? next : normal);
        material.emissiveIntensity = isNext ? 0.35 + Math.sin(time * 6) * 0.2 : 0.1;
      });
    },
  };
}
