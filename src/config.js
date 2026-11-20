// All tuning constants live here so the flight feel can be tweaked in one place.
// Units: metres, seconds, kilograms, newtons, degrees (where noted).

export const GRAVITY = 9.81;

export const SIM = {
  physicsHz: 500,
  // Cap on frame time fed into the accumulator, avoids the spiral of death
  // after a tab switch or a long GC pause.
  maxFrameDt: 0.1,
};

// Betaflight "actual rates": center sensitivity and max rate in deg/s, expo 0..1.
export const DEFAULT_RATES = {
  roll: { center: 200, max: 670, expo: 0.0 },
  pitch: { center: 200, max: 670, expo: 0.0 },
  yaw: { center: 200, max: 500, expo: 0.0 },
};

// Physics presets. Selecting one in the settings panel also loads its rates.
export const PRESETS = {
  beginner: {
    label: 'Beginner',
    mass: 0.6,
    thrustToWeight: 3.0,
    motorTau: 0.03, // s, thrust spool-up lag
    rateTau: 0.045, // s, angular velocity response (stands in for a tuned PID)
    dragLinH: 0.12, // N per m/s, horizontal (body plane)
    dragQuadH: 0.035, // N per (m/s)^2
    dragLinV: 0.3, // along body up axis
    dragQuadV: 0.06,
    angleMaxTilt: 40, // deg
    angleGain: 7, // 1/s, attitude error to rate
    radius: 0.07, // collision sphere radius
    crashSpeed: 6.5, // m/s: landing/ground impact (speed into the surface) that counts as a crash
    obstacleCrashSpeed: 2.5, // m/s: hitting the side of an obstacle at this speed (incl. scraping) is a crash
    restitution: 0.25,
    modelScale: 1,
    rates: {
      roll: { center: 120, max: 400, expo: 0.2 },
      pitch: { center: 120, max: 400, expo: 0.2 },
      yaw: { center: 120, max: 300, expo: 0.1 },
    },
  },
  freestyle5: {
    label: '5" freestyle',
    mass: 0.6,
    thrustToWeight: 4.0,
    motorTau: 0.02,
    rateTau: 0.03,
    dragLinH: 0.05,
    dragQuadH: 0.022,
    dragLinV: 0.2,
    dragQuadV: 0.045,
    angleMaxTilt: 55,
    angleGain: 9,
    radius: 0.07,
    crashSpeed: 7,
    obstacleCrashSpeed: 3,
    restitution: 0.25,
    modelScale: 1,
    rates: DEFAULT_RATES,
  },
  whoop: {
    label: 'Tiny whoop',
    mass: 0.03,
    thrustToWeight: 2.6,
    motorTau: 0.025,
    rateTau: 0.04,
    dragLinH: 0.006,
    dragQuadH: 0.0035,
    dragLinV: 0.012,
    dragQuadV: 0.006,
    angleMaxTilt: 45,
    angleGain: 8,
    radius: 0.035,
    crashSpeed: 9, // whoops bounce off almost everything
    obstacleCrashSpeed: 5, // ducted props survive light knocks
    restitution: 0.35,
    modelScale: 0.42,
    rates: {
      roll: { center: 180, max: 600, expo: 0.1 },
      pitch: { center: 180, max: 600, expo: 0.1 },
      yaw: { center: 160, max: 450, expo: 0.0 },
    },
  },
};

export const DEFAULT_PRESET = 'freestyle5';

export const CONTACT = {
  friction: 6, // 1/s, tangential velocity damping while touching a surface
  restingSpeed: 0.5, // below this normal speed a contact does not bounce
  levelRate: 6, // 1/s, how fast a grounded, idle quad settles flat
  levelBelowWeight: 0.8, // settle flat only while thrust < this fraction of weight
  groundSpinDamping: 25, // 1/s, angular velocity damping while settling
  contactSpinDamping: 40, // 1/s, spin lost per contact while touching a surface
  groundIdleLift: 0.5, // on the ground, sticks only act once thrust > this fraction of weight
  tumbleDamping: 1.5, // 1/s, angular damping of a disarmed quad in the air
};

// Extra collision spheres at the motors (props), in model units of the drawn
// quad. They scale with the drawn size, so a bigger drone also collides with
// its arms and props, not only with the sphere around its centre.
export const PROBES = {
  motor: 0.078, // motor offset on X and Z
  motorY: -0.03, // motor centre height relative to the model origin
  motorRadius: 0.022, // the motor itself
  propY: -0.019, // prop plane height relative to the model origin
  propRim: 0.042, // rim probes sit this far from the motor axis...
  propRimRadius: 0.024, // ...with this radius, together covering the 0.0635 prop disc
  bodyZ: 0.045, // two body probes (camera end, antenna end)
  bodyY: -0.01,
  bodyRadius: 0.03,
  feetDepth: 0.07, // feet below the model origin (see drone/model.js)
  inertiaK: 0.08, // radius of gyration, for the spin a prop strike causes
  spinTransfer: 0.4, // fraction of the rigid-body spin a hit causes (props and frame flex)
};

