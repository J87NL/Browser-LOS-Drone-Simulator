// Gamepad polling, device selection and per-device mapping storage.
import { defaultMapping, mapGamepad, sanitizeMapping, snapshot } from './mapping.js';
import { loadMappings, saveMappings } from '../storage.js';

export class GamepadManager extends EventTarget {
  constructor() {
    super();
    this.store = loadMappings();
    this.known = new Set();
    this.supported = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', (e) => this._connected(e.gamepad));
      window.addEventListener('gamepaddisconnected', (e) => this._disconnected(e.gamepad));
    }
  }

  list() {
    if (!this.supported) return [];
    try {
      return Array.from(navigator.getGamepads()).filter((g) => g && g.connected);
    } catch {
      return []; // e.g. blocked by a permissions policy
    }
  }

  /** The gamepad the sim listens to: the preferred one if connected, else the first. */
  active() {
    const pads = this.list();
    return pads.find((g) => g.id === this.store.preferredId) ?? pads[0] ?? null;
  }

  setPreferred(id) {
    this.store.preferredId = id;
    saveMappings(this.store);
  }

  hasMapping(id) {
    return !!this.store.byId[id];
  }

  getMapping(gp) {
    const stored = sanitizeMapping(this.store.byId[gp.id]);
    return stored ?? defaultMapping(gp.mapping === 'standard');
  }

  setMapping(id, mapping) {
    this.store.byId[id] = mapping;
    saveMappings(this.store);
    this.dispatchEvent(new CustomEvent('mappingchange', { detail: { id } }));
  }

  clearMapping(id) {
    delete this.store.byId[id];
    saveMappings(this.store);
    this.dispatchEvent(new CustomEvent('mappingchange', { detail: { id } }));
  }

  /** Call once per frame. Also catches pads that appear without an event. */
  poll() {
    const pads = this.list();
    const ids = new Set(pads.map((g) => `${g.index}:${g.id}`));
    for (const g of pads) if (!this.known.has(`${g.index}:${g.id}`)) this._connected(g);
    for (const k of [...this.known]) {
      if (!ids.has(k)) {
        this.known.delete(k);
        this.dispatchEvent(new CustomEvent('disconnect', { detail: { id: k.slice(k.indexOf(':') + 1) } }));
      }
    }
    const gp = this.active();
    if (!gp) return null;
    const snap = snapshot(gp);
    const mapping = this.getMapping(gp);
    return { id: gp.id, gp: snap, mapping, mapped: mapGamepad(snap, mapping) };
  }

  _connected(gp) {
    const k = `${gp.index}:${gp.id}`;
    if (this.known.has(k)) return;
    this.known.add(k);
    this.dispatchEvent(
      new CustomEvent('connect', { detail: { id: gp.id, firstTime: !this.hasMapping(gp.id) } }),
    );
  }

  _disconnected(gp) {
    const k = `${gp.index}:${gp.id}`;
    if (!this.known.delete(k)) return;
    this.dispatchEvent(new CustomEvent('disconnect', { detail: { id: gp.id } }));
  }
}
