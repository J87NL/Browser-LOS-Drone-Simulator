// LOS helper: an arrow at the screen edge when the drone is off-screen, and a
// ring with distance when it is far away.
import * as THREE from 'three';
import { h } from './dom.js';

const _v = new THREE.Vector3();

export class LosMarker {
  constructor(parent) {
    this.arrow = h('div', { class: 'los-arrow hidden' });
    this.ring = h('div', { class: 'los-ring hidden' }, (this.ringText = h('span')));
    parent.append(this.arrow, this.ring);
  }

  hide() {
    this.arrow.classList.add('hidden');
    this.ring.classList.add('hidden');
  }

  update(camera, pos, distance, farDistance, width, height) {
    _v.copy(pos).project(camera);
    // Behind the camera, NDC is mirrored.
    const behind = _v.z > 1;
    let x = _v.x;
    let y = _v.y;
    if (behind) {
      x = -x;
      y = -y;
    }
    const onScreen = !behind && Math.abs(x) <= 0.95 && Math.abs(y) <= 0.95;
    if (onScreen) {
      this.arrow.classList.add('hidden');
      if (distance > farDistance) {
        this.ring.classList.remove('hidden');
        this.ring.style.transform = `translate(${((x + 1) / 2) * width}px, ${((1 - y) / 2) * height}px) translate(-50%, -50%)`;
        this.ringText.textContent = `${distance.toFixed(0)} m`;
      } else this.ring.classList.add('hidden');
      return;
    }
    this.ring.classList.add('hidden');
    const ang = Math.atan2(y, x);
    const m = Math.max(Math.abs(x), Math.abs(y)) || 1;
    const ex = (x / m) * 0.9;
    const ey = (y / m) * 0.9;
    this.arrow.classList.remove('hidden');
    this.arrow.style.transform =
      `translate(${((ex + 1) / 2) * width}px, ${((1 - ey) / 2) * height}px) translate(-50%, -50%) rotate(${-ang}rad)`;
  }
}
