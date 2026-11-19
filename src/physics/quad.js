// Hand-written quadcopter dynamics. three.js axes: +Y up, body forward is -Z,
// body right is +X. Angular velocity is stored in the body frame.
//   roll right  = negative rotation about body +Z
//   pitch down  = negative rotation about body +X (stick forward)
//   yaw right   = negative rotation about body +Y
import { Vector3, Quaternion } from 'three';
import { GRAVITY, CONTACT, ANGLE_MODE, MOTOR } from '../config.js';
import { actualRateRad } from './rates.js';

const UP = new Vector3(0, 1, 0);

// Scratch objects (the step runs 500 times a second, avoid allocation).
const _up = new Vector3();
const _force = new Vector3();
const _vH = new Vector3();
const _axis = new Vector3();
const _dq = new Quaternion();
const _qInv = new Quaternion();
const _qDes = new Quaternion();
const _qYaw = new Quaternion();
const _upDes = new Vector3();
const _tiltAxis = new Vector3();
const _yawW = new Vector3();
const _tan = new Vector3();

export class Quad {
  constructor(params) {
    this.params = params;
    this.pos = new Vector3();
    this.vel = new Vector3();
    this.quat = new Quaternion();
    this.omega = new Vector3(); // body rad/s
    this.targetRates = new Vector3();
    this.prevPos = new Vector3();
    this.prevQuat = new Quaternion();
    this.thrust = 0; // N
    this.motor = 0; // 0..1 for prop animation and sound
    this.heading = 0; // rad, yaw of the horizontal forward direction
    this.armed = false;
    this.crashed = null; // { speed } when crashed
    this.grounded = false;
    this.lastImpact = 0;
  }

  get maxThrust() {
    return this.params.mass * GRAVITY * this.params.thrustToWeight;
  }

  setParams(params) {
    this.params = params;
  }

  /** Put the quad at rest at `position`, facing `heading` (0 = -Z). */
  reset(position, heading = 0) {
    this.pos.copy(position);
    this.vel.set(0, 0, 0);
    this.omega.set(0, 0, 0);
    this.quat.setFromAxisAngle(UP, heading);
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    this.heading = heading;
    this.thrust = 0;
    this.motor = 0;
    this.armed = false;
    this.crashed = null;
    this.grounded = false;
  }

  up(out = new Vector3()) {
    return out.copy(UP).applyQuaternion(this.quat);
  }

  /**
   * Advance the simulation by dt.
   * @param {number} dt
   * @param {{thrust:number, roll:number, pitch:number, yaw:number, mode:'angle'|'acro', rates:object, angleMaxTilt?:number}} cmd
   *   thrust is the shaped 0..1 thrust fraction, sticks are -1..1.
   * @param {import('./colliders.js').CollisionWorld} [world]
   */
  step(dt, cmd, world) {
    const p = this.params;
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    if (this.crashed) return;

    this._updateHeading();

    // --- Rate targets --------------------------------------------------
    const t = this.targetRates;
    if (this.armed) {
      if (cmd.mode === 'acro') {
        t.set(
          -actualRateRad(cmd.pitch, cmd.rates.pitch),
          -actualRateRad(cmd.yaw, cmd.rates.yaw),
          -actualRateRad(cmd.roll, cmd.rates.roll),
        );
      } else {
        this._angleModeTargets(cmd, t);
      }
      // First-order response stands in for a tuned PID loop.
      this.omega.lerp(t, 1 - Math.exp(-dt / p.rateTau));
    } else {
      t.set(0, 0, 0);
      this.omega.multiplyScalar(Math.exp(-dt * CONTACT.tumbleDamping)); // free tumble, a little air damping
    }

    // --- Thrust with motor lag -----------------------------------------
    const desired = this.armed ? Math.min(1, Math.max(0, cmd.thrust)) * this.maxThrust : 0;
    this.thrust += (desired - this.thrust) * (1 - Math.exp(-dt / p.motorTau));
    const idle = this.armed ? MOTOR.idle : 0;
    const motorTarget = Math.max(idle, this.thrust / this.maxThrust);
    this.motor += (motorTarget - this.motor) * (1 - Math.exp(-dt / (this.armed ? 0.03 : 0.4)));

    // --- Forces ----------------------------------------------------------
    const up = this.up(_up);
    _force.copy(up).multiplyScalar(this.thrust);
    _force.y -= p.mass * GRAVITY;

    // Drag split into the body-vertical axis and the body plane, so the quad
    // carves (low drag sideways through the disc, high drag through it).
    const vUp = this.vel.dot(up);
    _vH.copy(this.vel).addScaledVector(up, -vUp);
    const vHLen = _vH.length();
    _force.addScaledVector(up, -(p.dragLinV * vUp + p.dragQuadV * Math.abs(vUp) * vUp));
    _force.addScaledVector(_vH, -(p.dragLinH + p.dragQuadH * vHLen));

    // Semi-implicit Euler.
    this.vel.addScaledVector(_force, dt / p.mass);
    this.pos.addScaledVector(this.vel, dt);

    // --- Orientation -----------------------------------------------------
    const w = this.omega.length();
    if (w > 1e-9) {
      _axis.copy(this.omega).divideScalar(w);
      _dq.setFromAxisAngle(_axis, w * dt);
      this.quat.multiply(_dq).normalize();
    }

    if (world) this._collide(dt, world);
  }

