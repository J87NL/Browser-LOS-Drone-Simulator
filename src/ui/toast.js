import { h } from './dom.js';

export class Toasts {
  constructor(parent) {
    this.el = h('div', { class: 'toasts', 'aria-live': 'polite' });
    parent.append(this.el);
  }

  show(text, ms = 2600) {
    const t = h('div', { class: 'toast', text });
    this.el.append(t);
    while (this.el.children.length > 4) this.el.firstChild.remove();
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  }
}
