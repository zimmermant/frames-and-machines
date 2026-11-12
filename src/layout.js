import { resolvePoint, sampleArc } from './geometry.js';
import { solve, displayForces } from './solve.js';
import { LOAD_CAP } from './state.js';

// ---- the page layout: geometry fills the window, text and strokes stay one screen size ----------------------------
// Everything a figure can draw, over every load it can reach, has a bounding box in figure units. computeLayout()
// chooses the scale (px per unit) so that box, plus a margin in px for labels, fills the width and the height the
// window leaves. Text, arrowheads, stroke widths, handles and clearances are then drawn in px (divided by the
// scale), so only the geometry and the arrows (length proportional to force) grow with the window.
export const MARGIN_PX=30;      // room round the content for labels beside the outermost arrows. Smallest value that keeps the harness (6 pages x 375/800/1280) and the D-label test at 0 violations at the 1x cap; the first value that failed was 28 (fig 1 label~owner at 1280x720, fig 2 at 375x812, and the figure-4 D-label test at 1280x720; fig 2 was re-tuned via arrowMargin at 30 only).
export const STRIP_PX=28;       // extra room at the bottom for the lift-off line (figures with a one-sided contact)
export const PAGE_RESERVE_PX=62; // body padding 2 x 4, button 44 + 10 margin below it
export const DEFAULT_WIDTH_PX=340;
export const DEFAULT_HEIGHT_PX=716;

const boundsCache=new Map();

const memberPoints=(fig,member)=>member.path.flatMap(seg=>seg.seg==='arc' ? sampleArc(fig,seg,48) : [resolvePoint(fig,seg.from),resolvePoint(fig,seg.to)]);
const explodeOffset=(fig,id,frac)=>{ const o=fig.view.explode[id] || {dx:0,dy:0}; return {dx:frac*o.dx,dy:frac*o.dy}; };

// The frame's own bounding box (figure units, y up): members (with their width), supports and balls, over both
// explode fractions, no arrows. With `frac` given, only that state.
export function frameBounds(fig, frac = null) {
  const box={x0:Infinity,x1:-Infinity,y0:Infinity,y1:-Infinity};
  const add=(x,y)=>{ box.x0=Math.min(box.x0,x); box.x1=Math.max(box.x1,x); box.y0=Math.min(box.y0,y); box.y1=Math.max(box.y1,y); };
  for (const f of frac===null ? [0,1] : [frac]) {
    for (const member of fig.members) {
      const o=explodeOffset(fig,member.id,f), r=member.width/2;
      for (const p of memberPoints(fig,member)) { add(p.x+o.dx-r,p.y+o.dy-r); add(p.x+o.dx+r,p.y+o.dy+r); }
    }
    for (const support of fig.supports) {
      const o=explodeOffset(fig,support.member,f), p=resolvePoint(fig,support.at); add(p.x+o.dx,p.y+o.dy);
    }
    for (const ball of fig.balls) {
      // a ball in a joint sits between its members, half way between their offsets; a support ball rides its member
      const joint=fig.joints.find(j=>j.name===ball.name), support=fig.supports.find(s=>s.name===ball.name);
      const offs=joint ? joint.members.map(id=>explodeOffset(fig,id,f)) : [explodeOffset(fig,support.member,f)];
      const dx=offs.reduce((n,o)=>n+o.dx,0)/offs.length, dy=offs.reduce((n,o)=>n+o.dy,0)/offs.length;
      add(ball.at.x+dx-ball.r,ball.at.y+dy-ball.r); add(ball.at.x+dx+ball.r,ball.at.y+dy+ball.r);
    }
  }
  return box;
}

