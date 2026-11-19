// Detailed 5" freestyle quad, built procedurally (no downloaded assets).
// Forward is -Z. Front props are orange and the front LEDs green, rear props
// dark and rear LEDs red, so orientation is readable in LOS. LED glow sprites
// (normal blending, so they also show against a bright sky) grow with camera
// distance so they stay visible far away.
import * as THREE from 'three';

const MOTOR = 0.078; // motor offset from centre on X and Z (220 mm wheelbase)
const PROP_R = 0.0635; // 5" props
const PROP_Y = 0.026; // prop plane height above the arms
import { PROBES } from '../config.js';

// Depth of the feet below the model origin, in model units: body offset
// (-0.045) plus foot length (0.025). Shared with the physics probes.
export const FEET_DEPTH = PROBES.feetDepth;

/**
 * How far to raise the drawn model above the physics centre so its feet rest
 * on the bottom of the collision sphere, for any preset and drawn size.
 */
export function modelLift(preset, droneSize) {
  return FEET_DEPTH * preset.modelScale * droneSize - preset.radius;
}

const FRONT_COLOR = '#ff7a1a';
const REAR_COLOR = '#2b3038';
const FRONT_LED = new THREE.Color('#2dff7a');
const REAR_LED = new THREE.Color('#ff2436');

function canvasTexture(size, draw, { srgb = true, repeat = null } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  t.anisotropy = 4;
  return t;
}

/** 2x2 twill carbon weave. */
function carbonTexture() {
  return canvasTexture(128, (g, n) => {
    const cell = n / 8;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const along = (i + j) % 4 < 2; // twill: diagonal steps
        const grad = along
          ? g.createLinearGradient(i * cell, 0, (i + 1) * cell, 0)
          : g.createLinearGradient(0, j * cell, 0, (j + 1) * cell);
        grad.addColorStop(0, '#0b0c0e');
        grad.addColorStop(0.5, along ? '#2a2c30' : '#202226');
        grad.addColorStop(1, '#0b0c0e');
        g.fillStyle = grad;
        g.fillRect(i * cell, j * cell, cell, cell);
      }
    }
  }, { repeat: 1 });
}

function glowTexture() {
  return canvasTexture(64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.65)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}

