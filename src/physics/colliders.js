// Simple collision world: a heightfield ground plus boxes and vertical
// cylinders, bucketed into a uniform grid. The drone is a sphere.
import { Vector3 } from 'three';

const CELL = 8;
const key = (cx, cz) => cx * 73856093 + cz * 19349663;

export class CollisionWorld {
  /**
   * @param {(x:number,z:number)=>number} heightFn ground height
   */
  constructor(heightFn) {
    this.heightFn = heightFn;
    this.grid = new Map();
    this.colliders = [];
    this._stamp = 0;
    this._contacts = [];
    for (let i = 0; i < 16; i++) this._contacts.push({ normal: new Vector3(), depth: 0, ground: false });
  }

  /** Axis-aligned box rotated by `yaw` (radians) around its vertical axis. hx/hy/hz are half sizes. */
  addBox({ x, y, z, hx, hy, hz, yaw = 0 }) {
    const c = { type: 'box', x, y, z, hx, hy, hz, cos: Math.cos(yaw), sin: Math.sin(yaw), enabled: true, stamp: 0 };
    const reach = Math.hypot(hx, hz);
    this._insert(c, x - reach, z - reach, x + reach, z + reach);
    return c;
  }

  /** Vertical cylinder from y0 to y1. */
  addCylinder({ x, z, y0, y1, r }) {
    const c = { type: 'cyl', x, z, y0, y1, r, enabled: true, stamp: 0 };
    this._insert(c, x - r, z - r, x + r, z + r);
    return c;
  }

  _insert(c, x0, z0, x1, z1) {
    this.colliders.push(c);
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const k = key(cx, cz);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(c);
      }
    }
  }

  groundNormal(x, z, out = new Vector3()) {
    const e = 0.25;
    const h = this.heightFn;
    out.set(h(x - e, z) - h(x + e, z), 2 * e, h(x, z - e) - h(x, z + e));
    return out.normalize();
  }

  /**
   * All contacts of a sphere. The returned array and its objects are reused
   * between calls; copy what you need.
   * @returns {{normal:Vector3, depth:number, ground:boolean}[]}
   */
  contacts(pos, radius) {
    const out = [];
    let n = 0;
    const push = (nx, ny, nz, depth, ground) => {
      if (n >= this._contacts.length) return;
      const c = this._contacts[n++];
      c.normal.set(nx, ny, nz);
      c.depth = depth;
      c.ground = ground;
      out.push(c);
    };

    // Ground
    const gh = this.heightFn(pos.x, pos.z);
    if (pos.y - radius < gh) {
      const gn = this.groundNormal(pos.x, pos.z);
      push(gn.x, gn.y, gn.z, (gh + radius - pos.y) * gn.y, true);
    }

    // Obstacles
    const stamp = ++this._stamp;
    const cx0 = Math.floor((pos.x - radius) / CELL);
    const cx1 = Math.floor((pos.x + radius) / CELL);
    const cz0 = Math.floor((pos.z - radius) / CELL);
    const cz1 = Math.floor((pos.z + radius) / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const list = this.grid.get(key(cx, cz));
        if (!list) continue;
        for (const c of list) {
          if (c.stamp === stamp || !c.enabled) continue;
          c.stamp = stamp;
          if (c.type === 'box') this._box(c, pos, radius, push);
          else this._cyl(c, pos, radius, push);
        }
      }
    }
    return out;
  }

  _box(b, pos, r, push) {
    // World -> box local (rotation about Y by -yaw).
    const dx = pos.x - b.x;
    const dz = pos.z - b.z;
    const lx = dx * b.cos - dz * b.sin;
    const lz = dx * b.sin + dz * b.cos;
    const ly = pos.y - b.y;
    const qx = Math.max(-b.hx, Math.min(b.hx, lx));
    const qy = Math.max(-b.hy, Math.min(b.hy, ly));
    const qz = Math.max(-b.hz, Math.min(b.hz, lz));
    let nx = lx - qx;
    let ny = ly - qy;
    let nz = lz - qz;
    const d = Math.hypot(nx, ny, nz);
    let depth;
    if (d > 1e-6) {
      if (d >= r) return;
      nx /= d; ny /= d; nz /= d;
      depth = r - d;
    } else {
      // Centre inside the box: push out through the nearest face.
      const px = b.hx - Math.abs(lx);
      const py = b.hy - Math.abs(ly);
      const pz = b.hz - Math.abs(lz);
      nx = ny = nz = 0;
      if (px <= py && px <= pz) { nx = Math.sign(lx) || 1; depth = px + r; }
      else if (py <= pz) { ny = Math.sign(ly) || 1; depth = py + r; }
      else { nz = Math.sign(lz) || 1; depth = pz + r; }
    }
    // Local -> world.
    const wx = nx * b.cos + nz * b.sin;
    const wz = -nx * b.sin + nz * b.cos;
    push(wx, ny, wz, depth, false);
  }

  _cyl(c, pos, r, push) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const rho = Math.hypot(dx, dz);
    const inY = pos.y >= c.y0 && pos.y <= c.y1;
    if (rho < c.r && inY) {
      // Centre inside.
      const side = c.r - rho;
      const top = c.y1 - pos.y;
      const bottom = pos.y - c.y0;
      if (side <= top && side <= bottom) {
        const s = rho > 1e-6 ? 1 / rho : 0;
        push(rho > 1e-6 ? dx * s : 1, 0, rho > 1e-6 ? dz * s : 0, side + r, false);
      } else if (top <= bottom) push(0, 1, 0, top + r, false);
      else push(0, -1, 0, bottom + r, false);
      return;
    }
    const k = rho > c.r ? c.r / rho : 1;
    const qx = dx * k;
    const qz = dz * k;
    const qy = Math.max(c.y0, Math.min(c.y1, pos.y));
    let nx = dx - qx;
    let ny = pos.y - qy;
    let nz = dz - qz;
    const d = Math.hypot(nx, ny, nz);
    if (d >= r || d < 1e-9) return;
    nx /= d; ny /= d; nz /= d;
    push(nx, ny, nz, r - d, false);
  }
}