export const ANGLE_MODE = {
  maxRate: 12, // rad/s, cap on the self-levelling rate
};

export const MOTOR = {
  idle: 0.08, // visual/sound motor output when armed at zero throttle
};

export const ARM = {
  maxThrottle: 0.05, // raw throttle stick must be below this to arm
};

export const CAMERA = {
  pilotEyeHeight: 1.7,
  pilotBehind: 5, // "pilot here" stands this far behind the drone
  losZoomSmoothing: 5, // 1/s
  pilotStart: [0, 0, 6], // x, (ground), z: a few metres behind the launch pad
  losLookSmoothing: 14, // 1/s
  losZoomK: 2.5, // fov = 2*atan(K / distance), clamped below
  losMinFov: 25,
  losMaxFov: 70,
  losFixedFov: 60,
  losFarDistance: 45, // show the marker beyond this distance
  chaseDistance: 2.6,
  chaseHeight: 0.9,
  chaseFov: 75,
  chaseYawLag: 4, // 1/s
  chasePosLag: 8, // 1/s
  fpvUptilt: 25,
  fpvMount: [0, 0.02, -0.05], // model coords: above the front of the frame
  fpvMountPropsInView: [0, -0.01, -0.042], // lower, just in front of the battery: front props show in the lower corners
  fpvFov: 110, // horizontal degrees
};

export const INPUT = {
  deadzone: 0.03,
  switchThreshold: 0.5,
  stickArmHold: 1.5, // s, hold both sticks in the bottom corners to arm (DJI style)
  stickArmThreshold: 0.6, // yaw/pitch/roll past this (round gamepad gates reach ~0.7 diagonally)
  stickArmThrottle: 0.2, // throttle below this (a round-gated diagonal reads ~0.12)
  stickArmRelease: 0.15, // after arming, yaw/pitch/roll stay locked until all are within this of centre
  stickArmUnlockThrottle: 0.3, // ...or until throttle goes above this
  padTakeover: 0.08, // pad throttle must move this far to take over from the keyboard
  keyboardRamp: 5, // stick units per second for keyboard sticks
  keyboardThrottleRate: 0.6, // throttle units per second while W/S held
};

export const WORLD = {
  size: 900, // terrain edge length
  segments: 220,
  flatRadius: 70, // perfectly flat around the pad
  hillStart: 170, // hills begin to rise here
  hillHeight: 38,
  treeCountHigh: 700,
  treeCountLow: 220,
  seed: 1337,
};

export const DRONE_SIZE_BASE = 2.5;

export const DEFAULT_SETTINGS = {
  preset: DEFAULT_PRESET,
  rates: structuredClone(DEFAULT_RATES),
  throttleExpo: 0.0,
  hoverAtCenter: true, // angle mode: throttle stick center = hover
  stickArm: true, // arm/disarm by holding both sticks in the bottom corners
  angleMaxTilt: PRESETS[DEFAULT_PRESET].angleMaxTilt,
  fpvUptilt: CAMERA.fpvUptilt,
  fpvFov: CAMERA.fpvFov,
  fpvPropsInView: false,
  losAutoZoom: true,
  losMarker: true,
  droneScale: 1, // drawn size; collisions follow it, flight physics do not
  windSpeed: 0, // m/s, 0 = calm
  windFrom: 90, // degrees clockwise from straight ahead of the pilot: 90 = crosswind from the right
  windGusts: 0.4, // 0 = steady, 1 = very gusty
  lowQuality: false,
  photoMode: false, // real sky + ground photo (if installed), ambient occlusion, sharper shadows
  volume: 0, // muted by default
  showDebug: false,
};

// Allowed ranges, shared by the settings panel and the storage loader.
export const SETTING_RANGES = {
  throttleExpo: [0, 1],
  angleMaxTilt: [10, 80],
  fpvUptilt: [-10, 60],
  fpvFov: [60, 150],
  volume: [0, 1],
  droneScale: [0.3, 8],
  windSpeed: [0, 15],
  windFrom: [0, 359],
  windGusts: [0, 1],
  rate: [0, 2000], // deg/s, center and max
  rateExpo: [0, 1],
};
