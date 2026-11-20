// Bootstrap and main loop.
import * as THREE from 'three';
import { SIM, PRESETS, ARM, CAMERA, WORLD, INPUT, DRONE_SIZE_BASE } from './config.js';
import { loadExerciseBests, loadRaceBests, loadSettings, saveExerciseBests, saveRaceBests, saveSettings } from './storage.js';
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
import { createGhostModel, createRaceCourse } from './world/race-course.js';
import { RACE_GATES, createGhostRecorder, createRace, ghostPose } from './race/race.js';
import { createEightExercise, createHoverExercise, createLandingExercise } from './race/exercises.js';
import { createExerciseArea } from './world/exercise-area.js';
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
const raceCourse = createRaceCourse(scene, collision);
const trees = createTrees(scene, collision, [...course.keepOut, ...raceCourse.keepOut]);
const race = createRace(RACE_GATES, terrainHeight);
const ghostRecorder = createGhostRecorder();
const ghost = createGhostModel();
scene.add(ghost);
const raceBests = loadRaceBests();
const exerciseArea = createExerciseArea(scene, collision);
const hoverExercise = createHoverExercise();
const landingExercise = createLandingExercise();
const eightExercise = createEightExercise(terrainHeight);
const exerciseBests = loadExerciseBests();
const lastRacePos = new THREE.Vector3();

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
  race.reset();
  eightExercise.reset();
  lastRacePos.copy(quad.pos);
  stepper.reset();
  keyboard.throttle = 0;
  keyboard.usedThrottle = false;
}

const formatSeconds = (seconds) => `${seconds.toFixed(1)} s`;

function exerciseBest(field) {
  return exerciseBests[settings.preset]?.[field];
}

function recordExercise(field, value, better) {
  const current = exerciseBest(field);
  if (!Number.isFinite(current) || better(value, current)) {
    exerciseBests[settings.preset] = { ...exerciseBests[settings.preset], [field]: +value.toFixed(2) };
    saveExerciseBests(exerciseBests);
    return true;
  }
  return false;
}

function updateExercises(dt) {
  const ground = terrainHeight(quad.pos.x, quad.pos.z);
  const flying = {
    pos: quad.pos, vel: quad.vel, heading: quad.heading, pilot: rig.pilot, armed: quad.armed,
    crashed: !!quad.crashed, grounded: quad.grounded, ground, from: lastRacePos, to: quad.pos,
  };
  const hover = hoverExercise.update(dt, flying);
  if (hover && hover.seconds >= 1) {
    const record = recordExercise('hover', hover.seconds, (a, b) => a > b);
    toasts.show(`Nose-in hover ${formatSeconds(hover.seconds)}${record ? ' · new best!' : ''}`, 2500);
  }
  const landed = landingExercise.update(dt, flying);
  if (landed) {
    const record = landed.points > 0 && recordExercise('landing', landed.points, (a, b) => a > b);
    toasts.show(`Landing ${landed.distance.toFixed(2)} m from the centre: ${landed.points} points${record ? ' · new best!' : ''}`, 3000);
  }
  const eight = eightExercise.update(dt, flying);
  if (eight) {
    const record = recordExercise('eight', eight.seconds, (a, b) => a < b);
    toasts.show(`Figure eight in ${formatSeconds(eight.seconds)}${record ? ' · new best!' : ''}`, 2500);
  }
  const { inside, noseIn, streak } = hoverExercise.state;
  exerciseArea.update(inside && noseIn);

  const best = (field, format) => (Number.isFinite(exerciseBest(field)) ? ` · best ${format(exerciseBest(field))}` : '');
  if (hoverExercise.active(quad.pos)) {
    const hint = inside && !noseIn ? ' · turn the nose to you' : '';
    return `NOSE-IN HOVER ${formatSeconds(streak)}${hint}${best('hover', formatSeconds)}`;
  }
  if (landingExercise.active(quad.pos)) return `PRECISION LANDING lift off and land on the target${best('landing', (p) => `${p} pts`)}`;
  if (eightExercise.active(quad.pos)) {
    const { started, time, next } = eightExercise.state;
    const step = ['through the middle (away from you)', 'round the right pole', 'through the middle', 'round the left pole'][next];
    return `FIGURE 8 ${started ? formatSeconds(time) : ''} next: ${step}${best('eight', formatSeconds)}`;
  }
  return '';
}

function updateRace(dt) {
  const exerciseText = updateExercises(dt);
  for (const event of race.update(dt, lastRacePos, quad.pos, !!quad.crashed)) {
    if (event.type === 'start') {
      ghostRecorder.start();
      toasts.show('Race started: fly the gates in order', 2000);
    }
    if (event.type === 'crash') toasts.show(`Race over: crashed (${event.points} points)`, 3000);
    if (event.type === 'lap') finishLap(event);
  }
  lastRacePos.copy(quad.pos);
  const { running, next, time, lapStart, points } = race.state;
  if (running) ghostRecorder.sample(dt, quad.pos, quad.heading);
  const best = raceBests[settings.preset];
  const pose = running && best ? ghostPose(best.ghost, time - lapStart) : null;
  ghost.visible = !!pose;
  if (pose) {
    ghost.position.set(pose.x, pose.y, pose.z);
    ghost.rotation.set(0, pose.heading, 0);
    ghost.scale.setScalar(preset().modelScale * drawSize());
  }
  raceCourse.update(elapsed, running ? next : 0);
  const start = RACE_GATES[0];
  const nearStart = Math.hypot(quad.pos.x - start.x, quad.pos.z - start.z) < 35;
  const bestText = best ? ` · best ${formatSeconds(best.lap)}` : '';
  if (running) hud.setChallenge(`RACE gate ${next === 0 ? 'FINISH' : `${next}/${race.gateCount - 1}`} · ${formatSeconds(time - lapStart)} · ${points} pts${bestText}`);
  else hud.setChallenge(exerciseText || (nearStart ? `RACE fly through START to begin${bestText}` : ''));
}

function finishLap(event) {
  const best = raceBests[settings.preset];
  const record = !best || event.lapSeconds < best.lap;
  toasts.show(`Lap ${formatSeconds(event.lapSeconds)} · ${event.points} points${record ? ' · new best!' : ''}`, 3500);
  if (record) {
    raceBests[settings.preset] = { lap: +event.lapSeconds.toFixed(2), points: event.points, ghost: [...ghostRecorder.samples] };
    saveRaceBests(raceBests);
  }
  ghostRecorder.start();
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
  if (!paused) updateRace(dt);

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
