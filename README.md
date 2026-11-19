# LOS Drone Simulator

A browser quadcopter simulator for flying **line of sight** (LOS): you stand on the field and watch
the quad with your own eyes, the way you learn on a real one. Chase and FPV cameras are there too.
It works with a USB gamepad, an RC transmitter (EdgeTX/OpenTX in USB joystick mode) or the keyboard.

Vite, vanilla JavaScript and three.js. The flight model is written by hand (no physics engine) and
runs at a fixed 500 Hz, independent of the frame rate.

## Running it

Needs Node 20.19+ (or 22.12+).

```bash
npm install
```

```bash
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). Chromium/Chrome is the main target;
Firefox works too.

```bash
npm run build
```

The build goes to `public/`: a static site with relative paths (`index.html` plus `assets/`), so it
works from any folder on any static host (`npm run preview` serves it locally). See [Deploying](#deploying).

Checks: `npm test` (Vitest unit tests) and `npm run lint` (ESLint).

The repo has an `.npmrc` with `legacy-peer-deps=true`. Without it, npm 10.9 crashed during
`npm install` with "Cannot read properties of null (reading 'edgesOut')" while resolving Vite's
optional peer dependencies.

## Controls

| Action | Keyboard | Gamepad (standard layout, default) |
| --- | --- | --- |
| Throttle | W / S (stays where you leave it) | left stick up/down (mode 2) |
| Yaw | A / D | left stick left/right |
| Pitch / roll | arrow keys | right stick |
| Arm / disarm | Space | A / Cross |
| Camera mode (LOS → chase → FPV) | C | Y / Triangle |
| Flight mode (angle ↔ acro) | M | X / Square |
| Reset to the launch pad | R | B / Circle |
| Move the pilot to 5 m behind the drone | P | right bumper |
| Settings | Esc | |
| Debug overlay | ` (backquote) | |

- With a controller connected you can still use W/S: the throttle that moved last wins. A clear move
  of the controller throttle (not stick jitter) takes it back, continuing from its position.
- **Stick command arming (DJI style):** hold both sticks in the bottom corners for 1.5 s, both
  outward or both inward (throttle down, pitch back, yaw and roll to opposite sides). The HUD shows
  the progress. The same gesture disarms, but only while the quad is on the ground. It works in every
  stick mode and with round-gated gamepad sticks (push them into the diagonals). It is off while arming
  is mapped to a switch, so the switch always matches the armed state. Turn it off in Settings; the
  hold time and thresholds are in `INPUT` in `src/config.js`.
- **Arming** needs the throttle low (below 5%). A self-centring gamepad throttle rests at 50%,
  so hold the stick down while you press arm.
