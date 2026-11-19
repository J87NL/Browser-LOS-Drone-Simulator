// Controller setup: device picker, stick-mode presets, guided stick
// detection, per-axis invert/min/center/max, deadzone, button/switch
// assignment, and live raw/mapped bars. Changes are saved immediately.
import { h } from './dom.js';
import {
  STICKS, ACTIONS, ACTION_LABELS, AxisDetector, calibrationFromDetection, detectBinding,
  describeBinding, defaultMapping, modePreset, mapGamepad, snapshot, heldAtEnd,
} from '../input/mapping.js';

const STICK_PROMPT = {
  throttle: 'Move the THROTTLE stick fully up and down a few times, then hold it at FULL UP',
  yaw: 'Move the YAW stick fully left and right a few times, then hold it at FULL RIGHT',
  pitch: 'Move the PITCH stick fully forward and back a few times, then hold it FORWARD (away from you)',
  roll: 'Move the ROLL stick fully left and right a few times, then hold it at FULL RIGHT',
};

export class CalibrationScreen {
  /**
   * @param {HTMLElement} parent
   * @param {import('../input/gamepad.js').GamepadManager} gamepads
   * @param {{onClose:()=>void, toast:(t:string)=>void}} cb
   */
  constructor(parent, gamepads, cb) {
    this.gamepads = gamepads;
    this.cb = cb;
    this.el = h('div', { class: 'overlay hidden', role: 'dialog', 'aria-label': 'Controller setup' });
    parent.append(this.el);
    this.deviceId = null;
    this.mapping = null;
    this.wizard = null; // { steps, i, detector, used }
    this.listening = null; // { action, baseline }
    this.live = { raw: [], buttons: [], sticks: {}, actions: {} };
    this.onKey = (e) => {
      if (!this.open) return;
      if (e.key === 'Enter' && this.wizard) {
        e.preventDefault();
        this._wizardNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (this.wizard || this.listening) this._cancelCapture();
        else this.close();
      }
    };
    window.addEventListener('keydown', this.onKey, true);
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  show(deviceId = null) {
    const pads = this.gamepads.list();
    const pick = pads.find((g) => g.id === deviceId) ?? this.gamepads.active() ?? pads[0];
    this._selectDevice(pick?.id ?? null);
    this.el.classList.remove('hidden');
  }

  close() {
    this._cancelCapture();
    // Store the mapping even if unchanged, so "first connect" only happens once.
    if (this.deviceId && this.mapping && !this.gamepads.hasMapping(this.deviceId)) this._save();
    this.el.classList.add('hidden');
    this.cb.onClose?.();
  }

  _pad() {
    return this.gamepads.list().find((g) => g.id === this.deviceId) ?? null;
  }

  _selectDevice(id) {
    this.deviceId = id;
    this._cancelCapture();
    const gp = this._pad();
    this.mapping = gp ? this.gamepads.getMapping(gp) : null;
    if (gp) this.gamepads.setPreferred(gp.id);
    this.render();
  }

  _save() {
    if (!this.deviceId || !this.mapping) return;
    this.gamepads.setMapping(this.deviceId, this.mapping);
  }

  _stickAxes() {
    return STICKS.map((s) => this.mapping.axes[s]?.index).filter((i) => Number.isInteger(i) && i >= 0);
  }

  _cancelCapture() {
    this.wizard = null;
    this.listening = null;
    if (this.open) this.render();
  }

  // --- Guided stick detection ---------------------------------------------

  _startWizard(only = null) {
    const steps = only ? [only] : [...STICKS, 'center'];
    // Guided setup excludes axes already found in this run. A single-stick
    // detect may take any axis; it swaps with the stick that had it.
    const used = [];
    this.wizard = { steps, i: 0, used, single: !!only, detector: new AxisDetector(used), message: '' };
    this.listening = null;
    this.render();
  }

  _wizardNext() {
    const w = this.wizard;
    const step = w.steps[w.i];
    const gp = this._pad();
    if (!gp) return;
    if (step === 'center') {
      const axes = Array.from(gp.axes);
      for (const s of ['yaw', 'pitch', 'roll']) {
        const a = this.mapping.axes[s];
        const c = axes[a.index];
        if (typeof c === 'number' && c > a.min && c < a.max) a.center = c;
      }
      this._save();
      this.wizard = null;
      this.cb.toast('Sticks calibrated');
      this.render();
      return;
    }
    const r = w.detector.result(0.3);
    if (!r) {
      w.message = 'No movement detected. Move the stick through its full range and try again.';
      w.detector = new AxisDetector(w.used);
      this.render();
      return;
    }
    if (!heldAtEnd(r)) {
      // Invert is read from where the stick is held, so it must be at an end.
      w.message = 'Hold the stick at the end named above while you press Next.';
      this.render();
      return;
    }
    const prev = this.mapping.axes[step];
    if (w.single) {
      const other = STICKS.find((s) => s !== step && this.mapping.axes[s].index === r.index);
      if (other) this.mapping.axes[other].index = prev?.index ?? -1;
    }
    const prevCenter = prev?.index === r.index ? prev.center : null;
    this.mapping.axes[step] = calibrationFromDetection(r, prevCenter);
    w.used.push(r.index);
    this._save();
    w.i++;
    w.message = '';
    w.detector = new AxisDetector(w.used);
    if (w.i >= w.steps.length) {
      this.wizard = null;
      this.cb.toast(`${step} assigned to axis ${r.index}`);
    }
    this.render();
  }

  // --- Button assignment ----------------------------------------------------

  _listen(action) {
    const gp = this._pad();
    if (!gp) return;
    this.wizard = null;
    this.listening = { action, baseline: snapshot(gp) };
    this.render();
  }

  // --- Per-frame update -------------------------------------------------------

  update() {
    if (!this.open) return;
    const gp = this._pad();
    if (!gp && this.deviceId) {
      this._selectDevice(this.gamepads.active()?.id ?? null);
      return;
    }
    if (!gp) {
      if (this.gamepads.list().length) this._selectDevice(this.gamepads.list()[0].id);
      return;
    }
    const snap = snapshot(gp);
    if (this.wizard) this.wizard.detector.sample(snap.axes);
    if (this.listening) {
      const b = detectBinding(this.listening.baseline, snap, this._stickAxes());
      if (b) {
        this.mapping.buttons[this.listening.action] = b;
        this._save();
        this.cb.toast(`${ACTION_LABELS[this.listening.action]}: ${describeBinding(b)}`);
        this.listening = null;
        this.render();
      }
    }
    // Live bars
    const mapped = mapGamepad(snap, this.mapping);
    this.liveEls?.raw.forEach((el, i) => {
      const v = snap.axes[i] ?? 0;
      el.fill.style.transform = `translateX(${(v * 50).toFixed(1)}%)`;
      el.num.textContent = v.toFixed(2);
    });
    this.liveEls?.buttons.forEach((el, i) => el.classList.toggle('on', !!snap.buttons[i]?.pressed));
    for (const s of STICKS) {
      const row = this.liveEls?.sticks[s];
      if (!row) continue;
      const cal = this.mapping.axes[s];
      const raw = snap.axes[cal.index];
      row.raw.textContent = typeof raw === 'number' ? raw.toFixed(2) : '—';
      const v = mapped[s];
      row.fill.style.transform = s === 'throttle' ? `scaleX(${v})` : `translateX(${(v * 50).toFixed(1)}%)`;
      row.num.textContent = v.toFixed(2);
    }
    for (const a of ACTIONS) this.liveEls?.actions[a]?.classList.toggle('on', !!mapped.actions[a]);
  }

  // --- Rendering ----------------------------------------------------------------

  render() {
    const pads = this.gamepads.list();
    const gp = this._pad();
    const header = h('header', {},
      h('h2', { text: 'Controller setup' }),
      h('button', { class: 'ghost', text: 'Done (Esc)', onclick: () => this.close() }));

    if (!this.gamepads.supported || !gp) {
      this.liveEls = null;
      this.el.replaceChildren(h('div', { class: 'dialog panel' }, header,
        h('p', { text: this.gamepads.supported ? 'No controller detected. Plug it in and press any button or move a stick.' : 'This browser does not support the Gamepad API.' }),
        h('p', { class: 'muted', text: 'RC transmitters: select USB joystick (HID) mode on the radio when connecting. On Ubuntu, snap-packaged browsers may not see joysticks; see the README.' }),
      ));
      return;
    }

    const devSel = h('select', { onchange: () => this._selectDevice(devSel.value) },
      pads.map((p) => h('option', { value: p.id, selected: p.id === this.deviceId, text: `${p.index}: ${p.id}` })));
    const modeSel = h('select', { 'aria-label': 'Stick mode preset' },
      [1, 2, 3, 4].map((m) => h('option', { value: m, selected: m === this.mapping.stickMode, text: `Mode ${m}` })));
    const applyPreset = () => {
      const m = Number(modeSel.value);
      this.mapping.stickMode = m;
      this.mapping.axes = modePreset(m);
      this._save();
      this.render();
    };

    // Wizard / listening banner
    let banner = null;
    if (this.wizard) {
      const step = this.wizard.steps[this.wizard.i];
      const text = step === 'center' ? 'Let the yaw, pitch and roll sticks rest at center (throttle anywhere)' : STICK_PROMPT[step];
      banner = h('div', { class: 'banner' },
        h('div', {}, h('b', { text: `Step ${this.wizard.i + 1}/${this.wizard.steps.length}: ` }), text, ', then press Next (Enter).'),
        this.wizard.message && h('div', { class: 'warn', text: this.wizard.message }),
        h('div', { class: 'row' },
          h('button', { text: 'Next', onclick: () => this._wizardNext() }),
          h('button', { class: 'ghost', text: 'Cancel', onclick: () => this._cancelCapture() })));
    } else if (this.listening) {
      banner = h('div', { class: 'banner' },
        h('div', {}, h('b', { text: `${ACTION_LABELS[this.listening.action]}: ` }), 'press a button or flip a switch on the controller…'),
        h('button', { class: 'ghost', text: 'Cancel', onclick: () => this._cancelCapture() }));
    }

    // Stick table
    this.liveEls = { raw: [], buttons: [], sticks: {}, actions: {} };
    const axisOptions = (sel) => [
      h('option', { value: -1, text: '—', selected: sel < 0 }),
      ...gp.axes.map((_, i) => h('option', { value: i, text: `Axis ${i}`, selected: i === sel })),
    ];
    const stickRows = STICKS.map((s) => {
      const cal = this.mapping.axes[s];
      const numIn = (field) => {
        const input = h('input', {
          type: 'number', step: 0.01, min: -1.5, max: 1.5, value: Number(cal[field].toFixed(3)), class: 'small',
          'aria-label': `${s} ${field}`,
          onchange: () => {
            const v = Number(input.value);
            if (Number.isFinite(v)) {
              cal[field] = v;
              this._save();
            }
          },
        });
        return input;
      };
      const capture = (field) => h('button', {
        class: 'tiny', text: 'set', title: `Use the current position as ${field}`,
        onclick: () => {
          const v = this._pad()?.axes[cal.index];
          if (typeof v !== 'number') return;
          cal[field] = v;
          this._save();
          this.render();
        },
      });
      const axisSel = h('select', {
        'aria-label': `${s} axis`,
        onchange: () => {
          cal.index = Number(axisSel.value);
          this._save();
        },
      }, axisOptions(cal.index));
      const inv = h('input', {
        type: 'checkbox', checked: cal.invert, 'aria-label': `${s} invert`,
        onchange: () => {
          cal.invert = inv.checked;
          this._save();
        },
      });
      const fill = h('div', { class: s === 'throttle' ? 'bar-fill thr' : 'bar-fill' });
      const num = h('span', { class: 'num' });
      const raw = h('span', { class: 'num muted' });
      this.liveEls.sticks[s] = { fill, num, raw };
      return h('tr', {},
        h('th', { text: s }),
        h('td', {}, axisSel),
        h('td', {}, inv),
        h('td', {}, numIn('min'), capture('min')),
        h('td', {}, s === 'throttle' ? h('span', { class: 'muted', text: 'n/a' }) : [numIn('center'), capture('center')]),
        h('td', {}, numIn('max'), capture('max')),
        h('td', {}, raw),
        h('td', {}, h('div', { class: s === 'throttle' ? 'bar thr' : 'bar' }, fill), num),
        h('td', {}, h('button', { class: 'tiny', text: 'detect', onclick: () => this._startWizard(s) })),
      );
    });

    const dz = h('input', {
      type: 'number', min: 0, max: 0.5, step: 0.01, value: this.mapping.deadzone, class: 'small',
      onchange: () => {
        const v = Number(dz.value);
        if (Number.isFinite(v)) {
          this.mapping.deadzone = Math.min(0.5, Math.max(0, v));
          dz.value = this.mapping.deadzone;
          this._save();
        }
      },
    });

    const buttonRows = ACTIONS.map((a) => {
      const ind = h('span', { class: 'led' });
      this.liveEls.actions[a] = ind;
      return h('tr', {},
        h('th', { text: ACTION_LABELS[a] }),
        h('td', { text: describeBinding(this.mapping.buttons[a]) }),
        h('td', {}, ind),
        h('td', {},
          h('button', { class: 'tiny', text: 'assign', onclick: () => this._listen(a) }),
          h('button', {
            class: 'tiny ghost', text: 'clear',
            onclick: () => {
              this.mapping.buttons[a] = null;
              this._save();
              this.render();
            },
          })),
      );
    });

    const rawAxes = gp.axes.map((_, i) => {
      const fill = h('div', { class: 'bar-fill' });
      const num = h('span', { class: 'num' });
      this.liveEls.raw.push({ fill, num });
      return h('div', { class: 'raw-axis' }, h('span', { class: 'muted', text: `A${i}` }), h('div', { class: 'bar' }, fill), num);
    });
    const rawButtons = gp.buttons.map((_, i) => {
      const b = h('span', { class: 'btn-ind', text: String(i) });
      this.liveEls.buttons.push(b);
      return b;
    });

    this.el.replaceChildren(
      h('div', { class: 'dialog panel wide' },
        header,
        h('div', { class: 'row wrap' },
          h('label', { class: 'field grow' }, h('span', { text: 'Device' }), devSel),
          h('label', { class: 'field' }, h('span', { text: 'Stick mode preset' }), h('span', { class: 'inline' }, modeSel,
            h('button', { class: 'tiny', text: 'apply', onclick: applyPreset }))),
          h('label', { class: 'field' }, h('span', { text: 'Deadzone' }), dz),
        ),
        h('p', { class: 'muted', text: gp.mapping === 'standard'
          ? 'Standard gamepad layout detected: the mode preset should work as is. Use guided setup for anything unusual.'
          : 'Non-standard device (RC transmitter or joystick): run the guided setup to find your sticks, then assign switches.' }),
        h('div', { class: 'row' },
          h('button', { text: 'Guided stick setup', onclick: () => this._startWizard() }),
          h('button', {
            class: 'ghost', text: 'Reset this device',
            onclick: () => {
              this.mapping = defaultMapping(gp.mapping === 'standard');
              this._save();
              this.render();
            },
          })),
        banner,
        h('h3', { text: 'Sticks' }),
        h('table', { class: 'cal' },
          h('thead', {}, h('tr', {}, ...['', 'axis', 'invert', 'min', 'center', 'max', 'raw', 'mapped', ''].map((t) => h('th', { text: t })))),
          h('tbody', {}, stickRows)),
        h('h3', { text: 'Buttons and switches' }),
        h('p', { class: 'muted', text: 'A switch on an axis counts as pressed past 0.5. Arm and flight mode on a switch follow its position.' }),
        h('table', { class: 'cal' }, h('tbody', {}, buttonRows)),
        h('h3', { text: 'Raw input' }),
        h('div', { class: 'raw-grid' }, rawAxes),
        h('div', { class: 'btn-grid' }, rawButtons),
      ),
    );
    this.update();
  }
}
