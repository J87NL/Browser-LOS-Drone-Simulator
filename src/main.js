// Bootstrap and main loop.
import * as THREE from 'three';
import { SIM, PRESETS, ARM, CAMERA, WORLD, INPUT, DRONE_SIZE_BASE } from './config.js';
import { loadSettings, saveSettings } from './storage.js';
import { FixedStepper } from './physics/stepper.js';
import { Quad } from './physics/quad.js';
import { CollisionWorld } from './physics/colliders.js';
import { FLIGHT_MODE_LABELS, effectiveFlightMode, gpsClimb, shapeThrottle } from './physics/controls.js';
import { windAt } from './physics/wind.js';
import { terrainHeight } from './world/terrain-height.js';
import { createTerrain } from './world/terrain.js';
import { createDistantLand } from './world/distant.js';
import { createSky } from './world/sky.js';
import { createLights } from './world/lights.js';
import { createTrees } from './world/trees.js';
import { createCourse, PAD } from './world/course.js';
import { createCameraDroneModel } from './drone/camera-drone.js';
import { createDroneModel, modelLift } from './drone/model.js';
import { CameraRig, CAMERA_LABELS } from './cameras.js';
import { GamepadManager } from './input/gamepad.js';
import { controllerHint } from './input/browser-hint.js';
import { Keyboard } from './input/keyboard.js';
import { InputManager, shouldFailsafe } from './input/input.js';
import { ArmGesture, releaseStickLock } from './input/gesture.js';
import { MotorSound } from './audio.js';
import { Hud } from './ui/hud.js';
import { Toasts } from './ui/toast.js';
import { LosMarker } from './ui/marker.js';
import { DebugOverlay } from './ui/debug.js';
import { SettingsPanel } from './ui/settings.js';
import { CalibrationScreen } from './ui/calibration.js';

const params = new URLSearchParams(location.search);
// ?fps=20 throttles rendering to check that physics is frame-rate independent.
const maxFps = Number(params.get('fps')) || 0;

const settings = loadSettings();
const ui = document.getElementById('ui');

// --- Renderer, scene, camera ---------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app').append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 6000);

const { sky, sunDir } = createSky(renderer, scene);
const lights = createLights(scene, sunDir);
const terrain = createTerrain(renderer);
scene.add(terrain);
// Photo quality is loaded on first use, so its code is not in the main bundle.
let photo = null;
let photoLoading = null;
function getPhoto() {
  photoLoading ??= import('./photo.js').then(({ createPhotoMode }) => {
    photo = createPhotoMode({ renderer, scene, camera, sky, sunDir, lights, terrain });
    resize();
    return photo;
  }).catch((error) => {
    photoLoading = null;
    throw error;
  });
  return photoLoading;
}
createDistantLand(scene);

const collision = new CollisionWorld(terrainHeight);
const course = createCourse(scene, collision);
const trees = createTrees(scene, collision, course.keepOut);

const droneModels = new Map();
let drone = null;

// --- Simulation -------------------------------------------------------------------
const preset = () => PRESETS[settings.preset];
const drawSize = () => settings.droneScale * DRONE_SIZE_BASE;
function useDroneModel() {
  const p = preset();
  const key = p.model === 'camera' ? `camera:${p.shell}` : 'fpv';
  if (!droneModels.has(key)) droneModels.set(key, p.model === 'camera' ? createCameraDroneModel({ shell: p.shell }) : createDroneModel());
  const next = droneModels.get(key);
  if (drone === next) return;
  if (drone) scene.remove(drone.root);
  drone = next;
  scene.add(drone.root);
}
useDroneModel();
const quad = new Quad(preset());
const stepper = new FixedStepper(SIM.physicsHz, SIM.maxFrameDt);
const padSpawn = () => new THREE.Vector3(PAD.x, PAD.top + preset().radius + 0.001, PAD.z);
quad.reset(padSpawn());
let flightMode = 'angle'; // beginners start in angle mode

const rig = new CameraRig(camera, terrainHeight);

// --- Input & UI --------------------------------------------------------------------
const gamepads = new GamepadManager();
const noControllerHint = controllerHint(navigator.userAgent, gamepads.supported);
const keyboard = new Keyboard(window);
const input = new InputManager(gamepads, keyboard);
const sound = new MotorSound();
const armGesture = new ArmGesture();
const hud = new Hud(ui);
const toasts = new Toasts(ui);
const marker = new LosMarker(ui);
const debug = new DebugOverlay(ui);

// New controllers that connected while the setup screen was already open.
const pendingSetup = [];
const calibration = new CalibrationScreen(ui, gamepads, {
  onClose: () => {
    const connected = new Set(gamepads.list().map((g) => g.id));
    while (pendingSetup.length) {
      const id = pendingSetup.shift();
      if (connected.has(id) && !gamepads.hasMapping(id)) {
        setTimeout(() => calibration.show(id), 0);
        break;
      }
    }
  },
  toast: (t) => toasts.show(t),
});
const settingsPanel = new SettingsPanel(ui, settings, {
  onChange: (key) => applySettings(key),
  onOpenCalibration: () => {
    settingsPanel.close();
    calibration.show();
  },
});

