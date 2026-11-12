import { resolvePoint, sampleArc } from './geometry.js';
import { el, clearNode, toSvg, label, arrow, spokenText, PALETTE, PAIR_COLOURS } from './svg.js';
import { displayForces } from './solve.js';
import { LOAD_CAP } from './state.js';
import { createLabelPlacer, computeLayout, DEFAULT_WIDTH_PX, DEFAULT_HEIGHT_PX, PAGE_RESERVE_PX } from './layout.js';

// Sizes in screen px, at every viewport: text, arrowheads, strokes, handles and clearances are drawn as
// (px / scale) figure units, where scale (px per unit) comes from computeLayout(). Only the geometry and the
// arrows (length proportional to force) grow with the window. Label text is 16 px, its subscript 12.8 px,
// and a handle's hit circle is 46 px across.
export const LABEL_PX=16;
export const HANDLE_PX=23;
export const RING_PX=10;
// The focus halo drawn round a focused handle; labels keep clear of all of it.
export const HALO_PX=RING_PX+7;
// A point letter's box in em, and its clearance from the point in px (the pin dot is 5.8 px; the placer then moves it past the member's edge).
const LETTER_EM=[0.85,1.2];
const LETTER_GAP_PX=6;
const LETTER_NEAR_PX=13; // beyond its member's edge
const FAR_LETTER=3;      // score of a far letter: it outweighs a far force label or two
const LETTER_PAD_PX=1.5; // slack round the glyph box, so the measured text never touches what the placer cleared
const LETTER_BIAS_PX=3; // px of extra distance for a letter's side facing back toward its member, so it prefers the side away from it

export function memberOffset(fig, memberId, frac) {
  const offset=fig.view.explode[memberId] || {dx:0,dy:0};
  return {dx:frac*offset.dx,dy:frac*offset.dy};
}

export function loadHandlePos(fig, state, name, frac) {
  const load=fig.loads.find(l=>l.name===name);
  const at=resolvePoint(fig,load.at), offset=memberOffset(fig,load.member,frac), vec=state.loads[name];
  return {x:at.x+offset.dx-vec.x*fig.view.arrowPerForce,
    y:at.y+offset.dy-vec.y*fig.view.arrowPerForce};
}

function memberTransform(fig, id, frac) {
  const offset=memberOffset(fig,id,frac), p=toSvg({x:offset.dx,y:offset.dy});
  return `translate(${p.x} ${p.y})`;
}

function scenePath(fig, member) {
  return member.path.map(segment=>{
    const points=segment.seg==='arc' ? sampleArc(fig,segment,64) :
      [resolvePoint(fig,segment.from),resolvePoint(fig,segment.to)];
    return points.map((p,i)=>{ const s=toSvg(p); return `${i?'L':'M'} ${s.x} ${s.y}`; }).join(' ');
  }).join(' ');
}

function sceneCircle(parent, point, r, attrs = {}) {
  const p=toSvg(point);
  return el('circle',{cx:p.x,cy:p.y,r,fill:PALETTE.pin,stroke:PALETTE.pinOutline,...attrs},parent);
}

// A tan surface band, oriented independently of the force being applied.
function sceneGround(parent, at, normal, halfWidth, depth, surface) {
  const tangent={x:normal.y,y:-normal.x};
  const points=[[-halfWidth,0],[halfWidth,0],[halfWidth,-depth],[-halfWidth,-depth]].map(([s,t])=>{
    const p=toSvg({x:at.x+tangent.x*s+normal.x*t,y:at.y+tangent.y*s+normal.y*t});
    return `${p.x},${p.y}`;
  });
  el('polygon',{points:points.join(' '),fill:PALETTE.ground,class:'ground','data-surface':surface},parent);
  return boxOf(points.map(p=>{ const [x,y]=p.split(',').map(Number); return {x,y}; }));
}

function boxOf(points) {
  const xs=points.map(p=>p.x), ys=points.map(p=>p.y);
  return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
}