// Every drawn force's head position at each explode fraction, and the extremes of its vector over every load the student can
// set (each load 0 or up to LOAD_CAP x nominal, 72 directions, independently). A force is linear in the loads, so the
// extreme of a sum over independent loads is the sum of each load's extreme. Arrow tails are head - vec * arrowPerForce.
function forceExtremes(fig) {
  const zero=Object.fromEntries(fig.loads.map(l=>[l.name,{x:0,y:0}]));
  const responses=fig.loads.map(load=>{
    const m=LOAD_CAP*Math.hypot(load.nominal.x,load.nominal.y);
    return Array.from({length:72},(_,i)=>{
      const a=i*Math.PI/36;
      return displayForces(fig,solve(fig,{...zero,[load.name]:{x:m*Math.cos(a),y:m*Math.sin(a)}}).forces);
    });
  });
  const base=displayForces(fig,solve(fig,zero).forces), out=[];
  for (const frac of [0,1]) base.forEach((force,i)=>{
    const o=explodeOffset(fig,force.member,frac);
    let loX=0, hiX=0, loY=0, hiY=0;
    for (const list of responses) {
      let a=0, b=0, c=0, d=0;
      for (const resp of list) { const v=resp[i].vec; a=Math.min(a,v.x); b=Math.max(b,v.x); c=Math.min(c,v.y); d=Math.max(d,v.y); }
      loX+=a; hiX+=b; loY+=c; hiY+=d;
    }
    out.push({hx:force.at.x+o.dx,hy:force.at.y+o.dy,loX,hiX,loY,hiY});
  });
  return out;
}
const extremesCache=new Map();
const extremes=fig=>{
  const key=`${fig.id}|${JSON.stringify(fig.view.explode)}`;
  if (!extremesCache.has(key)) extremesCache.set(key,forceExtremes(fig));
  return extremesCache.get(key);
};

// Todd's rule (2026-11-10, option B): the arrow scale is chosen so that the worst-case arrows stick out of the frame's
// own bounding box by at most ARROW_MARGIN x the frame's extent along that axis, on every side. It is the largest arrowPerForce
// with that property. Each figure stores the rule's value rounded down to 3 significant figures (a test checks it).
export const ARROW_MARGIN=0.2;
// A figure may set view.arrowMargin when the shared margin leaves its textbook-load arrow under the 24 px floor.
export function chooseArrowScale(fig, margin = fig.view.arrowMargin ?? ARROW_MARGIN) {
  const F=frameBounds(fig), mx=margin*(F.x1-F.x0), my=margin*(F.y1-F.y0);
  let s=Infinity;
  for (const {hx,hy,loX,hiX,loY,hiY} of extremes(fig)) {
    // tail x = hx - v*s for v in [loX,hiX]; it must stay within [F.x0-mx, F.x1+m] (likewise y)
    if (hiX>0) s=Math.min(s,(hx-(F.x0-mx))/hiX);
    if (loX<0) s=Math.min(s,((F.x1+mx)-hx)/-loX);
    if (hiY>0) s=Math.min(s,(hy-(F.y0-my))/hiY);
    if (loY<0) s=Math.min(s,((F.y1+my)-hy)/-loY);
  }
  return s;
}
export const roundDown3=v=>{ const e=Math.pow(10,Math.floor(Math.log10(v))-2); return Math.floor(v/e+1e-9)*e; };

// Bounding box (figure units, y up) of the frame and the tail of every arrow over every reachable load, combined and
// exploded.
export function contentBounds(fig) {
  const key=`${fig.id}|${fig.view.arrowPerForce}|${JSON.stringify(fig.view.explode)}`;
  if (boundsCache.has(key)) return boundsCache.get(key);
  const box={...frameBounds(fig)}, s=fig.view.arrowPerForce;
  const add=(x,y)=>{ box.x0=Math.min(box.x0,x); box.x1=Math.max(box.x1,x); box.y0=Math.min(box.y0,y); box.y1=Math.max(box.y1,y); };
  for (const {hx,hy,loX,hiX,loY,hiY} of extremes(fig)) {
    add(hx,hy);
    // the tail is the head minus vec * scale
    add(hx-hiX*s,hy-hiY*s); add(hx-loX*s,hy-loY*s);
  }
  boundsCache.set(key,box);
  return box;
}

export function hasOneSided(fig) {
  return [...fig.supports,...fig.joints].some(c=>c.oneSided);
}

