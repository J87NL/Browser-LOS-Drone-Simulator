// Animated explanation for the guided stick setup: on the left the stick
// moving the way the step asks, on the right what the drone does with it.
// Built from constant SVG elements (no innerHTML); animations live in style.css.
import { h } from './dom.js';
import { stickLocation } from '../input/mapping.js';

const NS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children.flat()) {
    if (c == null) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export const GUIDE = {
  throttle: {
    what: 'Throttle is motor power: the drone climbs or sinks, it does not tilt or turn.',
    move: 'Move it fully down and up a few times, then hold it at FULL UP (drone climbs).',
    view: 'side view',
  },
  yaw: {
    what: 'Yaw turns the nose left or right on the spot, like a turntable. The drone stays level and does not move sideways.',
    move: 'Move it fully left and right a few times, then hold it at FULL RIGHT (nose turns clockwise).',
    view: 'top view, nose up',
  },
  pitch: {
    what: 'Pitch tilts the nose down or up, so the drone flies forward or backward.',
    move: 'Move it fully forward and back a few times, then hold it FORWARD, pushed away from you (nose down, flies forward).',
    view: 'side view, nose right',
  },
  roll: {
    what: 'Roll banks the drone to the left or right, so it slides sideways. The nose keeps pointing the same way.',
    move: 'Move it fully left and right a few times, then hold it at FULL RIGHT (right side dips, slides right).',
    view: 'rear view',
  },
};

const DARK = '#c3cad3'; // frame: light, so it reads on the dark dialog
const FRONT = '#ff7a1a';

function sideView() {
  return [
    s('rect', { x: -34, y: -3, width: 68, height: 6, rx: 2, fill: DARK }),
    s('rect', { x: -10, y: -11, width: 20, height: 8, rx: 2, fill: '#f2c230' }), // battery
    s('rect', { x: 30, y: -7, width: 8, height: 9, rx: 1, fill: FRONT }), // camera = front
    s('rect', { x: -31, y: -9, width: 4, height: 6, fill: DARK }),
    s('rect', { x: 27, y: -9, width: 4, height: 6, fill: DARK }),
    s('ellipse', { cx: -29, cy: -11, rx: 15, ry: 2.5, fill: '#8a929b' }),
    s('ellipse', { cx: 29, cy: -11, rx: 15, ry: 2.5, fill: FRONT }),
  ];
}

function topView() {
  const motors = [[-24, -24, FRONT], [24, -24, FRONT], [-24, 24, '#8a929b'], [24, 24, '#8a929b']];
  return [
    s('line', { x1: -24, y1: -24, x2: 24, y2: 24, stroke: DARK, 'stroke-width': 6, 'stroke-linecap': 'round' }),
    s('line', { x1: 24, y1: -24, x2: -24, y2: 24, stroke: DARK, 'stroke-width': 6, 'stroke-linecap': 'round' }),
    ...motors.map(([x, y, c]) => s('circle', { cx: x, cy: y, r: 12, fill: c, 'fill-opacity': 0.7, stroke: c })),
    s('rect', { x: -7, y: -16, width: 14, height: 30, rx: 3, fill: '#f2c230' }),
    s('path', { d: 'M0 -40 L-6 -31 L6 -31 Z', fill: FRONT }), // nose arrow
  ];
}

function rearView() {
  return [
    s('rect', { x: -34, y: -3, width: 68, height: 6, rx: 2, fill: DARK }),
    s('rect', { x: -9, y: -12, width: 18, height: 9, rx: 2, fill: '#f2c230' }),
    s('rect', { x: -31, y: -9, width: 4, height: 6, fill: DARK }),
    s('rect', { x: 27, y: -9, width: 4, height: 6, fill: DARK }),
    s('ellipse', { cx: -29, cy: -11, rx: 15, ry: 2.5, fill: '#8a929b' }),
    s('ellipse', { cx: 29, cy: -11, rx: 15, ry: 2.5, fill: '#8a929b' }),
    s('circle', { cx: -18, cy: 4, r: 2.5, fill: '#ff2436' }),
    s('circle', { cx: 18, cy: 4, r: 2.5, fill: '#ff2436' }),
  ];
}

/**
 * @param {'throttle'|'yaw'|'pitch'|'roll'} step
 * @param {1|2|3|4} stickMode used to say which physical stick this is
 */
export function stickGuide(step, stickMode) {
  const g = GUIDE[step];
  if (!g) return null;
  const loc = stickLocation(step, stickMode);
  const drone = step === 'yaw' ? topView() : step === 'roll' ? rearView() : sideView();
  const ground = step === 'yaw' ? null : s('line', { x1: 150, y1: 112, x2: 290, y2: 112, class: 'guide-ground' });
  const svg = s('svg', { viewBox: '0 0 300 132', class: `stick-guide guide-${step}`, role: 'img',
    'aria-label': `${step} stick animation: ${g.move}` },
    // Stick gimbal
    s('rect', { x: 14, y: 12, width: 100, height: 100, rx: 14, class: 'guide-box' }),
    s('line', { x1: 64, y1: 20, x2: 64, y2: 104, class: 'guide-cross' }),
    s('line', { x1: 22, y1: 62, x2: 106, y2: 62, class: 'guide-cross' }),
    s('g', { transform: 'translate(64 62)' }, s('circle', { r: 10, class: 'guide-knob' })),
    s('text', { x: 64, y: 128, class: 'guide-label' }, `${loc.stick} stick ${loc.direction === 'up–down' ? '↕' : '↔'}`),
    // Drone
    ground,
    s('g', { transform: 'translate(220 62)' }, s('g', { class: 'guide-drone' }, drone)),
    s('text', { x: 220, y: 128, class: 'guide-label' }, g.view),
  );
  return h('div', { class: 'guide' },
    svg,
    h('div', { class: 'guide-text' },
      h('p', {}, h('b', { text: `${step[0].toUpperCase()}${step.slice(1)}: ` }), g.what),
      h('p', { text: `Mode ${stickMode}: the ${loc.stick} stick, ${loc.direction}. ${g.move}` })),
  );
}
