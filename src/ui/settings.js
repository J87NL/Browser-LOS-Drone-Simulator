// Settings panel (Esc). Edits the settings object in place and reports changes.
import { h } from './dom.js';
import { PRESETS, DEFAULT_SETTINGS, SETTING_RANGES as R } from '../config.js';

const AXES = ['roll', 'pitch', 'yaw'];

export class SettingsPanel {
  /**
   * @param {HTMLElement} parent
   * @param {object} settings live settings object
   * @param {{onChange:(key:string)=>void, onOpenCalibration:()=>void, onClose:()=>void}} cb
   */
  constructor(parent, settings, cb) {
    this.settings = settings;
    this.cb = cb;
    this.el = h('div', { class: 'overlay hidden', role: 'dialog', 'aria-label': 'Settings' });
    parent.append(this.el);
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.render();
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  show() {
    this.render();
    this.el.classList.remove('hidden');
    this.el.querySelector('select, input, button')?.focus();
  }

  close() {
    if (!this.open) return;
    this.el.classList.add('hidden');
    document.activeElement?.blur?.();
    this.cb.onClose?.();
  }

  toggle() {
    if (this.open) this.close();
    else this.show();
  }

  _num(label, key, { min, max, step, unit = '' }, get, set) {
    const input = h('input', {
      type: 'number', min, max, step, value: get(),
      onchange: () => {
        const v = Number(input.value);
        if (!Number.isFinite(v)) return;
        const clamped = Math.min(max, Math.max(min, v));
        input.value = clamped;
        set(clamped);
        this.cb.onChange(key);
      },
    });
    return h('label', { class: 'field' }, h('span', { text: label }), h('span', { class: 'inline' }, input, unit && h('small', { text: unit })));
  }

  _check(label, key) {
    const input = h('input', {
      type: 'checkbox', checked: !!this.settings[key],
      onchange: () => {
        this.settings[key] = input.checked;
        this.cb.onChange(key);
      },
    });
    return h('label', { class: 'field check' }, input, h('span', { text: label }));
  }

  render() {
    const s = this.settings;
    const presetSel = h(
      'select',
      {
        onchange: () => {
          const p = PRESETS[presetSel.value];
          s.preset = presetSel.value;
          s.rates = structuredClone(p.rates);
          s.angleMaxTilt = p.angleMaxTilt;
          this.cb.onChange('preset');
          this.render();
        },
      },
      Object.entries(PRESETS).map(([k, p]) => h('option', { value: k, selected: k === s.preset, text: p.label })),
    );

    const rateRows = AXES.map((axis) =>
      h('tr', {},
        h('th', { text: axis }),
        ...['center', 'max', 'expo'].map((f) => {
          const isExpo = f === 'expo';
          const range = isExpo ? R.rateExpo : R.rate;
          const input = h('input', {
            type: 'number', min: range[0], max: range[1], step: isExpo ? 0.05 : 10, value: s.rates[axis][f],
            'aria-label': `${axis} ${f}`,
            onchange: () => {
              const v = Number(input.value);
              if (!Number.isFinite(v)) return;
              s.rates[axis][f] = Math.min(range[1], Math.max(range[0], v));
              input.value = s.rates[axis][f];
              this.cb.onChange('rates');
            },
          });
          return h('td', {}, input);
        }),
      ),
    );

    const vol = h('input', {
      type: 'range', min: R.volume[0], max: R.volume[1], step: 0.05, value: s.volume,
      oninput: () => {
        s.volume = Number(vol.value);
        this.cb.onChange('volume');
      },
    });

    this.el.replaceChildren(
      h('div', { class: 'dialog panel' },
        h('header', {},
          h('h2', { text: 'Settings' }),
          h('button', { class: 'ghost', text: 'Close (Esc)', onclick: () => this.close() })),
        h('div', { class: 'cols' },
          h('section', {},
            h('h3', { text: 'Flight' }),
            h('label', { class: 'field' }, h('span', { text: 'Physics preset' }), presetSel),
            h('table', { class: 'rates' },
              h('thead', {}, h('tr', {}, h('th'), h('th', { text: 'center °/s' }), h('th', { text: 'max °/s' }), h('th', { text: 'expo' }))),
              h('tbody', {}, rateRows)),
            this._num('Angle mode max tilt', 'angleMaxTilt', { min: R.angleMaxTilt[0], max: R.angleMaxTilt[1], step: 1, unit: '°' }, () => s.angleMaxTilt, (v) => (s.angleMaxTilt = v)),
            this._num('Throttle expo', 'throttleExpo', { min: R.throttleExpo[0], max: R.throttleExpo[1], step: 0.05 }, () => s.throttleExpo, (v) => (s.throttleExpo = v)),
            this._check('Throttle stick centers: mid stick = hover (angle mode)', 'hoverAtCenter'),
            this._check('Arm/disarm by holding both sticks in the bottom corners (DJI style)', 'stickArm'),
          ),
          h('section', {},
            h('h3', { text: 'Camera' }),
            this._num('FPV camera uptilt', 'fpvUptilt', { min: R.fpvUptilt[0], max: R.fpvUptilt[1], step: 1, unit: '°' }, () => s.fpvUptilt, (v) => (s.fpvUptilt = v)),
            this._num('FPV field of view', 'fpvFov', { min: R.fpvFov[0], max: R.fpvFov[1], step: 1, unit: '° horiz.' }, () => s.fpvFov, (v) => (s.fpvFov = v)),
            this._check('FPV: front props in view', 'fpvPropsInView'),
            this._num('Drone size (visual only)', 'droneSize', { min: R.droneSize[0], max: R.droneSize[1], step: 0.25, unit: '×' }, () => s.droneSize, (v) => (s.droneSize = v)),
            this._check('LOS auto-zoom', 'losAutoZoom'),
            this._check('LOS marker when far or off-screen', 'losMarker'),
            h('h3', { text: 'Graphics & sound' }),
            this._check('Low quality (no shadows, fewer trees)', 'lowQuality'),
            this._check('Debug overlay ( ` key)', 'showDebug'),
            h('label', { class: 'field' }, h('span', { text: 'Motor sound volume' }), vol),
            h('h3', { text: 'Controller' }),
            h('div', { class: 'row' },
              h('button', { text: 'Controller setup…', onclick: () => this.cb.onOpenCalibration() }),
              h('button', {
                class: 'ghost', text: 'Reset all settings',
                onclick: () => {
                  for (const k of Object.keys(DEFAULT_SETTINGS)) s[k] = structuredClone(DEFAULT_SETTINGS[k]);
                  this.cb.onChange('all');
                  this.render();
                },
              })),
          ),
        ),
      ),
    );
  }
}