function supportMounts(fig, sol, px) {
  const mounts=fig.supports.map(support=>{
    const normal=support.surface==='wall-left'?{x:1,y:0}:{x:0,y:1};
    const at=resolvePoint(fig,support.drawAt?.[support.member] || support.at);
    const gap=sol.liftOff.includes(support.name)?0.16+0.75/px:0;
    const ball=fig.balls.find(b=>b.name===support.name);
    // A ball keeps resting on the floor when its contact lets go, so the floor does not move: the ball shrinks
    // by `gap` (its underside stays put, its top drops `gap` below the member). A roller is too small to shrink,
    // so it drops by `gap` instead and carries its floor with it.
    const radius=ball?ball.r-gap/2:support.kind==='pin'?8/px:6.5/px;
    const centre=ball?{x:ball.at.x-normal.x*gap/2,y:ball.at.y-normal.y*gap/2}:
      {x:at.x-normal.x*(radius+gap),y:at.y-normal.y*(radius+gap)};
    const base=support.kind==='pin'?{x:at.x-2*radius*normal.x,y:at.y-2*radius*normal.y}:
      {x:centre.x-normal.x*radius,y:centre.y-normal.y*radius};
    return {support,normal,at,radius,centre,base};
  });
  // Supports of the same orientation share a surface. A short mounting pad
  // bridges differing bracket heights, rather than drawing separate floors.
  for (const mount of mounts) {
    const {normal,base,support}=mount;
    const plane=Math.min(...mounts.filter(m=>m.support.surface===support.surface)
      .map(m=>m.base.x*normal.x+m.base.y*normal.y));
    const extension=plane-base.x*normal.x-base.y*normal.y;
    mount.foot={x:base.x+normal.x*extension,y:base.y+normal.y*extension};
  }
  return mounts;
}

function drawSurfaces(parent, fig, mounts, frac, px) {
  // One interval along each support's surface. Combined, supports on one plane share one band: each
  // interval reaches halfway to its neighbours, so they meet. Exploded members carry their own piece of
  // the surface with them: pieces that still touch or overlap are one band, and the rest are drawn apart.
  const info=mounts.map(mount=>{
    const {normal,foot,radius,support}=mount;
    const at0=foot.x*normal.y-foot.y*normal.x, plane0=foot.x*normal.x+foot.y*normal.y;
    return {mount,at0,key0:`${support.surface}:${plane0.toFixed(12)}`,margin:Math.max(radius*1.6,20/px)};
  });
  const intervals=[];
  for (const item of info) {
    const {normal,foot,support}=item.mount;
    const mates=info.filter(o=>o!==item && o.key0===item.key0);
    const below=mates.filter(o=>o.at0<item.at0).map(o=>(item.at0-o.at0)/2);
    const above=mates.filter(o=>o.at0>item.at0).map(o=>(o.at0-item.at0)/2);
    const offset=memberOffset(fig,support.member,frac);
    const point={x:foot.x+offset.dx,y:foot.y+offset.dy};
    const plane=point.x*normal.x+point.y*normal.y;
    const along=point.x*normal.y-point.y*normal.x;
    intervals.push({key:`${support.surface}:${plane.toFixed(12)}`,normal,plane,surface:support.surface,
      lo:along-(below.length ? Math.max(item.margin,Math.min(...below)) : item.margin),
      hi:along+(above.length ? Math.max(item.margin,Math.min(...above)) : item.margin)});
  }
  intervals.sort((a,b)=>a.key<b.key ? -1 : a.key>b.key ? 1 : a.lo-b.lo);
  const pieces=[];
  for (const band of intervals) {
    const last=pieces[pieces.length-1];
    if (last && last.key===band.key && band.lo<=last.hi+1e-9) last.hi=Math.max(last.hi,band.hi);
    else pieces.push({...band});
  }
  return pieces.map(({normal,plane,surface,lo,hi})=>{
    const middle=(lo+hi)/2;
    return sceneGround(parent,{x:normal.x*plane+normal.y*middle,y:normal.y*plane-normal.x*middle},
      normal,(hi-lo)/2,8/px,surface);
  });
}

