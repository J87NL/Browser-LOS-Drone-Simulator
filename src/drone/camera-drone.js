import * as THREE from 'three';
import { FEET_DEPTH, FRONT_COLOR, FRONT_LED, REAR_LED, blurTexture, glowTexture } from './model.js';

const MOTOR = 0.078;
const PROP_R = 0.074;
const PROP_Y = 0.03;

function tubeBetween(from, to, radius, material) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 10), material);
  mesh.position.copy(from).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function bladeGeometry() {
  const geometry = new THREE.BoxGeometry(PROP_R - 0.006, 0.0016, 0.011);
  geometry.translate((PROP_R - 0.006) / 2 + 0.006, 0, 0);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const along = position.getX(i) / PROP_R;
    position.setZ(i, position.getZ(i) * (1.15 - along * 0.55));
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createCameraDroneModel({ shell = '#f1f2f0' } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const shellMat = new THREE.MeshPhysicalMaterial({ color: shell, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.25 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.5, metalness: 0.3 });
  const greyMat = new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.4, metalness: 0.6 });
  const frontMat = new THREE.MeshStandardMaterial({ color: FRONT_COLOR, roughness: 0.5 });
  const add = (geometry, material, x, y, z, parent = body) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const hull = add(new THREE.SphereGeometry(0.06, 32, 20), shellMat, 0, 0, 0);
  hull.scale.set(0.95, 0.42, 1.2);
  add(new THREE.CylinderGeometry(0.05, 0.055, 0.012, 32), shellMat, 0, -0.012, 0).scale.set(1, 1, 1.15);

  const motors = [
    { x: MOTOR, z: MOTOR, front: false, dir: 1 },
    { x: MOTOR, z: -MOTOR, front: true, dir: -1 },
    { x: -MOTOR, z: MOTOR, front: false, dir: -1 },
    { x: -MOTOR, z: -MOTOR, front: true, dir: 1 },
  ];
  const pod = new THREE.CylinderGeometry(0.014, 0.012, 0.03, 20);
  const cap = new THREE.CylinderGeometry(0.011, 0.012, 0.006, 20);
  const stripe = new THREE.CylinderGeometry(0.0142, 0.0142, 0.005, 20);
  const bladeGeo = bladeGeometry();
  const discGeo = new THREE.CircleGeometry(PROP_R, 40);
  discGeo.rotateX(-Math.PI / 2);
  const blurMap = blurTexture();
  const props = [];
  for (const m of motors) {
    body.add(tubeBetween(new THREE.Vector3(m.x * 0.25, 0.004, m.z * 0.25), new THREE.Vector3(m.x, 0.004, m.z), 0.0085, shellMat));
    add(pod, shellMat, m.x, 0.006, m.z);
    add(stripe, m.front ? frontMat : darkMat, m.x, 0.0, m.z);
    add(cap, greyMat, m.x, 0.024, m.z);

    const bladeMat = new THREE.MeshStandardMaterial({ color: '#e6e8ea', roughness: 0.4, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
    const hub = new THREE.Group();
    hub.position.set(m.x, PROP_Y, m.z);
    hub.scale.x = m.dir;
    body.add(hub);
    hub.add(new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.006, 14), greyMat));
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.rotation.y = i * Math.PI;
      blade.rotation.x = 0.08 * (i === 0 ? 1 : -1);
      blade.castShadow = true;
      hub.add(blade);
    }
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({
      color: '#d8dade', map: blurMap, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    }));
    disc.position.set(m.x, PROP_Y + 0.001, m.z);
    disc.renderOrder = 2;
    body.add(disc);
    props.push({ hub, disc, bladeMat, dir: m.dir, angle: Math.random() * 6 });
  }

  const skidY = -FEET_DEPTH + 0.0045;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      body.add(tubeBetween(new THREE.Vector3(sx * 0.03, -0.018, sz * 0.03), new THREE.Vector3(sx * 0.05, skidY, sz * 0.035), 0.0035, shellMat));
    }
    const skid = add(new THREE.CapsuleGeometry(0.0045, 0.09, 4, 12), shellMat, sx * 0.05, skidY, 0);
    skid.rotation.x = Math.PI / 2;
  }

  const gimbal = new THREE.Group();
  gimbal.position.set(0, -0.034, -0.042);
  body.add(gimbal);
  add(new THREE.BoxGeometry(0.008, 0.016, 0.008), darkMat, 0, 0.01, 0.006, gimbal);
  const camera = add(new THREE.SphereGeometry(0.013, 20, 14), darkMat, 0, -0.002, 0, gimbal);
  camera.scale.set(1.1, 0.9, 1);
  const lens = add(new THREE.CylinderGeometry(0.0065, 0.0072, 0.006, 18), new THREE.MeshPhysicalMaterial({
    color: '#0a1020', roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02,
  }), 0, -0.002, -0.013, gimbal);
  lens.rotation.x = Math.PI / 2;

  const glowTex = glowTexture();
  const glows = [];
  for (const m of motors) {
    const color = m.front ? FRONT_LED : REAR_LED;
    add(new THREE.SphereGeometry(0.004, 10, 8), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(3), toneMapped: false }), m.x, -0.011, m.z)
      .castShadow = false;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, toneMapped: false }));
    sprite.position.set(m.x, -0.013, m.z);
    sprite.renderOrder = 3;
    body.add(sprite);
    glows.push(sprite);
  }

  return {
    root,
    update(motor, dt, camDist, fpv = false) {
      const spin = motor * 70 + (motor > 0.01 ? 8 : 0);
      const blur = THREE.MathUtils.smoothstep(motor, 0.1, 0.3);
      for (const p of props) {
        p.angle += p.dir * spin * dt;
        p.hub.rotation.y = p.angle;
        p.hub.visible = blur < 0.98;
        p.bladeMat.opacity = 0.95 * (1 - blur * 0.85);
        p.disc.material.opacity = blur * 0.5;
        p.disc.rotation.y = p.angle * 0.05;
      }
      const s = THREE.MathUtils.clamp(camDist * 0.014, 0.05, 1.6) / root.scale.x;
      for (const g of glows) {
        g.scale.setScalar(s);
        g.visible = !fpv;
      }
    },
  };
}