/** Spinning prop blur: faint near the hub, a denser ring towards the tips. */
function blurTexture() {
  return canvasTexture(128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.15, 'rgba(255,255,255,0.15)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.45)');
    grad.addColorStop(0.92, 'rgba(255,255,255,0.75)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
}

/** Battery wrap with a generic (unbranded) label. */
function batteryTexture() {
  return canvasTexture(256, (g, n) => {
    g.fillStyle = '#16181c';
    g.fillRect(0, 0, n, n);
    g.fillStyle = '#f2c230';
    g.fillRect(0, n * 0.62, n, n * 0.1);
    g.fillStyle = '#f2f2f2';
    g.font = `bold ${n * 0.16}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.fillText('6S 1300', n / 2, n * 0.38);
    g.font = `${n * 0.09}px system-ui, sans-serif`;
    g.fillStyle = '#b8bec6';
    g.fillText('22.2V  LiPo', n / 2, n * 0.54);
  });
}

/** Top-down outline of one arm along +X, from the centre to the motor mount. */
function armGeometry(length, carbon) {
  const w0 = 0.024;
  const w1 = 0.017;
  const r = 0.0155;
  const s = new THREE.Shape();
  s.moveTo(0, -w0 / 2);
  s.lineTo(length - r * 0.6, -w1 / 2);
  s.absarc(length, 0, r, -Math.PI * 0.62, Math.PI * 0.62, false);
  s.lineTo(0, w0 / 2);
  s.closePath();
  // Motor bolt holes and a centre hole make it read as machined carbon.
  for (const [dx, dz] of [[0.0065, 0.0065], [-0.0065, 0.0065], [0.0065, -0.0065], [-0.0065, -0.0065]]) {
    const hole = new THREE.Path();
    hole.absarc(length + dx, dz, 0.0013, 0, Math.PI * 2, true);
    s.holes.push(hole);
  }
  const center = new THREE.Path();
  center.absarc(length, 0, 0.0035, 0, Math.PI * 2, true);
  s.holes.push(center);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.005, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 1, curveSegments: 10,
  });
  g.rotateX(-Math.PI / 2); // shape XY -> XZ, extrusion along +Y
  g.translate(0, -0.0025, 0);
  carbon.repeat.set(110, 110); // shape UVs are in metres: ~1 mm weave
  return g;
}

function roundedPlate(w, d, r, thickness) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: thickness, bevelEnabled: true, bevelThickness: 0.0005, bevelSize: 0.0005, bevelSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}

/** One prop blade: swept planform, thin, along +X from the hub. */
function bladeGeometry() {
  const s = new THREE.Shape();
  const r0 = 0.0055;
  s.moveTo(r0, -0.003);
  s.bezierCurveTo(0.02, -0.0085, 0.045, -0.0075, PROP_R - 0.002, -0.002);
  s.quadraticCurveTo(PROP_R + 0.0005, 0.001, PROP_R - 0.003, 0.0045);
  s.bezierCurveTo(0.045, 0.0068, 0.02, 0.0072, r0, 0.0035);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0011, bevelEnabled: false, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  // Twist: more pitch near the hub than at the tip.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const twist = 0.38 - (x / PROP_R) * 0.22;
    p.setY(i, p.getY(i) + z * Math.tan(twist));
  }
  g.computeVertexNormals();
  return g;
}

export function createDroneModel() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  // The collision sphere centre sits a little above the arms; feet reach its bottom.
  body.position.y = -0.045;
  root.add(body);

  const carbonMap = carbonTexture();
  const carbon = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', map: carbonMap, roughness: 0.45, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.18,
  });
  const alu = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.9 });
  const anodized = alu('#c0262d'); // standoffs and bell caps: red anodised accents
  const bellMat = alu('#33373e'); // motor bells: dark gunmetal
  const steel = alu('#c9ced6');
  const copper = new THREE.MeshStandardMaterial({ color: '#c46a2c', roughness: 0.35, metalness: 1 });
  const blackPlastic = new THREE.MeshStandardMaterial({ color: '#0f1013', roughness: 0.6 });
  const tpu = new THREE.MeshStandardMaterial({ color: FRONT_COLOR, roughness: 0.75 });
  const pcb = new THREE.MeshStandardMaterial({ color: '#1d4d2f', roughness: 0.55, metalness: 0.2 });
  const add = (geo, mat, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // --- Frame: four arms and two plates --------------------------------------
  const armLen = Math.SQRT2 * MOTOR;
  const armGeo = armGeometry(armLen, carbonMap);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const a = add(armGeo, carbon, 0, 0, 0);
    a.rotation.y = Math.atan2(-sz, sx); // shape +X -> towards (sx, sz)
  }
  add(roundedPlate(0.046, 0.112, 0.008, 0.003), carbon, 0, 0.0025, 0);
  add(roundedPlate(0.042, 0.098, 0.008, 0.0025), carbon, 0, 0.032, 0);
  const standoff = new THREE.CylinderGeometry(0.0028, 0.0028, 0.027, 8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(standoff, anodized, sx * 0.017, 0.019, sz * 0.042);

  // --- Electronics stack ---------------------------------------------------------
  add(new THREE.BoxGeometry(0.03, 0.0016, 0.03), pcb, 0, 0.011, 0.006); // ESC
  add(new THREE.BoxGeometry(0.03, 0.0016, 0.03), pcb, 0, 0.019, 0.006); // FC
  for (const [x, z, w] of [[0.006, 0.004, 0.008], [-0.007, 0.012, 0.005], [-0.006, -0.002, 0.004]]) {
    add(new THREE.BoxGeometry(w, 0.0015, w), blackPlastic, x, 0.0205, z);
  }
  add(new THREE.CylinderGeometry(0.0045, 0.0045, 0.012, 12), new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.4 }), 0.012, 0.012, 0.035)
    .rotation.z = Math.PI / 2; // capacitor
  add(new THREE.BoxGeometry(0.02, 0.003, 0.02), pcb, 0, 0.027, 0.02); // VTX

  // --- Camera in TPU side mounts, tilted up -----------------------------------------
  const cam = new THREE.Group();
  cam.position.set(0, 0.017, -0.045);
  cam.rotation.x = 0.35;
  body.add(cam);
  add(new THREE.BoxGeometry(0.019, 0.019, 0.016), blackPlastic, 0, 0, 0, cam);
  const barrel = add(new THREE.CylinderGeometry(0.0075, 0.0082, 0.01, 18), alu('#202226'), 0, 0, -0.012, cam);
  barrel.rotation.x = Math.PI / 2;
  const glass = add(new THREE.CircleGeometry(0.0062, 18), new THREE.MeshPhysicalMaterial({
    color: '#0a1020', roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02,
  }), 0, 0, -0.0171, cam);
  glass.rotation.y = Math.PI;
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.0035, 0.024, 0.022), tpu, sx * 0.0115, 0.017, -0.044);

  // --- Battery with strap and lead ---------------------------------------------------
  const wrap = batteryTexture();
  const plain = new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.55 });
  const label = new THREE.MeshStandardMaterial({ map: wrap, roughness: 0.5 });
  // Box face order: +x, -x, +y, -y, +z, -z. Labels on the sides.
  add(new THREE.BoxGeometry(0.036, 0.03, 0.074), [label, label, plain, plain, plain, plain], 0, 0.049, 0.004);
  const strap = new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.8 });
  add(new THREE.BoxGeometry(0.0385, 0.0315, 0.014), strap, 0, 0.049, 0.004);
  add(new THREE.BoxGeometry(0.01, 0.006, 0.012), new THREE.MeshStandardMaterial({ color: '#d9c21f', roughness: 0.5 }), 0, 0.066, 0.046); // XT60
  const lead = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.004, 0.06, 0.041), new THREE.Vector3(0.006, 0.066, 0.05), new THREE.Vector3(0, 0.066, 0.046),
  ]);
  add(new THREE.TubeGeometry(lead, 8, 0.0018, 6), new THREE.MeshStandardMaterial({ color: '#b01010', roughness: 0.5 }), 0, 0, 0);

  // --- Antenna (rear, in a TPU mount) ---------------------------------------------------
  add(new THREE.BoxGeometry(0.02, 0.01, 0.008), tpu, 0, 0.036, 0.05);
  const ant = add(new THREE.CylinderGeometry(0.0016, 0.0016, 0.05, 6), blackPlastic, 0, 0.056, 0.058);
  ant.rotation.x = 0.6; // leans backwards; its top ends at (0, 0.0766, 0.072)
  add(new THREE.SphereGeometry(0.0045, 10, 8), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.6 }), 0, 0.0766, 0.072);

  // --- Motors, wires, feet, props ---------------------------------------------------------
  const motorBase = new THREE.CylinderGeometry(0.0128, 0.0135, 0.004, 20);
  const stator = new THREE.CylinderGeometry(0.0112, 0.0112, 0.006, 20);
  const bell = new THREE.CylinderGeometry(0.0138, 0.0138, 0.0095, 24, 1, true);
  const bellTop = new THREE.CylinderGeometry(0.0138, 0.0138, 0.0018, 24);
  const nut = new THREE.CylinderGeometry(0.0045, 0.0045, 0.006, 6);
  const footGeo = new THREE.CapsuleGeometry(0.0055, 0.014, 4, 10);
  const bladeGeo = bladeGeometry();
  const discGeo = new THREE.CircleGeometry(PROP_R, 40);
  discGeo.rotateX(-Math.PI / 2);
  const blurMap = blurTexture();
  const wireMat = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.6 });

  const props = [];
  // Props-out spin: front-right and rear-left clockwise from above.
  const motors = [
    { x: MOTOR, z: MOTOR, front: false, dir: 1 },
    { x: MOTOR, z: -MOTOR, front: true, dir: -1 },
    { x: -MOTOR, z: MOTOR, front: false, dir: -1 },
    { x: -MOTOR, z: -MOTOR, front: true, dir: 1 },
  ];
  for (const m of motors) {
    add(motorBase, bellMat, m.x, 0.0045, m.z);
    add(stator, copper, m.x, 0.0095, m.z);
    add(bell, bellMat, m.x, 0.0147, m.z);
    add(bellTop, anodized, m.x, 0.0203, m.z);
    add(nut, steel, m.x, 0.0285, m.z);
    // Feet: rounded TPU bumpers; bottom at -0.025 (see FEET_DEPTH).
    add(footGeo, tpu, m.x * 0.94, -0.0125, m.z * 0.94);
    // Motor wires along the arm to the ESC.
    const wire = new THREE.CatmullRomCurve3([
      new THREE.Vector3(m.x * 0.82, 0.004, m.z * 0.82),
      new THREE.Vector3(m.x * 0.5, 0.0045, m.z * 0.5),
      new THREE.Vector3(m.x * 0.2, 0.009, m.z * 0.15),
    ]);
    add(new THREE.TubeGeometry(wire, 10, 0.0016, 6), wireMat, 0, 0, 0);

    const color = m.front ? FRONT_COLOR : REAR_COLOR;
    const bladeMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
    const hub = new THREE.Group();
    hub.position.set(m.x, PROP_Y, m.z);
    hub.scale.x = m.dir; // mirror the blades for the opposite spin direction
    body.add(hub);
    const hubMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.006, 14), bladeMat);
    hubMesh.castShadow = true;
    hub.add(hubMesh);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(bladeGeo, bladeMat);
      b.rotation.y = (i * Math.PI * 2) / 3;
      b.castShadow = true;
      hub.add(b);
    }
    const discMat = new THREE.MeshBasicMaterial({
      color, map: blurMap, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.set(m.x, PROP_Y + 0.001, m.z);
    disc.renderOrder = 2;
    body.add(disc);
    props.push({ hub, disc, bladeMat, dir: m.dir, angle: Math.random() * 6 });
  }

  // --- LEDs under the arms + glow sprites ----------------------------------------------------
  const glowTex = glowTexture();
  const glows = [];
  const ledGeo = new THREE.BoxGeometry(0.014, 0.003, 0.008);
  for (const m of motors) {
    const c = m.front ? FRONT_LED : REAR_LED;
    const ledMat = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(3), toneMapped: false });
    const lx = m.x * 0.62;
    const lz = m.z * 0.62;
    const led = add(ledGeo, ledMat, lx, -0.004, lz);
    led.rotation.y = Math.atan2(-m.z, m.x);
    led.castShadow = false;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, depthWrite: false, toneMapped: false }),
    );
    sprite.position.set(lx, -0.006, lz);
    sprite.renderOrder = 3;
    body.add(sprite);
    glows.push(sprite);
  }

  return {
    root,
    /**
     * @param {number} motor 0..1 motor output
     * @param {number} dt seconds
     * @param {number} camDist camera distance (scales LED glows)
     * @param {boolean} fpv hide the glows when flying FPV
     */
    update(motor, dt, camDist, fpv = false) {
      const spin = motor * 90 + (motor > 0.01 ? 8 : 0); // rad/s, visual only
      const blur = THREE.MathUtils.smoothstep(motor, 0.1, 0.3);
      for (const p of props) {
        p.angle += p.dir * spin * dt;
        p.hub.rotation.y = p.angle;
        p.hub.visible = blur < 0.98;
        p.bladeMat.opacity = 0.92 * (1 - blur * 0.85);
        p.disc.material.opacity = blur * 0.55;
        p.disc.rotation.y = p.angle * 0.05; // a slow drift keeps the blur alive
      }
      const s = THREE.MathUtils.clamp(camDist * 0.014, 0.05, 1.6) / root.scale.x;
      for (const g of glows) {
        g.scale.setScalar(s);
        g.visible = !fpv;
      }
    },
  };
}
