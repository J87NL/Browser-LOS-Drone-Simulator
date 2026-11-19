// Low-poly 5" quad. Forward is -Z. Front props are orange and the front LEDs
// green, rear props dark and rear LEDs red, so orientation is readable in LOS.
// LED glow sprites (normal blending, so they also show against a bright sky) grow with camera distance so they stay visible far away.
import * as THREE from 'three';

const MOTOR = 0.078; // motor offset from centre on X and Z (220 mm wheelbase)
const PROP_R = 0.0635;
const FRONT_COLOR = '#ff7a1a';
const REAR_COLOR = '#23272d';
const FRONT_LED = new THREE.Color('#2dff7a');
const REAR_LED = new THREE.Color('#ff2436');

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createDroneModel() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  // The collision sphere centre sits a little above the arms; feet reach its bottom.
  body.position.y = -0.045;
  root.add(body);

  const carbon = new THREE.MeshStandardMaterial({ color: '#1b1d21', roughness: 0.45, metalness: 0.3 });
  const alu = new THREE.MeshStandardMaterial({ color: '#b02a2a', roughness: 0.35, metalness: 0.8 });
  const motorMat = new THREE.MeshStandardMaterial({ color: '#2a2e35', roughness: 0.3, metalness: 0.85 });
  const tpu = new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.7 });
  const add = (geo, mat, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // Arms (true X) and plates
  const armGeo = new THREE.BoxGeometry(0.235, 0.005, 0.02);
  add(armGeo, carbon, 0, 0, 0).rotation.y = Math.PI / 4;
  add(armGeo, carbon, 0, 0, 0).rotation.y = -Math.PI / 4;
  add(new THREE.BoxGeometry(0.045, 0.004, 0.11), carbon, 0, 0.002, 0);
  add(new THREE.BoxGeometry(0.042, 0.003, 0.095), carbon, 0, 0.032, 0);
  const standoff = new THREE.CylinderGeometry(0.0025, 0.0025, 0.03, 6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(standoff, alu, sx * 0.017, 0.017, sz * 0.04);
  // Stack
  add(new THREE.BoxGeometry(0.03, 0.012, 0.03), new THREE.MeshStandardMaterial({ color: '#1f6b3a', roughness: 0.6 }), 0, 0.012, 0.005);
  // Camera + TPU mount, tilted up a little
  const cam = add(new THREE.BoxGeometry(0.02, 0.019, 0.02), carbon, 0, 0.017, -0.045);
  cam.rotation.x = 0.35;
  add(new THREE.CylinderGeometry(0.007, 0.008, 0.008, 10), new THREE.MeshStandardMaterial({ color: '#0a0a0c', roughness: 0.1, metalness: 0.5 }), 0, 0, -0.012, cam).rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(0.03, 0.018, 0.006), tpu, 0, 0.017, -0.034);
  // Antenna at the back
  const ant = add(new THREE.CylinderGeometry(0.002, 0.002, 0.05, 5), tpu, 0, 0.05, 0.05);
  ant.rotation.x = -0.6;
  // Battery with strap
  add(new THREE.BoxGeometry(0.036, 0.03, 0.074), new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.5 }), 0, 0.049, 0.004);
  add(new THREE.BoxGeometry(0.038, 0.032, 0.012), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.8 }), 0, 0.049, 0.004);

  // Motors, feet, props
  const motorGeo = new THREE.CylinderGeometry(0.0135, 0.0135, 0.016, 14);
  const capGeo = new THREE.CylinderGeometry(0.0085, 0.0135, 0.004, 14);
  const footGeo = new THREE.CylinderGeometry(0.006, 0.004, 0.025, 6);
  const bladeGeo = new THREE.BoxGeometry(PROP_R - 0.006, 0.0015, 0.012);
  bladeGeo.translate((PROP_R - 0.006) / 2 + 0.006, 0, 0);
  const discGeo = new THREE.CircleGeometry(PROP_R, 28);
  discGeo.rotateX(-Math.PI / 2);

  const props = [];
  // Betaflight order isn't needed; spin direction: props-out.
  const motors = [
    { x: MOTOR, z: MOTOR, front: false, dir: 1 },
    { x: MOTOR, z: -MOTOR, front: true, dir: -1 },
    { x: -MOTOR, z: MOTOR, front: false, dir: -1 },
    { x: -MOTOR, z: -MOTOR, front: true, dir: 1 },
  ];
  for (const m of motors) {
    add(motorGeo, motorMat, m.x, 0.011, m.z);
    add(capGeo, m.front ? tpu : alu, m.x, 0.021, m.z);
    add(footGeo, tpu, m.x, -0.0125, m.z);
    const color = m.front ? FRONT_COLOR : REAR_COLOR;
    const bladeMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, transparent: true, opacity: 0.95 });
    const hub = new THREE.Group();
    hub.position.set(m.x, 0.026, m.z);
    body.add(hub);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(bladeGeo, bladeMat);
      b.rotation.y = (i * Math.PI * 2) / 3;
      b.rotation.x = 0.18 * m.dir;
      b.castShadow = true;
      hub.add(b);
    }
    const discMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.set(m.x, 0.026, m.z);
    disc.renderOrder = 2;
    body.add(disc);
    props.push({ hub, disc, bladeMat, dir: m.dir, angle: Math.random() * 6 });
  }

  // LEDs: small emissive bars under the arms + glow sprites.
  const glowTex = glowTexture();
  const glows = [];
  const ledGeo = new THREE.BoxGeometry(0.012, 0.004, 0.012);
  for (const m of motors) {
    const c = m.front ? FRONT_LED : REAR_LED;
    const ledMat = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(3), toneMapped: false });
    const lx = m.x * 0.62;
    const lz = m.z * 0.62;
    add(ledGeo, ledMat, lx, -0.005, lz);
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
        p.bladeMat.opacity = 0.95 * (1 - blur * 0.85);
        p.disc.material.opacity = blur * 0.42;
      }
      const s = THREE.MathUtils.clamp(camDist * 0.014, 0.05, 1.6) / root.scale.x;
      for (const g of glows) {
        g.scale.setScalar(s);
        g.visible = !fpv;
      }
    },
  };
}
