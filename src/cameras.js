// Camera modes: LOS (pilot on the ground), chase, FPV.
import * as THREE from 'three';
import { CAMERA } from './config.js';

export const CAMERA_MODES = ['los', 'chase', 'fpv'];
export const CAMERA_LABELS = { los: 'LOS', chase: 'Chase', fpv: 'FPV' };

const _v = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _q = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);

const damp = (k, dt) => 1 - Math.exp(-k * dt);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** LOS auto-zoom: vertical FOV (deg) that keeps the drone a similar size on screen. */
export function losFov(distance) {
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(CAMERA.losZoomK / Math.max(0.01, distance)));
  return THREE.MathUtils.clamp(fov, CAMERA.losMinFov, CAMERA.losMaxFov);
}

/** Convert a horizontal FOV to three.js' vertical FOV for the given aspect. */
export function horizontalToVerticalFov(hDeg, aspect) {
  const h = THREE.MathUtils.degToRad(hDeg);
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / aspect));
}

export class CameraRig {
  constructor(camera, groundHeight) {
    this.camera = camera;
    this.groundHeight = groundHeight;
    this.mode = 'los';
    this.pilot = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.chasePos = new THREE.Vector3();
    this.chaseYaw = 0;
    this.fov = CAMERA.losMaxFov;
    this.snap = true;
    const [px, , pz] = CAMERA.pilotStart;
    this.setPilot(px, pz);
  }

  /** Stand a few metres behind the drone (never right under it). */
  setPilotBehind(pos, heading) {
    const d = CAMERA.pilotBehind;
    this.setPilot(pos.x + Math.sin(heading) * d, pos.z + Math.cos(heading) * d);
  }

  setPilot(x, z) {
    this.pilot.set(x, this.groundHeight(x, z) + CAMERA.pilotEyeHeight, z);
    this.snap = true;
  }

  cycle() {
    const i = CAMERA_MODES.indexOf(this.mode);
    this.setMode(CAMERA_MODES[(i + 1) % CAMERA_MODES.length]);
  }

  setMode(mode) {
    this.mode = mode;
    this.snap = true;
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} pos drone render position
   * @param {THREE.Quaternion} quat drone render orientation
   * @param {number} heading drone heading (rad)
   * @param {object} settings
   * @param {number} scale model scale (whoop is smaller)
   */
  update(dt, pos, quat, heading, settings, scale = 1) {
    const cam = this.camera;
    let fov;
    let near = 0.1;
    if (this.mode === 'los') {
      if (this.snap) this.lookTarget.copy(pos);
      this.lookTarget.lerp(pos, damp(CAMERA.losLookSmoothing, dt));
      cam.position.copy(this.pilot);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.lookTarget);
      const dist = this.pilot.distanceTo(pos) / scale;
      const target = settings.losAutoZoom ? losFov(dist) : CAMERA.losFixedFov;
      fov = this.snap ? target : this.fov + (target - this.fov) * damp(CAMERA.losZoomSmoothing, dt);
    } else if (this.mode === 'chase') {
      if (this.snap) this.chaseYaw = heading;
      this.chaseYaw += wrapAngle(heading - this.chaseYaw) * damp(CAMERA.chaseYawLag, dt);
      _fwd.set(-Math.sin(this.chaseYaw), 0, -Math.cos(this.chaseYaw));
      _v.copy(pos)
        .addScaledVector(_fwd, -CAMERA.chaseDistance * scale);
      _v.y += CAMERA.chaseHeight * scale;
      if (this.snap) this.chasePos.copy(_v);
      this.chasePos.lerp(_v, damp(CAMERA.chasePosLag, dt));
      const minY = this.groundHeight(this.chasePos.x, this.chasePos.z) + 0.25;
      if (this.chasePos.y < minY) this.chasePos.y = minY;
      cam.position.copy(this.chasePos);
      cam.up.set(0, 1, 0);
      _v.copy(pos).addScaledVector(_fwd, 1.2 * scale);
      cam.lookAt(_v);
      fov = CAMERA.chaseFov;
    } else {
      _v.set(0, 0.02, -0.05).multiplyScalar(scale).applyQuaternion(quat);
      cam.position.copy(pos).add(_v);
      _q.setFromAxisAngle(X, THREE.MathUtils.degToRad(settings.fpvUptilt));
      cam.quaternion.copy(quat).multiply(_q);
      fov = horizontalToVerticalFov(settings.fpvFov, cam.aspect);
      near = 0.02;
    }
    this.fov = fov;
    if (cam.fov !== fov || cam.near !== near) {
      cam.fov = fov;
      cam.near = near;
      cam.updateProjectionMatrix();
    }
    this.snap = false;
  }
}