function drawSupport(parent, fig, mount, frac, px) {
  const {support,normal,at,base,foot,radius,centre}=mount;
  const group=el('g',{class:'g support','data-name':support.name,'data-member':support.member,
    transform:memberTransform(fig,support.member,frac)},parent);
  const tangent={x:normal.y,y:-normal.x};
  const side=(p,sign)=>toSvg({x:p.x+sign*tangent.x*radius,y:p.y+sign*tangent.y*radius});
  const offset=memberOffset(fig,support.member,frac), boxes=[];
  const shifted=points=>boxOf(points.map(p=>({x:p.x+offset.dx,y:p.y-offset.dy})));
  if (Math.hypot(base.x-foot.x,base.y-foot.y)>1e-9) {
    boxes.push(shifted([side(base,-1),side(base,1),side(foot,1),side(foot,-1)]));
    const points=[side(base,-1),side(base,1),side(foot,1),side(foot,-1)];
    el('polygon',{class:'support-pad',points:points.map(p=>`${p.x},${p.y}`).join(' '),
      fill:PALETTE.pin,stroke:PALETTE.pinOutline,'stroke-width':1.5/px},group);
  }
  if (support.kind==='pin') {
    const top=toSvg(at), left=side(base,-1), right=side(base,1);
    boxes.push(shifted([top,left,right]));
    el('polygon',{class:'support-pin',points:`${top.x},${top.y} ${left.x},${left.y} ${right.x},${right.y}`,
      fill:PALETTE.pin,stroke:PALETTE.pinOutline,'stroke-width':1.5/px},group);
  } else if (support.label!=='Ball') {
    sceneCircle(group,centre,radius,{class:'roller','data-name':support.name,'stroke-width':1.5/px});
    const c=toSvg(centre);
    boxes.push(shifted([{x:c.x-radius,y:c.y-radius},{x:c.x+radius,y:c.y+radius}]));
  }
  return boxes;
}

function drawBalls(parent, fig, sol, frac, mounts, px) {
  const obstacles=[], circles=[];
  for (const ball of fig.balls) {
    const joint=fig.joints.find(j=>j.name===ball.name);
    const support=fig.supports.find(s=>s.name===ball.name);
    const lifted=sol.liftOff.includes(ball.name);
    const gap=0.16+0.75/px; // include half the ball outline
    let centre={...ball.at}, radius=ball.r;
    if (joint) {
      // A free ball between the separated arms, not a child of either member.
      const offsets=joint.members.map(id=>memberOffset(fig,id,frac));
      centre.x+=offsets.reduce((n,p)=>n+p.dx,0)/offsets.length;
      centre.y+=offsets.reduce((n,p)=>n+p.dy,0)/offsets.length;
      // Inset the contact symbol on loss of equilibrium to show both gaps
      // without moving the members or changing the statics geometry.
      if (lifted) radius=Math.max(0.05,radius-gap);
    } else if (support) {
      const mount=mounts.find(m=>m.support===support);
      centre={...mount.centre}; radius=mount.radius;
      const offset=memberOffset(fig,support.member,frac);
      centre.x+=offset.dx; centre.y+=offset.dy;
    }
    sceneCircle(parent,centre,radius,{class:'ball','data-name':ball.name,'stroke-width':1.5/px});
    const c=toSvg(centre);
    obstacles.push({a:c,b:c,r:radius+1.75/px}); // outline plus one pixel of label clearance
    circles.push({name:ball.name,c,r:radius+0.75/px}); // with half the outline, as the harness measures it
  }
  return {obstacles,circles};
}

function forcePoint(fig, force, frac) {
  const offset=memberOffset(fig,force.member,frac);
  return {x:force.at.x+offset.dx,y:force.at.y+offset.dy};
}

// Every force is F + subscript, never a bare joint letter: pin and support components F_Ax, F_Ay; the force of a two-force
// member F_B (named for the joint); a roller or ball normal force N_E. Loads stay P and Q. A subscript carries its spoken form.
export function forceSegs(force) {
  if (force.role==='load') return [{t:force.name}];
  if (force.role==='normal') return [{t:'N'},{t:force.name,sub:true}];
  if (force.role==='link') return [{t:'F'},{t:force.name,sub:true}];
  return [{t:'F'},{t:force.name+force.sub,sub:true,say:`${force.name} ${force.sub}`}];
}

// The hue of a third-law pair: one per joint, in the figure's joint order.
export function pairColour(fig, name) {
  return PAIR_COLOURS[Math.max(0,fig.joints.findIndex(j=>j.name===name))%PAIR_COLOURS.length];
}

// "N_F lifts off: no equilibrium." as label segments (real subscripts on screen); liftOffText is its spoken form
// ("N sub F lifts off: no equilibrium.") for the status region and the aria-label.
// The reserved box of a force label in em: wider for a two-letter subscript (F_Ax), taller when anything is lowered.
function labelEm(force) {
  if (force.role==='load') return [0.8,1.2];
  return [(forceSegs(force).find(g=>g.sub)?.t.length ?? 0)>1 ? 1.55 : 1.2,1.45];
}