// width, availableHeight in px. Returns the viewBox (SVG coordinates, y down), the scale in px per unit and the
// svg's height in px (shrunk to the content when the width is the limit, so a phone gets no empty space).
export function computeLayout(fig, width, availableHeight) {
  const B=contentBounds(fig), strip=hasOneSided(fig) ? STRIP_PX : 0, M=MARGIN_PX;
  const bw=Math.max(B.x1-B.x0,1e-6), bh=Math.max(B.y1-B.y0,1e-6);
  const scale=Math.max(1e-3,Math.min((width-2*M)/bw,(availableHeight-2*M-strip)/bh));
  const height=Math.min(availableHeight,bh*scale+2*M+strip);
  const vw=width/scale, vh=height/scale;
  const top=(height-strip-bh*scale)/2;
  return {viewBox:[(B.x0+B.x1)/2-vw/2,-B.y1-top/scale,vw,vh],scale,width,height};
}

// Label placement in SVG coordinates (y down), figure units.
//
// A label is a box. Candidate boxes sit on rings around the arrow's tail, on the
// side away from the arrow first, then turning round it; the first candidate that
// is inside the view and clear of every obstacle and of every earlier label wins.
// Obstacles are capsules (a segment with a radius; a circle has a === b) or plain
// boxes, so arrow shafts and heads, member bars (chains of capsules), handle rings
// and the lift-off line are all the same kind of thing. The rules are shared by
// all six figures: nothing here is figure-specific.
export function capsuleHitsBox(c, box) {
  const {a,b,r}=c;
  const dx=b.x-a.x, dy=b.y-a.y, len2=dx*dx+dy*dy;
  const x0=box.x, x1=box.x+box.w, y0=box.y, y1=box.y+box.h;
  // Sample the segment at a step below r: a capsule is thin.
  const step=Math.max(r*0.5,1e-6), n=len2===0 ? 0 : Math.min(400,Math.ceil(Math.sqrt(len2)/step));
  for (let i=0; i<=n; i++) {
    const t=n===0 ? 0 : i/n, px=a.x+dx*t, py=a.y+dy*t;
    const qx=Math.max(x0,Math.min(px,x1)), qy=Math.max(y0,Math.min(py,y1));
    if ((px-qx)**2+(py-qy)**2<r*r) return true;
  }
  return false;
}