  /**
   * Heading = the twist of the attitude about world Y (swing/twist
   * decomposition). Unlike projecting the nose onto the ground, this does not
   * jump 180° during a pitch flip. Held when the twist is undefined.
   * Trade-off: while inverted or on knife edge, a body-yaw input barely
   * changes this heading, so the chase camera does not follow it until the
   * quad is upright again. Following the nose instead would bring back the
   * 180° swing during pitch flips.
   */
  _updateHeading() {
    const q = this.quat;
    if (q.y * q.y + q.w * q.w > 1e-4) {
      const h = 2 * Math.atan2(q.y, q.w);
      this.heading = Math.atan2(Math.sin(h), Math.cos(h)); // wrap to (-π, π]
    }
  }

  _angleModeTargets(cmd, t) {
    const p = this.params;
    const maxTilt = ((cmd.angleMaxTilt ?? p.angleMaxTilt) * Math.PI) / 180;
    // Desired tilt relative to the current heading, as one rotation about a
    // horizontal axis so a corner stick never exceeds max tilt.
    const mag = Math.min(1, Math.hypot(cmd.pitch, cmd.roll));
    if (mag > 1e-6) {
      _tiltAxis.set(-cmd.pitch, 0, -cmd.roll).divideScalar(Math.hypot(cmd.pitch, cmd.roll));
      _qDes.setFromAxisAngle(_tiltAxis, mag * maxTilt);
    } else _qDes.identity();
    _qYaw.setFromAxisAngle(UP, this.heading);
    _qDes.premultiply(_qYaw);
    _upDes.copy(UP).applyQuaternion(_qDes);

    const up = this.up(_up);
    _axis.crossVectors(up, _upDes);
    const s = _axis.length();
    const angle = Math.atan2(s, up.dot(_upDes));
    if (s > 1e-6) {
      _axis.divideScalar(s);
    } else if (angle > 1) {
      _axis.set(1, 0, 0).applyQuaternion(this.quat); // upside down: roll out about body X
    } else {
      _axis.set(0, 0, 0);
    }
    _qInv.copy(this.quat).invert();
    _axis.applyQuaternion(_qInv); // world -> body
    const gain = Math.min(ANGLE_MODE.maxRate, angle * p.angleGain);
    t.copy(_axis).multiplyScalar(gain);
    // Yaw is a rate about world up (not body up), so turning does not drag
    // the tilt away from its target.
    _yawW.set(0, -actualRateRad(cmd.yaw, cmd.rates.yaw), 0).applyQuaternion(_qInv);
    t.add(_yawW);
  }

  _collide(dt, world) {
    const p = this.params;
    this.grounded = false;
    const contacts = world.contacts(this.pos, p.radius);
    let groundNormal = null;
    for (const c of contacts) {
      const n = c.normal;
      this.pos.addScaledVector(n, c.depth);
      const vn = this.vel.dot(n);
      if (vn < 0) {
        const impact = -vn;
        this.lastImpact = impact;
        if (impact > p.crashSpeed) {
          this.crash(impact);
          return;
        }
        const e = impact > CONTACT.restingSpeed ? p.restitution : 0;
        this.vel.addScaledVector(n, -(1 + e) * vn);
      }
      // Tangential friction.
      const vn2 = this.vel.dot(n);
      _tan.copy(this.vel).addScaledVector(n, -vn2);
      this.vel.addScaledVector(_tan, -(1 - Math.exp(-CONTACT.friction * dt)));
      if (n.y > 0.6) {
        this.grounded = true;
        groundNormal = n;
      }
    }

    // A grounded quad that is not producing lift settles flat on its feet.
    if (groundNormal && this.thrust < CONTACT.levelBelowWeight * p.mass * GRAVITY) {
      const up = this.up(_up);
      _axis.crossVectors(up, groundNormal);
      const s = _axis.length();
      const angle = Math.atan2(s, up.dot(groundNormal));
      if (s > 1e-6 && angle < 1.2) {
        _axis.divideScalar(s);
        _dq.setFromAxisAngle(_axis, angle * (1 - Math.exp(-CONTACT.levelRate * dt)));
        this.quat.premultiply(_dq).normalize();
      }
      this.omega.multiplyScalar(Math.exp(-CONTACT.groundSpinDamping * dt));
    }
  }

  crash(speed) {
    this.crashed = { speed };
    this.armed = false;
    this.vel.set(0, 0, 0);
    this.omega.set(0, 0, 0);
    this.thrust = 0;
    this.motor = 0;
  }

  /** Interpolated render pose. */
  renderPose(alpha, outPos, outQuat) {
    outPos.lerpVectors(this.prevPos, this.pos, alpha);
    outQuat.slerpQuaternions(this.prevQuat, this.quat, alpha);
  }
}