gamepads.addEventListener('connect', (e) => {
  toasts.show(`Controller connected: ${e.detail.id}`, 4000);
  if (!e.detail.firstTime) return;
  if (calibration.open) pendingSetup.push(e.detail.id);
  else {
    settingsPanel.close();
    calibration.show(e.detail.id);
  }
});
gamepads.addEventListener('disconnect', (e) => {
  // Failsafe: losing the controller mid-flight disarms instead of silently
  // dropping to keyboard throttle.
  const failsafe = shouldFailsafe(quad.armed, input.state, e.detail.key);
  if (failsafe) quad.armed = false;
  toasts.show(`Controller disconnected${failsafe ? ' (failsafe: disarmed)' : ''}: ${e.detail.id}`, 4000);
});

const photoWanted = () => settings.photoMode && !settings.lowQuality;
let photoRequest = 0;

function applySettings(key) {
  const all = key === 'all' || key === 'init';
  if (all || key === 'preset' || key === 'droneScale') quad.setDrawScale(drawSize());
  if (all || key === 'preset') {
    useDroneModel();
    quad.setParams(preset());
    resetDrone();
  }
  if (all || key === 'lowQuality' || key === 'photoMode') {
    const low = settings.lowQuality;
    const wantPhoto = photoWanted();
    const photoChanges = photo ? wantPhoto !== photo.enabled : wantPhoto || !!photoLoading;
    if (photoChanges) {
      const request = ++photoRequest;
      getPhoto().then((p) => p.setEnabled(photoWanted())).then((found) => {
        if (request !== photoRequest || !photo?.enabled || key === 'init') return; // switched off again meanwhile
        const missing = [!found.sky && 'sky', !found.ground && 'ground texture'].filter(Boolean);
        toasts.show(missing.length
          ? `Photo quality on (ambient occlusion, sharper shadows). Photo ${missing.join(' and ')} not installed: see docs/photo-assets.md`
          : 'Photo quality on', 4000);
      }).catch(() => toasts.show('Photo quality could not be loaded', 4000));
    }
    lights.setShadows(!low);
    trees.setShadows(!low);
    trees.setCount(low ? WORLD.treeCountLow : WORLD.treeCountHigh);
    resize();
  }
  if (all || key === 'showDebug') debug.setVisible(settings.showDebug);
  if (all || key === 'volume') sound.setVolume(settings.volume);
  saveSettings(settings);
}

function resetDrone() {
  quad.reset(padSpawn());
  stepper.reset();
  keyboard.throttle = 0;
  keyboard.usedThrottle = false;
}

function tryArm(rawThrottle, maxThrottle = ARM.maxThrottle) {
  if (quad.crashed) return toasts.show('Crashed: reset first (R)');
  if (quad.armed) return;
  if (rawThrottle > maxThrottle) return toasts.show('Throttle must be low to arm');
  quad.armed = true;
}

function handleEvent(ev, state) {
  switch (ev) {
    case 'armToggle':
      if (quad.armed) quad.armed = false;
      else tryArm(state.throttle);
      break;
    case 'arm':
      tryArm(state.throttle);
      break;
    case 'gestureArm': // stick command: its own (looser) throttle limit, see gesture.js
      tryArm(state.throttle, INPUT.stickArmThrottle);
      break;
    case 'disarm':
      quad.armed = false;
      break;
    case 'camera':
      rig.cycle();
      toasts.show(`Camera: ${CAMERA_LABELS[rig.mode]}`, 1200);
      break;
    case 'flightModeToggle':
      flightMode = flightMode === 'angle' ? 'acro' : 'angle';
      toasts.show(`Flight mode: ${FLIGHT_MODE_LABELS[effectiveFlightMode(flightMode, preset())]}`, 1200);
      break;
    case 'acro':
    case 'angle':
      flightMode = ev;
      toasts.show(`Flight mode: ${FLIGHT_MODE_LABELS[effectiveFlightMode(flightMode, preset())]}`, 1200);
      break;
    case 'reset':
      resetDrone();
      break;
    case 'pilot':
      rig.setPilotBehind(quad.pos, quad.heading);
      toasts.show('Pilot moved: 5 m behind the drone', 1500);
      break;
  }
}

window.addEventListener('keydown', (e) => {
  sound.unlock();
  if (e.code === 'Escape') {
    if (calibration.open) return; // handled by the calibration screen
    settingsPanel.toggle();
  } else if (e.code === 'Backquote' && !settingsPanel.open) {
    settings.showDebug = !settings.showDebug;
    applySettings('showDebug');
  }
});
window.addEventListener('pointerdown', () => sound.unlock());
document.addEventListener('visibilitychange', () => sound.setHidden(document.hidden));
function resize() {
  const pr = Math.min(devicePixelRatio, settings.lowQuality ? 1 : 2);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  photo?.setSize(innerWidth, innerHeight, Math.min(pr, 1));
}
window.addEventListener('resize', resize);
function watchPixelRatio() {
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => {
    resize();
    watchPixelRatio();
  }, { once: true });
}
watchPixelRatio();