// place(tail, away, width, height, gap, head, shaftGap) -> box. A label names its arrow, so it must sit by it: candidates
// are ordered by how far the box's nearest edge is from the arrow (`gap` from the tail, then ring by ring, and `gap`
// from the shaft at three places along it). The first clear one inside the view wins. If none is clear inside the view
// the nearest clear candidate outside it is used (and the browser harness reports that).
export function createLabelPlacer(bounds = null, obstacles = []) {
  const boxes=[];
  const overlaps=(a,b)=>a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
  // A capsule can only touch a box that meets its own bounding box (grown by its radius and an epsilon, as capsuleHitsBox's tangent test is rounding-sensitive): skip the sampling otherwise.
  const hull=obstacles.map(o=>o.box ? o.box : {x:Math.min(o.a.x,o.b.x)-o.r-1e-9,y:Math.min(o.a.y,o.b.y)-o.r-1e-9,
    w:Math.abs(o.a.x-o.b.x)+2*o.r+2e-9,h:Math.abs(o.a.y-o.b.y)+2*o.r+2e-9});
  const clear=box=>!boxes.some(b=>overlaps(box,b)) &&
    !obstacles.some((o,i)=>o.box ? overlaps(box,o.box) : overlaps(box,hull[i]) && capsuleHitsBox(o,box));
  const inside=box=>!bounds || (box.x>=bounds.x && box.y>=bounds.y &&
    box.x+box.w<=bounds.x+bounds.w && box.y+box.h<=bounds.y+bounds.h);
  // opts.exact: rank candidates by the box's true distance from `tail` (plus opts.bias x how far the direction turns from `away`, over
  // pi) instead of by ring, so a point letter ends up as near its point as the room allows.
  return function place(tail, away, width, height, gap, head = null, shaftGap = gap, opts = null) {
    const len=Math.hypot(away.x,away.y);
    const u=len ? {x:away.x/len,y:away.y/len} : {x:0,y:-1};
    const step=0.1*height, rings=opts?.rings ?? 20;
    // Box whose nearest edge is `distance` from `anchor` in direction d (a unit vector).
    const around=(anchor,d,distance)=>{
      const reach=Math.abs(d.x)*width/2+Math.abs(d.y)*height/2;
      return {x:anchor.x+d.x*(distance+reach)-width/2,y:anchor.y+d.y*(distance+reach)-height/2,w:width,h:height};
    };
    const angles=[0];
    for (let k=1; k<=23; k++) angles.push(k*Math.PI/24,-k*Math.PI/24);
    angles.push(Math.PI);
    if (opts?.exact) {
      // A ring's boxes are at least `gap + ring*step` from the point, so once a clear box beats the next ring's bound the search is over.
      let found=null, outside=null;
      for (let ring=0; ring<rings && !(found && gap+ring*step>=found.cost); ring++) {
        for (const angle of angles) {
          const d={x:u.x*Math.cos(angle)-u.y*Math.sin(angle),y:u.x*Math.sin(angle)+u.y*Math.cos(angle)};
          const box=around(tail,d,gap+ring*step);
          const cost=Math.hypot(Math.max(box.x-tail.x,0,tail.x-box.x-box.w),Math.max(box.y-tail.y,0,tail.y-box.y-box.h))+
            opts.bias*Math.abs(angle)/Math.PI;
          if (found && cost>=found.cost) continue;
          if (!clear(box)) continue;
          if (inside(box)) found={cost,box}; else if (!outside || cost<outside.cost) outside={cost,box};
        }
      }
      if (found) { boxes.push(found.box); return Object.assign(found.box,{cost:found.cost}); }
      const fallback=outside?.box ?? {x:tail.x-width/2,y:tail.y-height/2-gap,w:width,h:height};
      boxes.push(fallback);
      return Object.assign(fallback,{cost:Infinity});
    }
    // Candidates in the order (cost, then generation order), made lazily: two streams of rings, the tail's (cost gap + ring*step)
    // and the shaft's (cost shaftGap + ring*step), merged ring by ring. A ring's boxes share one cost, and within a ring the tail's
    // come before the shaft's, so whole rings compare by (cost, ring of the tail <= ring of the shaft). Most calls stop in the first
    // few rings, so the 20 x 61 boxes are not all built.
    let shaft=null;
    if (head) {
      const dx=head.x-tail.x, dy=head.y-tail.y, l=Math.hypot(dx,dy);
      if (l>0.7*height) shaft={dx,dy,n:{x:-dy/l,y:dx/l}};
    }
    const shaftAt=[0.15,0.3,0.45,0.6,0.75,0.9];
    let fallback=null, rt=0, rs=shaft ? 0 : rings;
    while (rt<rings || rs<rings) {
      const ct=gap+rt*step, cs=shaftGap+rs*step;
      const tailNext=rs>=rings || (rt<rings && (ct<cs || (ct===cs && rt<=rs)));
      const tried=[];
      if (tailNext) {
        for (const angle of angles) {
          const d={x:u.x*Math.cos(angle)-u.y*Math.sin(angle),y:u.x*Math.sin(angle)+u.y*Math.cos(angle)};
          tried.push(around(tail,d,ct));
        }
      } else {
        for (const t of shaftAt) for (const side of [1,-1]) {
          tried.push(around({x:tail.x+shaft.dx*t,y:tail.y+shaft.dy*t},{x:shaft.n.x*side,y:shaft.n.y*side},cs));
        }
      }
      const cost=tailNext ? ct : cs;
      if (tailNext) rt++; else rs++;
      for (const box of tried) {
        if (!clear(box)) continue;
        if (inside(box)) { boxes.push(box); return Object.assign(box,{cost}); }
        fallback ||= box;
      }
    }
    // Nothing fits inside the view: keep the labels apart and let the harness say so.
    if (!fallback) fallback={x:tail.x-width/2,y:tail.y-height/2-gap,w:width,h:height};
    boxes.push(fallback);
    return Object.assign(fallback,{cost:Infinity});
  };
}