- You start in **angle mode** (self-levelling, max tilt 55° on the 5" preset). With "throttle stick
  centers" on (default), mid throttle is hover in angle mode, which makes take-off and landing on the
  pad easy. Acro mode always uses the full throttle range.
- The front of the quad has **orange props and green LEDs**, the back has dark props and red LEDs.
  In LOS you normally start with the tail towards you.
- A hard impact (above about 7 m/s into a surface on the 5" preset) is a crash; press reset to go
  back to the pad. Softer hits bounce.

### Cameras

- **LOS** (default): you stand 1.7 m tall a few metres behind the pad and look at the quad.
  Auto-zoom narrows the field of view (70° to 25°) as it flies away, so it stays visible. When the
  quad is far away a ring with its distance is drawn around it; if it gets off screen an arrow points
  to it. Press P (or the mapped button) to walk over: you then stand 5 m behind the quad, looking at its tail.
- **Chase**: behind and above, follows yaw with some lag but not roll or pitch.
- **FPV**: on the quad, uptilt 25° and 110° horizontal FOV by default (both in Settings). The option
  "FPV: front props in view" mounts the camera lower and further back, so the inner part of the front
  props shows in the lower corners, as on many real builds. That works at low to normal uptilt
  (around 25°); at high uptilt the props drop out of the picture, as they would on a real quad.

The drone is drawn 1.5× its real size by default so it is easier to see in LOS. Settings → "Drone
size" changes this between 1× and 3×. Flight physics (mass, thrust, drag) keep the real size, but
collisions follow the drawn size: spheres at the motors, around the prop discs and at both ends of
the body make the arms and props of a bigger drone hit the ground and obstacles too, and a hard prop
strike is a crash. (The sphere at the centre, which the drone rests on, keeps its real size.)

## Controller setup and calibration

The setup screen opens by itself the first time a controller is seen, and from
**Settings → Controller setup…** at any time. Mappings are saved per device (by the browser's
device id) in `localStorage`, so they survive a reload.

1. Pick the **device** if more than one is connected.
2. Standard gamepads: choose your **stick mode preset** (1–4) and click apply. That is usually all.
3. RC transmitters and other joysticks: click **Guided stick setup**. For each stick it asks you to
   move it through its full range a few times, then hold it at one end (throttle up, yaw right, pitch
   forward, roll right) and press **Next** (or Enter). An animation shows the stick movement and what
   the drone does with it, and names the physical stick for the selected mode. The axis that moved most is taken, its min/max
   are recorded and invert is set from where you held it. The last step records the stick centres.
   The "detect" button on a single row does the same for one stick. If the axis it finds belonged to
   another stick, the two swap: that other stick gets a neutral calibration and you are asked to
   detect it next. A self-centring stick must be moved both ways before Next is accepted.
4. Fine-tune per axis: axis number, invert, min/center/max (type a value or press "set" to take
   the current stick position), and the deadzone (default 0.03).
5. **Buttons and switches** (optional: the keyboard keys Space, C, M, R and P always work, also with a
   controller connected): click assign next to an action, then press a button or flip a switch.
   Radios often only expose switches as axes; an axis switch counts as on past 0.5 in the direction
   you flipped it. Arm and flight mode on a switch follow the switch position (like on a real quad:
   flip to arm, flip back to disarm), and the sim does not arm if the switch is already on when
   the radio connects. Buttons toggle.
6. Live bars show raw axes and buttons and the mapped stick values.

### Throttle that centres vs one that doesn't

Gamepad throttle sticks spring back to the middle; RC throttle sticks stay where you leave them.
Both use the full calibrated range. **Settings → "Throttle stick centers: mid stick = hover"** maps
mid throttle to hover thrust in angle mode (that suits a gamepad and is also handy on a radio while
learning). Turn it off to get the plain linear range in angle mode as well.

## Linux / Ubuntu notes

- EdgeTX/OpenTX radios in **USB Joystick (HID)** mode show up as ordinary joysticks and work in
  Chromium/Chrome and Firefox. Choose "USB Joystick" on the radio when you plug it in.
- If the controller you are flying with disconnects while armed, the quad disarms (failsafe).
  Disconnecting another, idle controller does nothing.
- Browsers sometimes only report a controller after you press a button or move a stick on it.
- **Snap-packaged browsers** on Ubuntu (Firefox and Chromium are snaps by default) may not see
  joysticks because of the sandbox. Connect the joystick interface:

  ```bash
  sudo snap connect firefox:joystick
  ```

  ```bash
  sudo snap connect chromium:joystick
  ```

  Restart the browser afterwards. If that does not help, use the `.deb` build of Google Chrome, or
  a Flatpak or `.deb` build of Firefox/Chromium.
- You can check what the browser sees with the debug overlay (`) or the raw bars in the setup screen.

## Deploying

`npm run build` writes the site to `public/` (`index.html` plus content-hashed files in `assets/`).
Point the web server's document root at `public/`, like a Laravel app: `src/`, `node_modules/` and
`.git/` stay outside it. No rewrites and no Node at runtime are needed.

- Build where Node is available (your machine or CI), then copy `public/` to the server, for
  example `rsync -a --delete public/ server:/var/www/browser-los-drone-simulator/public/`. If you
  build on a live server instead, build into another folder (`npx vite build --outDir /tmp/drone-build`)
  and swap it in, because each build first empties `public/`.
- `public/` is generated and git-ignored. Do not put files there by hand (a favicon, `robots.txt`):
  the next build deletes them. Static files go in `static/`; the build copies them into `public/`.

**Serve it over HTTPS.** The Gamepad API is specified for secure contexts only, so a browser may
refuse controllers on a plain `http://` domain. `localhost` and `*.localhost` count as secure. The
keyboard works either way.

Apache, local (Chrome and Firefox resolve `*.localhost` to your machine and treat it as secure):

```apache
<VirtualHost *:80>
    ServerName drone.localhost
    DocumentRoot /var/www/browser-los-drone-simulator/public
    <Directory /var/www/browser-los-drone-simulator/public>
        Options -Indexes
        Require all granted
    </Directory>
</VirtualHost>
```

nginx on a server, with a certificate from e.g. `certbot --nginx`:

```nginx
server {
    listen 443 ssl;
    server_name drone.example.com;
    ssl_certificate     /etc/letsencrypt/live/drone.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/drone.example.com/privkey.pem;

    root /var/www/browser-los-drone-simulator/public;
    index index.html;

    location = /index.html { add_header Cache-Control "no-cache"; }
    location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
}
```

## Settings

Esc opens the settings panel (the sim pauses while it is open):

- Physics preset: Beginner, 5" freestyle, Tiny whoop. Choosing a preset also loads its rates.
- Rates per axis, Betaflight "actual rates" style: center sensitivity, max rate (deg/s) and expo.
  Defaults: roll/pitch 200/670, yaw 200/500.
- Angle mode max tilt, throttle expo, hover-at-center.
- Stick command arming on/off.
- FPV uptilt and FOV, FPV front props in view, LOS auto-zoom on/off, LOS marker on/off.
- Drone size (drawn size and collisions, 1× to 3×, default 1.5×; flight physics unchanged).
- Wind: speed (0 = calm, up to 15 m/s), direction it comes from (0 = in your face, 90 = from the right,
  270 = from the left) and gusts. The HUD shows the wind with an arrow, flags fly downwind and trees
  sway harder. Drag works on the speed relative to the air, so the quad drifts and you have to hold it
  into the wind; on the ground it stays put.
- Low quality (no shadows, pixel ratio 1, about a third of the trees). Use this on weak iGPUs.
- Photo quality: a real sky (HDRI) that also lights the scene, a photo-scanned grass texture, ambient
  occlusion and sharper, wider sun shadows. The images (CC0, from Poly Haven, about 10 MB) are in
  `static/photo/` and only load when you switch this on; see [docs/photo-assets.md](docs/photo-assets.md).
  Heavier than the default, and off while Low quality is on.
- Motor sound volume (off by default).

Everything is saved in `localStorage`. "Reset all settings" restores the defaults (controller
mappings are kept; reset those per device in the setup screen).

## Flight model

`src/physics/quad.js`. The tuning constants (flight presets, contact behaviour, camera, input, world) are in `src/config.js`.

- Fixed 500 Hz steps with an accumulator; a frame is capped at 0.1 s so a long pause cannot cause a
  spiral of death. Rendering interpolates between the last two physics states.
- Thrust along the body up axis, `maxThrust = mass · g · thrustToWeight` (0.6 kg and 4:1 for the 5"),
  with a short motor lag and optional throttle expo.
- Drag is linear plus quadratic, with separate coefficients along the body up axis and in the body
  plane, so the quad carves through turns instead of sliding.
- Acro: sticks give a target rate through Betaflight actual rates; the actual angular velocity
  follows with a first-order response (about 30 ms), standing in for a tuned PID loop.
- Angle mode: sticks give a target tilt relative to the current heading (a corner stick is capped at
  max tilt too); yaw stays rate based, about the world vertical so turning does not cost tilt.
- Collisions: a sphere at the centre plus spheres at the motors, prop rims and body (sized with the
  drawn drone; props flex, so they do not bounce) against the
  heightfield ground, boxes and vertical cylinders (gates, poles, trees, tower). A motor hit also
  makes the quad spin. A grounded quad with low thrust settles flat on its feet, and on the ground
  below take-off thrust the sticks do not spin it (like a real quad without air mode).
- After a stick-command arm, yaw/pitch/roll are ignored until the sticks are back at centre (or you
  give take-off throttle), so the sticks that are still in the corners do not make it spin. The HUD
  shows "ARMED · CENTER STICKS" meanwhile.

Physics is frame-rate independent: a unit test runs the same flight at 24, 60 and 144 fps, and you
can throttle rendering in the browser with `?fps=20` (for example `http://localhost:5173/?fps=20`)
and see the quad fly the same.

## Project layout

```
src/
  main.js              bootstrap and main loop
  config.js            all tuning constants and default settings
  storage.js           localStorage helpers
  cameras.js           LOS / chase / FPV
  audio.js             optional Web Audio motor sound
  physics/             quad.js (dynamics), rates.js, controls.js, stepper.js, colliders.js
  input/               gamepad.js (polling, storage), mapping.js (pure mapping logic), keyboard.js, input.js,
                       gesture.js (stick command arming)
  world/               terrain, distant hills, sky, lights, trees, course (pad, gates, poles, flags, tower)
  drone/model.js       procedural quad (carbon frame, motors, props, battery, camera), prop animation, LEDs
  ui/                  HUD, settings, calibration screen + stick guide, toasts, LOS marker, debug overlay
test/                  Vitest unit tests
```