applySettings('init');
camera.aspect = innerWidth / innerHeight;

// --- Loop ------------------------------------------------------------------------------
const renderPos = new THREE.Vector3();
const renderQuat = new THREE.Quaternion();
const cmd = { thrust: 0, roll: 0, pitch: 0, yaw: 0, mode: 'angle', rates: settings.rates, angleMaxTilt: settings.angleMaxTilt };
let last = performance.now();
let lastRender = 0;
let elapsed = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (maxFps > 0 && now - lastRender < 1000 / maxFps - 1) return;
  lastRender = now;
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  elapsed += dt;

  const paused = settingsPanel.open || calibration.open;
  input.enabled = !paused;
  const { state, events, pad } = input.update(dt);
  for (const ev of events) handleEvent(ev, state);
  // Stick command arming. Off while arming sits on a switch, so the switch
  // position always matches the armed state (like Betaflight).
  const armOnSwitch = pad?.mapping.buttons.arm?.type === 'axis';
  if (settings.stickArm && !paused && !armOnSwitch) {
    const g = armGesture.update(dt, state, { armed: quad.armed, grounded: quad.grounded });
    if (g) {
      handleEvent(g === 'arm' ? 'gestureArm' : 'disarm', state);
      if (g === 'arm' && !quad.armed) armGesture.sticksLocked = false; // arming was refused
      if (quad.armed === (g === 'arm')) {
        toasts.show(g === 'arm' ? 'Armed (stick command): release the sticks to centre' : 'Disarmed (stick command)', 2200);
      }
    }
  } else {
    // Gesture off (setting, switch arming, or paused): the lock must still be
    // able to end, otherwise the pilot could fly without attitude control.
    armGesture.reset();
    if (armGesture.sticksLocked && releaseStickLock(state, quad.armed)) armGesture.sticksLocked = false;
  }
  calibration.update();

  cmd.mode = effectiveFlightMode(flightMode, preset());
  cmd.climb = gpsClimb(state.throttle);
  cmd.rates = settings.rates;
  cmd.angleMaxTilt = settings.angleMaxTilt;
  const locked = armGesture.sticksLocked;
  cmd.roll = locked ? 0 : state.roll;
  cmd.pitch = locked ? 0 : state.pitch;
  cmd.yaw = locked ? 0 : state.yaw;
  cmd.thrust = shapeThrottle(state.throttle, {
    mode: cmd.mode,
    hoverAtCenter: settings.hoverAtCenter,
    throttleExpo: settings.throttleExpo,
    thrustToWeight: preset().thrustToWeight,
  });

  let steps = 0;
  let alpha = 1;
  if (!paused) {
    ({ steps, alpha } = stepper.advance(dt, (h) => {
      windAt(stepper.time, settings, quad.wind); // per physics step: frame-rate independent
      quad.step(h, cmd, collision);
    }));
  }
  quad.renderPose(alpha, renderPos, renderQuat);

  // Visuals
  // Visual size setting: scale the model and lift it so its feet sit on the
  // bottom of the collision sphere (world up, so an upside-down quad does
  // not sink into the ground either).
  const scale = preset().modelScale * drawSize();
  drone.root.scale.setScalar(scale);
  drone.root.quaternion.copy(renderQuat);
  drone.root.position.copy(renderPos);
  drone.root.position.y += modelLift(preset(), drawSize());
  rig.update(dt, renderPos, renderQuat, quad.heading, settings, scale, preset().modelScale, drone.root.position);
  const camDist = camera.position.distanceTo(renderPos);
  drone.update(quad.motor, paused ? 0 : dt, camDist, rig.mode === 'fpv');
  lights.follow(renderPos);
  course.update(elapsed, dt, quad.wind);
  trees.update(elapsed, quad.wind.length());
  sound.update(paused ? 0 : quad.motor, quad.armed && !paused, rig.mode === 'fpv' ? 1 : camDist);

  if (rig.mode === 'los' && settings.losMarker) {
    marker.update(camera, renderPos, camDist, CAMERA.losFarDistance, innerWidth, innerHeight);
  } else marker.hide();

  const ground = terrainHeight(quad.pos.x, quad.pos.z);
  hud.update({
    armed: quad.armed,
    mode: cmd.mode,
    camera: rig.mode,
    throttle: state.throttle,
    speed: quad.vel.length(),
    altitude: Math.max(0, quad.pos.y - preset().radius - ground),
    crashed: quad.crashed,
    source: state.source === 'gamepad' ? `🎮 ${state.gamepadId}` : '⌨ keyboard',
    hint: state.source === 'gamepad' ? '' : noControllerHint,
    paused,
    armProgress: armGesture.progress,
    sticksLocked: armGesture.sticksLocked,
    wind: quad.wind,
  });
  debug.update(dt, { steps, simTime: stepper.time, input: state, thrust: cmd.thrust, quad, pad });

  if (photo?.enabled) photo.render(dt, elapsed, camera.position, quad.wind.length());
  else renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Handy for poking around in the console.
window.__sim = { quad, settings, rig, gamepads, renderer, scene };