export function liftOffSegs(fig, sol) {
  if (sol.ok) return [];
  const segs=[];
  sol.liftOff.forEach((name,i)=>{
    if (i>0) segs.push({t:' and '});
    segs.push({t:'N'},{t:name,sub:true});
  });
  segs.push({t:` ${sol.liftOff.length===1?'lifts':'lift'} off: no equilibrium.`});
  return segs;
}
export function liftOffText(fig, sol) {
  return spokenText(liftOffSegs(fig,sol));
}

// ---- point letters ------------------------------------------------------------------------------------------------------
// Every key of fig.points that is one capital letter is a lettered point (helper points such as upperBend are not).
export const isLetterPoint=name=>/^[A-Z]$/.test(name);

// The members that carry a point, in the order joints, supports, loads (named by the point or located at it), then, only if
// none of those, any member whose path starts or ends there. [] when no member carries it.
export function pointCarriers(fig, name) {
  const p=resolvePoint(fig,name), same=at=>typeof at==='string' ? at===name : at.x===p.x && at.y===p.y;
  const ids=[...fig.joints.filter(j=>j.name===name || same(j.at)).flatMap(j=>j.members),
    ...fig.supports.filter(s=>s.name===name || same(s.at)).map(s=>s.member),
    ...fig.loads.filter(l=>same(l.at)).map(l=>l.member)];
  if (!ids.length) for (const m of fig.members) {
    if (m.path.some(s=>s.from===name || s.to===name)) ids.push(m.id);
  }
  return [...new Set(ids)];
}

// Where a member's copy of a point is drawn (figure units, y up, before the explode offset). A ball touches its members at
// the joint's drawAt, so its letter goes there; everything else is lettered at the point itself.
export function pointAnchor(fig, name, member) {
  const contact=[...fig.joints,...fig.supports].find(c=>c.name===name && c.drawAt?.[member] && fig.balls.some(b=>b.name===name));
  return resolvePoint(fig,contact ? contact.drawAt[member] : name);
}

function loadDirectionText(vec) {
  if (vec.x===0 && vec.y===0) return 'zero';
  const vertical=vec.y>0 ? 'up' : vec.y<0 ? 'down' : '';
  const horizontal=vec.x>0 ? 'right' : vec.x<0 ? 'left' : '';
  return `pointing ${vertical && horizontal ? `${vertical} and to the ${horizontal}` : vertical || horizontal}`;
}

