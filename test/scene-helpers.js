import { stubElement, installSvgDocument } from './stub-dom.js';
import { render } from '../src/scene.js';
import { solve } from '../src/solve.js';
import { FIG1 } from '../src/figures/fig1.js';
import { FIG2 } from '../src/figures/fig2.js';
import { FIG3 } from '../src/figures/fig3.js';
import { FIG4 } from '../src/figures/fig4.js';
import { FIG5 } from '../src/figures/fig5.js';
import { FIG6 } from '../src/figures/fig6.js';

export const figures = [FIG1, FIG2, FIG3, FIG4, FIG5, FIG6];
export const nominal = fig => Object.fromEntries(fig.loads.map(l => [l.name, {...l.nominal}]));
export function nodes(root, predicate) {
  return root.children.flatMap(c => [...(predicate(c) ? [c] : []), ...nodes(c, predicate)]);
}
export const byClass = (root, cls) => nodes(root, n => n.classList.contains(cls));
export const byTag = (root, tag) => nodes(root, n => n.tag === tag);
export const attr = (n, key) => n.getAttribute(key);
export function forceLabel(svg, force) {
  const group=byClass(svg,'force-label').find(n=>['data-name','data-sub','data-member','data-role']
    .every(key=>attr(n,key)===attr(force,key)));
  return group && byTag(group,'text')[0];
}
export function draw(fig, loads = nominal(fig), frac = 0) {
  installSvgDocument();
  const svg = stubElement('svg');
  render(svg, fig, {loads, held:null}, solve(fig, loads), frac);
  return svg;
}
// Read actual shaft and polygon geometry, not renderer metadata.
export function endpoints(group) {
  const shaft = byTag(group, 'line')[0];
  const head = byTag(group, 'polygon')[0];
  if (!shaft || !head) return null;
  const [x, y] = attr(head, 'points').split(/[,\s]+/).map(Number);
  return { tail:{x:+attr(shaft,'x1'),y:+attr(shaft,'y1')}, head:{x,y} };
}
// WCAG relative luminance and contrast against white.
export function contrastOnWhite(hex) {
  const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);
  return 1.05/(0.2126*c[0]+0.7152*c[1]+0.0722*c[2]+0.05);
}
// The colour an arrow group is drawn in (its head, or the dashed ring of a zero force).
export function forceColour(group) {
  const head=byTag(group,'polygon')[0];
  return head ? attr(head,'fill') : attr(byClass(group,'zero')[0],'stroke');
}
