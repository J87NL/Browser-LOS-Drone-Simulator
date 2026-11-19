// Bootstrap and main loop.
import * as THREE from 'three';
import { SIM, PRESETS, ARM, CAMERA, WORLD } from './config.js';
import { loadSettings, saveSettings } from './storage.js';
import { FixedStepper } from './physics/stepper.js';
import { Quad } from './physics/quad.js';
import { CollisionWorld } from './physics/colliders.js';
import { shapeThrottle } from './physics/controls.js';
import { terrainHeight } from './world/terrain-height.js';
import { createTerrain } from './world/terrain.js';
import { createSky } from './world/sky.js';
import { createLights } from './world/lights.js';
import { createTrees } from './world/trees.js';
import { createCourse, PAD } from './world/course.js';
import { createDroneModel } from './drone/model.js';
import { CameraRig, CAMERA_LABELS } from './cameras.js';
import { GamepadManager } from './input/gamepad.js';
import { Keyboard } from './input/keyboard.js';
import { InputManager } from './input/input.js';
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

const { sunDir } = createSky(renderer, scene);
const lights = createLights(scene, sunDir);
scene.add(createTerrain(renderer));

const collision = new CollisionWorld(terrainHeight);
const course = createCourse(scene, collision);
const trees = createTrees(scene, collision, course.keepOut);

const drone = createDroneModel();
scene.add(drone.root);

// --- Simulation -------------------------------------------------------------------
const preset = () => PRESETS[settings.preset];
const quad = new Quad(preset());
const stepper = new FixedStepper(SIM.physicsHz, SIM.maxFrameDt);
const padSpawn = () => new THREE.Vector3(PAD.x, PAD.top + preset().radius + 0.001, PAD.z);
quad.reset(padSpawn());
let flightMode = 'angle'; // beginners start in angle mode

const rig = new CameraRig(camera, terrainHeight);

// --- Input & UI --------------------------------------------------------------------
const gamepads = new GamepadManager();
const keyboard = new Keyboard(window);
const input = new InputManager(gamepads, keyboard);
const sound = new MotorSound();
const hud = new Hud(ui);
const toasts = new Toasts(ui);
const marker = new LosMarker(ui);
const debug = new DebugOverlay(ui);

const calibration = new CalibrationScreen(ui, gamepads, {
  onClose: () => {},
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
  if (e.detail.firstTime && !calibration.open) {
    settingsPanel.close();
    calibration.show(e.detail.id);
  }
});
gamepads.addEventListener('disconnect', (e) => toasts.show(`Controller disconnected: ${e.detail.id}`, 4000));

function applySettings(key) {
  if (key === 'preset' || key === 'all') {
    quad.setParams(preset());
    drone.root.scale.setScalar(preset().modelScale);
    resetDrone();
  }
  const low = settings.lowQuality;
  lights.setShadows(!low);
  trees.setShadows(!low);
  trees.setCount(low ? WORLD.treeCountLow : WORLD.treeCountHigh);
  renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1 : 2));
  renderer.setSize(innerWidth, innerHeight);
  debug.setVisible(settings.showDebug);
  sound.setVolume(settings.volume);
  saveSettings(settings);
}

function resetDrone() {
  quad.reset(padSpawn());
  stepper.reset();
  keyboard.throttle = 0;
  keyboard.usedThrottle = false;
}

function tryArm(rawThrottle) {
  if (quad.crashed) return toasts.show('Crashed: reset first (R)');
  if (quad.armed) return;
  if (rawThrottle > ARM.maxThrottle) return toasts.show('Throttle must be low to arm');
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
    case 'disarm':
      quad.armed = false;
      break;
    case 'camera':
      rig.cycle();
      toasts.show(`Camera: ${CAMERA_LABELS[rig.mode]}`, 1200);
      break;
    case 'flightModeToggle':
      flightMode = flightMode === 'angle' ? 'acro' : 'angle';
      toasts.show(`Flight mode: ${flightMode.toUpperCase()}`, 1200);
      break;
    case 'acro':
    case 'angle':
      flightMode = ev;
      toasts.show(`Flight mode: ${flightMode.toUpperCase()}`, 1200);
      break;
    case 'reset':
      resetDrone();
      break;
    case 'pilot':
      rig.setPilot(quad.pos.x, quad.pos.z);
      toasts.show('Pilot position set here', 1500);
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
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

applySettings('preset');
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
  calibration.update();

  cmd.mode = flightMode;
  cmd.rates = settings.rates;
  cmd.angleMaxTilt = settings.angleMaxTilt;
  cmd.roll = state.roll;
  cmd.pitch = state.pitch;
  cmd.yaw = state.yaw;
  cmd.thrust = shapeThrottle(state.throttle, {
    mode: flightMode,
    hoverAtCenter: settings.hoverAtCenter,
    throttleExpo: settings.throttleExpo,
    thrustToWeight: preset().thrustToWeight,
  });

  let steps = 0;
  let alpha = 1;
  if (!paused) {
    ({ steps, alpha } = stepper.advance(dt, (h) => quad.step(h, cmd, collision)));
  }
  quad.renderPose(alpha, renderPos, renderQuat);

  // Visuals
  drone.root.position.copy(renderPos);
  drone.root.quaternion.copy(renderQuat);
  const scale = preset().modelScale;
  rig.update(dt, renderPos, renderQuat, quad.heading, settings, scale);
  const camDist = camera.position.distanceTo(renderPos);
  drone.update(quad.motor, paused ? 0 : dt, camDist, rig.mode === 'fpv');
  lights.follow(renderPos);
  course.update(elapsed);
  sound.update(paused ? 0 : quad.motor, quad.armed && !paused, rig.mode === 'fpv' ? 1 : camDist);

  if (rig.mode === 'los' && settings.losMarker) {
    marker.update(camera, renderPos, camDist, CAMERA.losFarDistance, innerWidth, innerHeight);
  } else marker.hide();

  const ground = terrainHeight(quad.pos.x, quad.pos.z);
  hud.update({
    armed: quad.armed,
    mode: flightMode,
    camera: rig.mode,
    throttle: state.throttle,
    speed: quad.vel.length(),
    altitude: Math.max(0, quad.pos.y - preset().radius - ground),
    crashed: quad.crashed,
    source: state.source === 'gamepad' ? `🎮 ${state.gamepadId}` : '⌨ keyboard',
    paused,
  });
  debug.update(dt, { steps, simTime: stepper.time, input: state, thrust: cmd.thrust, quad, pad });

  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Handy for poking around in the console.
window.__sim = { quad, settings, rig, gamepads, renderer, scene };
