// Hand-written quadcopter dynamics. three.js axes: +Y up, body forward is -Z,
// body right is +X. Angular velocity is stored in the body frame.
//   roll right  = negative rotation about body +Z
//   pitch down  = negative rotation about body +X (stick forward)
//   yaw right   = negative rotation about body +Y
import { Vector3, Quaternion } from 'three';
import { GRAVITY, CONTACT, ANGLE_MODE, GPS, MOTOR, PROBES } from '../config.js';
import { actualRateRad } from './rates.js';

const UP = new Vector3(0, 1, 0);

// Scratch objects (the step runs 500 times a second, avoid allocation).
const _up = new Vector3();
const _force = new Vector3();
const _vH = new Vector3();
const _vRel = new Vector3();
const _axis = new Vector3();
const _dq = new Quaternion();
const _qInv = new Quaternion();
const _qDes = new Quaternion();
const _qYaw = new Quaternion();
const _upDes = new Vector3();
const _tiltAxis = new Vector3();
const _yawW = new Vector3();
const _tan = new Vector3();
const _rW = new Vector3();
const _probe = new Vector3();
const _gn = new Vector3();
const _wW = new Vector3();
const _vP = new Vector3();
const _tmp = new Vector3();
const _gpsForce = new Vector3();
const _vTarget = new Vector3();

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
    this.wind = new Vector3(); // m/s, world frame; set by the caller
    this.gpsIntegral = new Vector3();
    this.gpsHold = null;
    this.drawScale = 1;
    this.setDrawScale(1);
  }

  get maxThrust() {
    return this.params.mass * GRAVITY * this.params.thrustToWeight;
  }

  setParams(params) {
    this.params = params;
    this.setDrawScale(this.drawScale);
  }

  /**
   * Place the motor collision probes for the drawn size (1 = real size).
   * The model is drawn lifted so its feet rest on the centre sphere's bottom;
   * the probes use the same lift.
   */
  setDrawScale(droneSize = 1) {
    this.drawScale = droneSize;
    const p = this.params;
    const s = p.modelScale * droneSize;
    const lift = PROBES.feetDepth * s - p.radius;
    const m = PROBES.motor * s;
    const probes = [];
    const add = (x, y, z, r) => probes.push({ offset: new Vector3(x, y + lift, z), radius: r });
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      add(sx * m, PROBES.motorY * s, sz * m, PROBES.motorRadius * s);
      // Four spheres around the prop rim, so the whole disc collides.
      const rim = PROBES.propRim * s;
      for (const [dx, dz] of [[rim, 0], [-rim, 0], [0, rim], [0, -rim]]) {
        add(sx * m + dx, PROBES.propY * s, sz * m + dz, PROBES.propRimRadius * s);
      }
    }
    add(0, PROBES.bodyY * s, PROBES.bodyZ * s, PROBES.bodyRadius * s);
    add(0, PROBES.bodyY * s, -PROBES.bodyZ * s, PROBES.bodyRadius * s);
    this.probes = probes;
    this.inertia = p.mass * (PROBES.inertiaK * s) ** 2;
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
    this.gpsIntegral.set(0, 0, 0);
    this.gpsHold = null;
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
   * @param {{thrust:number, roll:number, pitch:number, yaw:number, mode:'angle'|'acro'|'gps', rates:object, angleMaxTilt?:number, climb?:number}} cmd
   *   thrust is the shaped 0..1 thrust fraction, sticks are -1..1, climb is the -1..1 throttle stick in GPS mode.
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
    // Like a real quad without air mode: sitting on the ground with less
    // thrust than it takes to lift off, the sticks do not spin it.
    const gps = cmd.mode === 'gps';
    const thrustCommand = gps ? this._gpsThrust(cmd, dt) : cmd.thrust;
    const idleOnGround = this.grounded && thrustCommand * p.thrustToWeight < CONTACT.groundIdleLift;
    if (this.armed && idleOnGround) {
      t.set(0, 0, 0);
      this.gpsIntegral.set(0, 0, 0);
      this.gpsHold = null;
      this.omega.multiplyScalar(Math.exp(-dt * CONTACT.groundSpinDamping));
    } else if (this.armed) {
      if (cmd.mode === 'acro') {
        t.set(
          -actualRateRad(cmd.pitch, cmd.rates.pitch),
          -actualRateRad(cmd.yaw, cmd.rates.yaw),
          -actualRateRad(cmd.roll, cmd.rates.roll),
        );
      } else if (gps) {
        _upDes.copy(_gpsForce).normalize();
        this._steerUpTo(cmd, t);
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
    const desired = this.armed ? Math.min(1, Math.max(0, thrustCommand)) * this.maxThrust : 0;
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
    // Drag works on the velocity relative to the air. A quad resting on the
    // ground is held by its feet, so wind does not slide it around.
    _vRel.copy(this.vel);
    if (!this.grounded) _vRel.sub(this.wind);
    const vUp = _vRel.dot(up);
    _vH.copy(_vRel).addScaledVector(up, -vUp);
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

  /**
   * GPS mode: the sticks set a ground speed (and the throttle stick a climb
   * rate) instead of a tilt. Centred sticks hold the position, also in wind.
   * Leaves the wanted force in `_gpsForce` and returns the thrust fraction.
   */
  _gpsThrust(cmd, dt) {
    const p = this.params;
    const deadband = (v) => (Math.abs(v) < GPS.stickDeadband ? 0 : v);
    const pitch = deadband(cmd.pitch);
    const roll = deadband(cmd.roll);
    const climb = deadband(cmd.climb ?? 0);
    const h = this.heading;
    _vTarget.set(
      -Math.sin(h) * pitch * GPS.maxSpeed + Math.cos(h) * roll * GPS.maxSpeed,
      climb * (climb > 0 ? GPS.climbRate : GPS.descentRate),
      -Math.cos(h) * pitch * GPS.maxSpeed - Math.sin(h) * roll * GPS.maxSpeed,
    );
    const centred = pitch === 0 && roll === 0;
    if (!centred) this.gpsHold = null;
    if (centred && !this.gpsHold && Math.hypot(this.vel.x, this.vel.z) < 1) this.gpsHold = this.pos.clone();
    if (this.gpsHold) {
      _vTarget.x += (this.gpsHold.x - this.pos.x) * GPS.positionGain;
      _vTarget.z += (this.gpsHold.z - this.pos.z) * GPS.positionGain;
    }

    _tmp.set(_vTarget.x - this.vel.x, 0, _vTarget.z - this.vel.z);
    this.gpsIntegral.addScaledVector(_tmp, GPS.integralGain * dt);
    const i = this.gpsIntegral.length();
    if (i > GPS.integralLimit) this.gpsIntegral.multiplyScalar(GPS.integralLimit / i);

    _vRel.copy(this.vel).sub(this.wind).setY(0);
    const air = _vRel.length();
    _gpsForce.copy(_tmp).multiplyScalar(GPS.velocityGain).add(this.gpsIntegral).multiplyScalar(p.mass);
    _gpsForce.addScaledVector(_vRel, p.dragLinH + p.dragQuadH * air);
    const maxTilt = ((cmd.angleMaxTilt ?? p.angleMaxTilt) * Math.PI) / 180;
    const vz = this.vel.y - this.wind.y;
    const verticalDrag = p.dragLinV * vz + p.dragQuadV * Math.abs(vz) * vz;
    const vertical = p.mass * (GRAVITY + (_vTarget.y - this.vel.y) * GPS.verticalGain) + verticalDrag;
    const lift = Math.max(p.mass * GRAVITY * 0.3, vertical);
    const horizontal = Math.hypot(_gpsForce.x, _gpsForce.z);
    const maxHorizontal = lift * Math.tan(maxTilt);
    if (horizontal > maxHorizontal) _gpsForce.multiplyScalar(maxHorizontal / horizontal);
    _gpsForce.y = lift;

    if (this.grounded && climb <= 0) return 0;
    const thrust = Math.max(0, _gpsForce.dot(this.up(_up)));
    return thrust / this.maxThrust;
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
    this._steerUpTo(cmd, t);
  }

  /** Rate targets that turn the body up axis towards `_upDes`, plus the yaw stick about world up. */
  _steerUpTo(cmd, t) {
    const p = this.params;
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
    let groundNormal = null;
    // Centre sphere first, then the motor probes (arms and props).
    for (let k = -1; k < this.probes.length; k++) {
      let contacts;
      let r = null;
      if (k < 0) contacts = world.contacts(this.pos, p.radius);
      else {
        r = _rW.copy(this.probes[k].offset).applyQuaternion(this.quat);
        contacts = world.contacts(_probe.copy(this.pos).add(r), this.probes[k].radius);
      }
      for (const c of contacts) {
        if (this._resolveContact(c, r, dt)) return; // crashed
        this.lastContactProbe = k; // -1 = centre sphere
        if (c.normal.y > 0.6) {
          this.grounded = true;
          groundNormal = _gn.copy(c.normal);
        }
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

  /**
   * Resolve one contact at offset `r` from the centre (world frame; null for
   * the centre sphere). Returns true when the impact is a crash.
   */
  _resolveContact(c, r, dt) {
    const p = this.params;
    const n = c.normal;
    this.pos.addScaledVector(n, c.depth);
    // Velocity of the contact point: v + w x r.
    _wW.copy(this.omega).applyQuaternion(this.quat);
    _vP.copy(this.vel);
    if (r) _vP.add(_tmp.crossVectors(_wW, r));
    const vn = _vP.dot(n);
    if (vn < 0) {
      const impact = -vn;
      this.lastImpact = impact;
      // Landing surfaces (ground, pad, tops of things) forgive a firm touchdown
      // and sliding along them. Hitting the side or underside of an obstacle
      // crashes at a much lower speed, and there the full speed counts, so
      // scraping along a post at speed is a crash too.
      const landing = c.landing;
      const severity = landing ? impact : _vP.length();
      const limit = landing ? p.crashSpeed : (p.obstacleCrashSpeed ?? p.crashSpeed);
      if (severity > limit) {
        this.crash(severity);
        return true;
      }
      // Props and arms flex and soak up a hit, so probe contacts do not bounce.
      const e = !r && impact > CONTACT.restingSpeed ? p.restitution : 0;
      // Impulse with the effective mass at the contact point.
      let denom = 1 / p.mass;
      if (r) {
        _tmp.crossVectors(r, n);
        denom += _tmp.lengthSq() / this.inertia;
      }
      const j = (-(1 + e) * vn) / denom;
      this.vel.addScaledVector(n, j / p.mass);
      if (r) {
        // r x n is still in _tmp: angular impulse, world -> body.
        _qInv.copy(this.quat).invert();
        this.omega.add(_tmp.multiplyScalar((j / this.inertia) * PROBES.spinTransfer).applyQuaternion(_qInv));
      }
    }
    // Tangential friction, and the spin it takes out by gripping the surface.
    const vn2 = this.vel.dot(n);
    _tan.copy(this.vel).addScaledVector(n, -vn2);
    this.vel.addScaledVector(_tan, -(1 - Math.exp(-CONTACT.friction * dt)));
    this.omega.multiplyScalar(Math.exp(-CONTACT.contactSpinDamping * dt));
    return false;
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
