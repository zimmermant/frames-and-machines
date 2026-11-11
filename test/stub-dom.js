// A tiny stand-in for the DOM (no browser, no jsdom): for future SVG rendering and interaction tests.
// Not a test file (the runner globs *.test.js).
export function stubElement(tag = 'div') {
  const listeners = {};
  let text = '';
  const el = {
    tag, attrs: {}, children: [], parent: null,
    get textContent() { return text + this.children.map(c => c.textContent).join(''); },
    set textContent(value) { text = String(value); this.children = []; },
    innerHTML: '', hidden: false, value: '0', disabled: false,
    get ownerDocument() { return globalThis.document; },
    get parentNode() { return this.parent; },
    contains(node) { return node === this || this.children.some(c => c.contains(node)); },
    matches(selector) {
      if (selector.startsWith('#')) return this.attrs.id === selector.slice(1);
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      const match = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      return match ? (match[2] === undefined ? match[1] in this.attrs : this.attrs[match[1]] === match[2]) : this.tag === selector;
    },
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; },
    querySelector(selector) {
      for (const child of this.children) {
        if (child.matches(selector)) return child;
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    },
    focus() { globalThis.document.activeElement = this; },
    capturedPointer: null,
    setPointerCapture(id) { this.capturedPointer = id; },
    hasPointerCapture(id) { return this.capturedPointer === id; },
    releasePointerCapture(id) { if (this.capturedPointer === id) this.capturedPointer = null; },
    getScreenCTM() { return { inverse: () => ({ a:1, b:0, c:0, d:1, e:0, f:0 }) }; },
    get firstChild() { return this.children[0] || null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    appendChild(c) { c.parent = this; this.children.push(c); return c; },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      c.parent = null;
      return c;
    },
    classList: {
      toggle(c, on) {
        const set = new Set((el.attrs.class || '').split(/\s+/).filter(Boolean));
        if (on) set.add(c); else set.delete(c);
        el.attrs.class = [...set].join(' ');
      },
      contains: (c) => (el.attrs.class || '').split(/\s+/).includes(c)
    },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    fire(type, e = {}) { for (const fn of listeners[type] || []) fn(e); }
  };
  return el;
}

// document.createElementNS for svg.js
export function installSvgDocument() {
  globalThis.document = { createElementNS: (ns, name) => stubElement(name) };
}