// The svg fills the width of its column and the height the window leaves; the viewBox is chosen so that one unit is
// `scale` px in both directions. Without a layout engine (the Node tests) a phone-sized column is assumed.
export function render(svgEl, fig, state, sol, frac) {
  clearNode(svgEl);
  const width=svgEl.clientWidth>0 ? svgEl.clientWidth : DEFAULT_WIDTH_PX;
  const inner=globalThis.innerHeight>0 ? globalThis.innerHeight-PAGE_RESERVE_PX : DEFAULT_HEIGHT_PX;
  const layout=computeLayout(fig,width,Math.max(200,inner)), px=layout.scale;
  const [x,y,w,h]=layout.viewBox;
  svgEl.setAttribute('viewBox',layout.viewBox.join(' '));
  svgEl.setAttribute('style',`height:${layout.height}px`);
  svgEl.setAttribute('data-scale',px);
  svgEl.setAttribute('role','group');
  svgEl.setAttribute('aria-label',`Frame ${fig.id} and its forces`);

  const mounts=supportMounts(fig,sol,px);
  const surfaces=el('g',{class:'g surfaces'},svgEl);
  drawSurfaces(surfaces,fig,mounts,frac,px); // a label may sit on the tan wall or floor band; it keeps clear of support glyphs
  const fixed=[];
  const supports=el('g',{class:'g supports'},svgEl);
  for (const mount of mounts) for (const box of drawSupport(supports,fig,mount,frac,px)) fixed.push({box});
  for (const member of fig.members) {
    const group=el('g',{class:'g member','data-member':member.id,transform:memberTransform(fig,member.id,frac)},svgEl);
    const d=scenePath(fig,member);
    // The specified member width includes the outline, so drawAt describes
    // the visible outer surface exactly.
    for (const [stroke,width] of [[PALETTE.outline,member.width],[PALETTE.member,Math.max(member.width*0.5,member.width-4/px)]]) {
      el('path',{d,fill:'none',stroke,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round'},group);
    }
  }
  const pins=el('g',{class:'g pins'},svgEl);
  for (const connection of [...fig.supports,...fig.joints]) {
    if (connection.kind!=='pin') continue;
    const ids=connection.members || [connection.member];
    for (const id of ids) {
      const at=resolvePoint(fig,connection.at), offset=memberOffset(fig,id,frac);
      sceneCircle(pins,{x:at.x+offset.dx,y:at.y+offset.dy},5/px,{class:'pin','stroke-width':1.5/px});
    }
  }

  const balls=el('g',{class:'g balls'},svgEl);
  const {obstacles:ballObstacles,circles:ballCircles}=drawBalls(balls,fig,sol,frac,mounts,px);
  const size=LABEL_PX/px, drawn=[];
  for (const force of displayForces(fig,sol.forces)) {
    if (force.kind==='pin' && frac===0) continue;
    const greyed=!sol.ok && force.kind!=='load';
    const lost=force.unilateral && sol.liftOff.includes(force.name);
    const colour=greyed ? PALETTE.greyed : force.kind==='pin' ? pairColour(fig,force.name) : PALETTE[force.kind];
    const group=el('g',{class:`g force ${force.kind==='pin'?'pin':force.kind}-force${greyed?' greyed':''}`,
      'data-name':force.name,'data-sub':force.sub,'data-member':force.member,'data-role':force.role,
      opacity:force.kind==='pin'?frac:1},svgEl);
    const at=forcePoint(fig,force,frac), head=toSvg(at);
    const vec=lost?{x:0,y:0}:force.vec;
    const tail=toSvg({x:at.x-vec.x*fig.view.arrowPerForce,y:at.y-vec.y*fig.view.arrowPerForce});
    const zero=vec.x===0 && vec.y===0;
    if (zero) {
      el('circle',{cx:head.x,cy:head.y,r:5/px,class:'zero',fill:'none',stroke:colour,
        'stroke-width':1.5/px,'stroke-dasharray':`${4/px} ${3/px}`,opacity:0.5},group);
    } else arrow(group,tail,head,{fill:colour,width:3/px,head:11/px});
    drawn.push({force,colour,tail,head,zero});
  }
  // Everything a label must stay clear of: every arrow (shaft and head), every
  // member bar, ball, handle ring and the lift-off line.
  const pad=1/px; // clearance around grounds and supports
  const obstacles=fixed.map(({box})=>({box:{x:box.x-pad,y:box.y-pad,w:box.w+2*pad,h:box.h+2*pad}}));
  obstacles.push(...ballObstacles);
  // The joint pins drawn on the members.
  for (const connection of [...fig.supports,...fig.joints]) {
    if (connection.kind!=='pin') continue;
    for (const id of connection.members || [connection.member]) {
      const at=resolvePoint(fig,connection.at), o=memberOffset(fig,id,frac), c=toSvg({x:at.x+o.dx,y:at.y+o.dy});
      obstacles.push({a:c,b:c,r:5.8/px});
    }
  }
  for (const {tail,head,zero} of drawn) {
    if (zero) { obstacles.push({a:head,b:head,r:6/px}); continue; }
    const len=Math.hypot(head.x-tail.x,head.y-tail.y), headLen=Math.min(11/px,len*0.45), k=headLen/len;
    const base={x:head.x+(tail.x-head.x)*k,y:head.y+(tail.y-head.y)*k};
    obstacles.push({a:tail,b:base,r:2.2/px},{a:base,b:head,r:5.4/px});
  }
  for (const member of fig.members) {
    const offset=memberOffset(fig,member.id,frac), pts=[];
    for (const segment of member.path) {
      const raw=segment.seg==='arc' ? sampleArc(fig,segment,32) :
        [resolvePoint(fig,segment.from),resolvePoint(fig,segment.to)];
      for (const p of raw) pts.push(toSvg({x:p.x+offset.dx,y:p.y+offset.dy}));
    }
    for (let i=1; i<pts.length; i++) obstacles.push({a:pts[i-1],b:pts[i],r:member.width/2+1/px});
  }
  for (const load of fig.loads) {
    const p=toSvg(loadHandlePos(fig,state,load.name,frac));
    obstacles.push({a:p,b:p,r:(HALO_PX+1)/px});
  }
  if (!sol.ok) {
    // About 0.55 em per character is generous for the system font.
    const text=liftOffSegs(fig,sol).map(g=>g.t).join(''), w=text.length*0.55*16/px;
    obstacles.push({box:{x:x+12/px,y:y+h-12/px-16/px,w,h:21/px}});
  }
  // Place every label beside its own arrow. Labels are placed one after another, so an early one can take the only spot
  // a later one could use: try a few orders and keep the one that leaves the fewest labels far from their arrows.
  const nearPx=16/px;
  // A contact force drawn inside its own ball is owned by the arrow and the ball's outline together (the harness measures the
  // same union): its label hugs the ball, on the side away from the arrowhead, clear of a floor band under it.
  const requests=drawn.map(({force,tail,head,zero})=>({force,tail,head,zero,
    away:{x:tail.x-head.x,y:tail.y-head.y},len:Math.hypot(head.x-tail.x,head.y-tail.y),
    ball:zero ? null : ballCircles.find(b=>b.name===force.name && Math.hypot(tail.x-b.c.x,tail.y-b.c.y)<b.r)}));
  // Point letters: one per carrying member (a split pin shows its letter beside each half); the copies after the first fade in
  // with the explode fraction, like pin forces, and are not drawn at all when combined.
  const letters=[];
  for (const name of Object.keys(fig.points).filter(isLetterPoint)) {
    const carriers=pointCarriers(fig,name), copies=carriers.length ? carriers : [null];
    const centroid=id=>{
      const m=fig.members.find(q=>q.id===id), o=memberOffset(fig,id,frac), pts=m.path.flatMap(segment=>segment.seg==='arc' ?
        sampleArc(fig,segment,16) : [resolvePoint(fig,segment.from),resolvePoint(fig,segment.to)]);
      return toSvg({x:pts.reduce((n,q)=>n+q.x,0)/pts.length+o.dx,y:pts.reduce((n,q)=>n+q.y,0)/pts.length+o.dy});
    };
    copies.forEach((member,i)=>{
      if (i>0 && frac===0) return;
      const o=member ? memberOffset(fig,member,frac) : {dx:0,dy:0}, p=pointAnchor(fig,name,member);
      const at=toSvg({x:p.x+o.dx,y:p.y+o.dy});
      // aim away from the member it belongs to (combined: away from all the members that meet there)
      const from=(frac===0 ? copies : [member]).filter(Boolean).map(centroid);
      const mid=from.length ? {x:from.reduce((n,q)=>n+q.x,0)/from.length,y:from.reduce((n,q)=>n+q.y,0)/from.length} : at;
      letters.push({name,member,first:i===0,at,away:{x:at.x-mid.x,y:at.y-mid.y},bar:member ? fig.members.find(q=>q.id===member).width/2 : 0});
    });
  }
  const attempt=(order,lettersFirst=false,reverse=false)=>{
    const place=createLabelPlacer({x,y,w,h},obstacles), result=new Array(requests.length);
    let score=0;
    // Letters: each clear of everything placed so far and as near its point as the room allows. A letter more than LETTER_NEAR_PX
    // beyond its member's edge counts as far, like a force label far from its arrow.
    const placeLetters=()=>{
      const boxes=new Array(letters.length);
      for (const j of reverse ? letters.map((_,k)=>letters.length-1-k) : letters.map((_,k)=>k)) {
        const {at,away,bar}=letters[j];
        const box=place(at,away,size*LETTER_EM[0]+2*LETTER_PAD_PX/px,size*LETTER_EM[1]+2*LETTER_PAD_PX/px,LETTER_GAP_PX/px,null,undefined,
          {exact:true,bias:LETTER_BIAS_PX/px});
        score+=box.cost-bar>LETTER_NEAR_PX/px ? FAR_LETTER+Math.min(box.cost,1e3)/1e4 : 0;
        boxes[j]=box;
      }
      return boxes;
    };
    const early=lettersFirst ? placeLetters() : null;
    for (const i of order) {
      const {force,tail,head,zero,away,ball}=requests[i];
      const [wide,tall]=labelEm(force);
      // 6 px from the shaft; a load's label clears its handle ring at the tail.
      const box=ball ? place(ball.c,away,size*wide,size*tall,ball.r+10/px) :
        place(tail,away,size*wide,size*tall,(force.kind==='load'?HALO_PX+1.5:6)/px,zero ? null : head,6/px);
      result[i]=box; score+=box.cost>nearPx ? 1+Math.min(box.cost,1e3)/1e4 : 0;
    }
    return {result,letterBoxes:early ?? placeLetters(),score};
  };
  const indices=requests.map((_,i)=>i);
  const orders=[indices,[...indices].reverse(),[...indices].sort((a,b)=>requests[a].len-requests[b].len),
    [...indices].sort((a,b)=>requests[b].len-requests[a].len),
    // loads first (their labels must also clear the handle halo), then the rest, and the reverse of each
    [...indices].sort((a,b)=>(requests[b].force.kind==='load')-(requests[a].force.kind==='load')),
    [...indices].sort((a,b)=>(requests[a].force.kind==='load')-(requests[b].force.kind==='load')),
    indices.map((_,i)=>indices[(i+Math.floor(indices.length/2))%indices.length])];
  let best=null;
  for (const order of orders) {
    const tried=attempt(order);
    if (!best || tried.score<best.score) best=tried;
    if (best.score===0) break;
  }
  // Fallback, taken only when a letter ended far from its point (a crowded point whose room the force labels took): retry with the
  // letters placed before the force labels, forward then reversed. Most renders never get here.
  if (best.score>=FAR_LETTER) retry: for (const reverse of [false,true]) for (const order of orders) {
    const tried=attempt(order,true,reverse);
    if (tried.score<best.score) best=tried;
    if (best.score<FAR_LETTER) break retry;
  }
  const letterBoxes=best.letterBoxes;
  const pendingLabels=requests.map(({force},i)=>({force,box:best.result[i],colour:drawn[i].colour}));
  // Labels are a final overlay: even the last force's arrow paints below every
  // label. Preserve their original slot calculation, identity and pin fade.
  const labels=el('g',{class:'g labels'},svgEl);
  for (const {force,box,colour} of pendingLabels) {
    const group=el('g',{class:'force-label','data-name':force.name,'data-sub':force.sub,
      'data-member':force.member,'data-role':force.role,opacity:force.kind==='pin'?frac:1},labels);
    // Centred in its box, so the text sits as near the arrow as the box does.
    label(group,box.x+box.w/2,box.y+(force.role==='load'?0.905:0.935)*size,forceSegs(force),{size,fill:colour,anchor:'middle'});
  }
  letters.forEach(({name,member,first},i)=>{
    const box=letterBoxes[i];
    const group=el('g',{class:'point-label','data-point':name,'data-member':member,opacity:first ? 1 : frac},labels);
    label(group,box.x+box.w/2,box.y+LETTER_PAD_PX/px+0.905*size,[{t:name}],{size,fill:PALETTE.letter,anchor:'middle',plain:true});
  });
  label(labels,x+12/px,y+h-12/px,liftOffSegs(fig,sol),{id:'liftoff',size:16/px,plain:true});
  const handles=el('g',{class:'g handles'},svgEl);
  for (const load of fig.loads) {
    const p=toSvg(loadHandlePos(fig,state,load.name,frac));
    // The hit circle is the focusable slider; the ring and halo that follow it
    // are drawn for the eye (CSS lights them from the hit circle's state).
    el('circle',{cx:p.x,cy:p.y,r:HANDLE_PX/px,class:`handle${state.held===load.name?' is-held':''}`,
      'data-load':load.name,tabindex:0,role:'slider',
      'aria-label':`Load ${load.name}, drag to change size and direction`,
      // valuenow is the size as a whole percent of this load's nominal (a number, so it is not in the spoken-text scan).
      'aria-valuenow':Math.round(100*Math.hypot(state.loads[load.name].x,state.loads[load.name].y)/Math.hypot(load.nominal.x,load.nominal.y)),
      'aria-valuemin':0,'aria-valuemax':100*LOAD_CAP,
      'aria-valuetext':loadDirectionText(state.loads[load.name]),
      fill:'transparent',stroke:PALETTE.load,'stroke-width':1.5/px},handles);
    el('circle',{cx:p.x,cy:p.y,r:RING_PX/px,class:'handle-ring','stroke-width':3/px,
      fill:'none',stroke:PALETTE.load,'pointer-events':'none'},handles);
    el('circle',{cx:p.x,cy:p.y,r:HALO_PX/px,class:'handle-halo','stroke-width':3/px,
      fill:'none','pointer-events':'none'},handles);
  }
}
