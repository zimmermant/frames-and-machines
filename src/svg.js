// Adapted from joint_explode's SVG helpers. All geometry uses figure units;
// these two functions are the only conversion between y-up and SVG y-down.
export const NS = 'http://www.w3.org/2000/svg';
export const PALETTE = {
  load:'#e11d48', reaction:'#1d4ed8',
  member:'#cfe3ee', outline:'#3b82a6', pin:'#9ca3af', pinOutline:'#374151',
  ground:'#d6cbb3', greyed:'#94a3b8', ink:'#111111', focus:'#1e3a8a'
};

// One hue per third-law pair (a joint): both halves of the pair share it. Each is at least 3:1 on white and none is the
// load red, the reaction blue or the lift-off grey (a test checks all of that).
export const PAIR_COLOURS = ['#a21caf','#15803d','#b45309','#0e7490'];

export function toSvg(p) { return {x:p.x,y:0-p.y}; }
export function fromSvg(p) { return {x:p.x,y:0-p.y}; }

export function el(name, attrs, parent) {
  const node=document.createElementNS(NS,name);
  for (const k in attrs) if (attrs[k]!==null && attrs[k]!==undefined) node.setAttribute(k,String(attrs[k]));
  if (parent) parent.appendChild(node);
  return node;
}

export function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

// The spoken form of a label: a lowered segment is read "sub", and `say` spells it out ("Ax" is said "A x", so a reader does
// not pronounce it as a word).
export function spokenText(segs) {
  return segs.map(s=>(s.sub?' sub ':'')+(s.say ?? s.t)).join('');
}

// A lowered tspan, not a Unicode glyph or an ASCII suffix. A spoken name
// replaces the concatenated glyphs so a reader does not pronounce "Ax" as a word.
// opts.plain: running text (upright, the page's own font) instead of an italic symbol.
export function label(parent, x, y, segs, opts = {}) {
  const list=typeof segs==='string' ? [{t:segs}] : segs;
  const split=list.some(s=>s.sub), size=opts.size ?? 1;
  const spoken=spokenText(list);
  const node=el('text',{
    x,y,class:'t', id:opts.id || null, 'font-size':size,'font-family':opts.plain?null:'serif','font-style':opts.plain?null:'italic',
    fill:opts.fill || PALETTE.ink, 'text-anchor':opts.anchor || null, role:split?'text':null, 'aria-label':split?spoken:null
  },parent);
  if (!split) { node.textContent=list.map(s=>s.t).join(''); return node; }
  let dy=0;
  for (const s of list) {
    const want=s.sub ? 0.3*size : 0;
    const span=el('tspan',{dy:want-dy,'font-size':s.sub?0.8*size:size},node);
    span.textContent=s.t;
    dy=want;
  }
  return node;
}

// Explicit shaft and head avoid marker scaling and keep the tip exactly at to.
// Cap the head by the actual length: very small nonzero arrows never reverse.
export function arrow(parent, from, to, opts = {}) {
  const dx=to.x-from.x, dy=to.y-from.y, len=Math.hypot(dx,dy);
  if (len===0) return;
  const ux=dx/len, uy=dy/len, head=Math.min(opts.head ?? 0.2,len*0.45);
  const base={x:to.x-ux*head,y:to.y-uy*head}, wing=head*0.52;
  const colour=opts.fill || PALETTE.ink;
  el('line',{
    x1:from.x,y1:from.y,x2:base.x,y2:base.y,stroke:colour,
    'stroke-width':opts.width ?? 0.05,'stroke-linecap':'butt'
  },parent);
  el('polygon',{
    points:`${to.x},${to.y} ${base.x-uy*wing},${base.y+ux*wing} ${base.x+uy*wing},${base.y-ux*wing}`,
    fill:colour
  },parent);
}
