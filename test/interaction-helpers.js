import { stubElement, installSvgDocument } from './stub-dom.js';
import { createApp } from '../src/app.js';
import { FIG1 } from '../src/figures/fig1.js';

export function setup(options = {}, figure = FIG1) {
  installSvgDocument();
  const root = stubElement('main'), svg = stubElement('svg'), button = stubElement('button'), status = stubElement('p');
  svg.setAttribute('id', 'scene');
  button.setAttribute('id', 'explode');
  status.setAttribute('id', 'status');
  root.appendChild(status);
  root.appendChild(button); root.appendChild(svg);
  let time = 0, id = 0;
  const frames = new Map();
  const app = createApp(root, figure, {
    now: () => time,
    requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: key => frames.delete(key),
    reducedMotion: () => false,
    ...options
  });
  return { app, root, svg, button, status, frames,
    handle: (name = 'P') => svg.querySelector(`[data-load="${name}"]`),
    tick(t) { time = t; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(cb => cb(t)); }
  };
}
export function pointer(ui, type, point, extras = {}) {
  const e = { target:ui.handle(), pointerId:7, button:0, clientX:point.x, clientY:-point.y,
    preventDefault() { this.defaultPrevented = true; }, ...extras };
  ui.svg.fire(type, e);
  return e;
}
export function key(ui, name, value, target = ui.handle(name)) {
  const e = { target, key:value, preventDefault() { this.defaultPrevented = true; } };
  ui.svg.fire('keydown', e);
  return e;
}
export function near(actual, expected, epsilon = 1e-10) {
  if (Math.abs(actual - expected) > epsilon) throw new Error(`${actual} != ${expected}`);
}
