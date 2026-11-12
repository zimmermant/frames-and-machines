import test from 'node:test';
import assert from 'node:assert/strict';
import { render, memberOffset, loadHandlePos, HANDLE_PX, RING_PX, pointCarriers, pointAnchor } from '../src/scene.js';
import { toSvg, fromSvg } from '../src/svg.js';
import { createLabelPlacer, capsuleHitsBox } from '../src/layout.js';
import { solve, displayForces, twoForceMembers } from '../src/solve.js';
import { resolvePoint } from '../src/geometry.js';
import { PALETTE, PAIR_COLOURS } from '../src/svg.js';
import { nearestPoint } from '../src/geometry.js';
import { figures, nominal, draw, nodes, byClass, byTag, attr, endpoints, forceLabel, contrastOnWhite, forceColour } from './scene-helpers.js';

const close = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);

const scaleOf=svg=>+svg.getAttribute('data-scale'); // px per figure unit the scene was drawn at

test('every drawn arrow uses the figure scale for loads, reactions and pin forces', () => {
  const kinds=new Set();
  let checked=0;
  for (const fig of figures) for (const frac of [0,0.4,1]) for (const multiplier of [0,0.05,1,1.5]) for (const degrees of [0,35,90,215]) {
    const angle=degrees*Math.PI/180;
    const loads=Object.fromEntries(fig.loads.map(l=>[l.name,{
      x:(l.nominal.x*Math.cos(angle)-l.nominal.y*Math.sin(angle))*multiplier,
      y:(l.nominal.x*Math.sin(angle)+l.nominal.y*Math.cos(angle))*multiplier
    }]));
    const sol=solve(fig,loads), svg=draw(fig,loads,frac), shown=displayForces(fig,sol.forces);
    for (const group of byClass(svg,'force')) {
      const force=shown.find(f=>f.name===attr(group,'data-name') && (f.sub||null)===(attr(group,'data-sub')||null) && f.member===attr(group,'data-member') && f.role===attr(group,'data-role'));
      assert.ok(force);
      if (force.unilateral && sol.liftOff.includes(force.name)) {
        assert.equal(endpoints(group),null,'a lifted contact has a zero marker, not an arrow');
        continue;
      }
      const p=endpoints(group), length=p ? Math.hypot(p.head.x-p.tail.x,p.head.y-p.tail.y) : 0;
      assert.ok(Math.abs(length-Math.hypot(force.vec.x,force.vec.y)*fig.view.arrowPerForce)<=1e-6,
        `figure ${fig.id}, ${force.kind} ${force.name}${force.sub||''}, frac ${frac}, load ${multiplier}`);
      kinds.add(force.kind); checked++;
    }
  }
  assert.deepEqual([...kinds].sort(),['load','pin','reaction']);
  assert.ok(checked>2000);
});

test('handle aria-valuetext speaks directions without numbers and says zero at zero magnitude', () => {
  const directions=[
    [0,0,'zero'],[1,0,'pointing right'],[-1,0,'pointing left'],[0,1,'pointing up'],[0,-1,'pointing down'],
    [1,1,'pointing up and to the right'],[-1,1,'pointing up and to the left'],
    [1,-1,'pointing down and to the right'],[-1,-1,'pointing down and to the left']
  ];
  for (const fig of figures) for (const [x,y,spoken] of directions) {
    const loads=Object.fromEntries(fig.loads.map(l=>[l.name,{x,y}]));
    for (const handle of byClass(draw(fig,loads),'handle')) {
      assert.equal(attr(handle,'aria-valuetext'),spoken);
      assert.doesNotMatch(attr(handle,'aria-valuetext'),/\d/);
    }
  }
});

test('figure four force labels clear both balls, including the lifted D zero marker', () => {
  const fig=figures[3];
  for (const frac of [0,0.5,1]) for (const loads of [nominal(fig),{P:{x:0,y:120}},{P:{x:-120,y:-40}}]) {
    const svg=draw(fig,loads,frac);
    for (const group of byClass(svg,'force-label')) {
      const text=byTag(group,'text')[0], size=+attr(text,'font-size'), subs=byTag(text,'tspan').filter(n=>+attr(n,'dy')>0);
      // The reserved text envelope includes the italic letter and any lowered subscript (wider for a two-letter one).
      const w=size*(!subs.length?0.8:subs[0].textContent.length>1?1.55:1.2), h=size*(subs.length?1.45:1.2);
      const box={x:+attr(text,'x')-w/2,y:+attr(text,'y')-(subs.length?0.935:0.905)*size,w,h};
      for (const ball of byClass(svg,'ball')) {
        const c={x:+attr(ball,'cx'),y:+attr(ball,'cy')}, r=+attr(ball,'r')+ +attr(ball,'stroke-width')/2;
        assert.equal(capsuleHitsBox({a:c,b:c,r},box),false,
          `${attr(group,'data-name')} label touches ball ${attr(ball,'data-name')}, frac ${frac}`);
      }
    }
  }
});

test('figure four D label stays near its arrow and clear of its ball at all viewport sizes', () => {
  const fig=figures[3], oldHeight=globalThis.innerHeight;
  try {
    for (const [width,height] of [[375,812],[800,750],[1280,720]]) {
      globalThis.innerHeight=height;
      const svg=draw(fig); svg.clientWidth=width-8;
      for (const frac of [0,1]) for (const magnitude of [0,0.5,1]) for (let degrees=0;degrees<360;degrees+=5) {
        const angle=degrees*Math.PI/180, loads={P:{x:120*magnitude*Math.cos(angle),y:120*magnitude*Math.sin(angle)}};
        render(svg,fig,{loads,held:null},solve(fig,loads),frac);
        const group=byClass(svg,'reaction-force').find(g=>attr(g,'data-name')==='D'), t=forceLabel(svg,group);
        const px=scaleOf(svg), size=+attr(t,'font-size');
        // Reserved envelope of N + subscript D (every force label but a load's has a subscript now): actual browser glyphs
        // and the unchanged 18 px limit are also checked by the harness.
        const box={x:+attr(t,'x')-0.6*size,y:+attr(t,'y')-0.935*size,w:1.2*size,h:1.45*size};
        const p=endpoints(group), ring=byClass(group,'zero')[0];
        const x=p?p.head.x:+attr(ring,'cx'), y0=p?Math.min(p.head.y,p.tail.y):+attr(ring,'cy'), y1=p?Math.max(p.head.y,p.tail.y):y0;
        let distance=Math.hypot(Math.max(box.x-x,x-box.x-box.w,0),Math.max(box.y-y1,y0-box.y-box.h,0))*px-(p?0:5);
        // The harness's ownership rule: an arrow drawn inside its own ball is owned by the arrow and the ball's outline.
        const ballD=byClass(svg,'ball').find(n=>attr(n,'data-name')==='D'), bc={x:+attr(ballD,'cx'),y:+attr(ballD,'cy')};
        const br=+attr(ballD,'r')+ +attr(ballD,'stroke-width')/2;
        if (p && Math.hypot(p.tail.x-bc.x,p.tail.y-bc.y)<br)
          distance=Math.min(distance,Math.max(0,Math.hypot(Math.max(box.x-bc.x,bc.x-box.x-box.w,0),Math.max(box.y-bc.y,bc.y-box.y-box.h,0))-br)*px);
        assert.ok(distance<=18,`${width}x${height}, frac ${frac}, ${magnitude}x at ${degrees}: ${distance} px`);
        for (const ball of byClass(svg,'ball')) {
          const c={x:+attr(ball,'cx'),y:+attr(ball,'cy')}, r=+attr(ball,'r')+ +attr(ball,'stroke-width')/2;
          assert.equal(capsuleHitsBox({a:c,b:c,r},box),false);
        }
      }
    }
  } finally {
    if (oldHeight===undefined) delete globalThis.innerHeight;
    else globalThis.innerHeight=oldHeight;
  }
});

test('combined view shows only loads and reactions and redraw clears old pins', () => {
  for (const fig of figures) {
    const svg = draw(fig, nominal(fig), 1);
    render(svg, fig, {loads:nominal(fig),held:null}, solve(fig,nominal(fig)), 0);
    assert.equal(byClass(svg,'pin-force').length, 0);
    assert.equal(byClass(svg,'load-force').length, fig.loads.length);
    // a pin support is two component arrows, except on a two-force member, where it is one arrow along the member
    const links=twoForceMembers(fig);
    assert.equal(byClass(svg,'reaction-force').length, fig.supports.reduce((n,s) => n+(s.kind==='pin' && !links.includes(s.member)?2:1),0));
    assert.ok(svg.children.filter(n => n.tag==='g').every(n => n.classList.contains('g')));
  }
});

test('exploded pin pairs have equal and opposite SVG arrow vectors and fade with frac', () => {
  for (const fig of figures) {
    const forces = byClass(draw(fig, nominal(fig), 1),'pin-force');
    const links=twoForceMembers(fig);
    // a pin is 2 components on each of its 2 members; where either member is a two-force member, one arrow on each
    assert.equal(forces.length, fig.joints.reduce((n,j) => n+(j.kind!=='pin' || j.members.some(m => links.includes(m))?2:4),0));
    const pairs = Map.groupBy(forces, n => attr(n,'data-name')+(attr(n,'data-sub')||''));
    for (const pair of pairs.values()) {
      assert.equal(pair.length,2);
      assert.notEqual(attr(pair[0],'data-member'),attr(pair[1],'data-member'));
      const [a,b] = pair.map(endpoints);
      if (!a) { assert.equal(b,null); continue; }
      close(a.head.x-a.tail.x, b.tail.x-b.head.x);
      close(a.head.y-a.tail.y, b.tail.y-b.head.y);
    }
    for (const g of byClass(draw(fig,nominal(fig),0.4),'pin-force')) close(+attr(g,'opacity'),0.4);
  }
});

test('doubling all loads doubles every nonzero arrow length', () => {
  let checked=0;
  for (const fig of figures) {
    const loads=nominal(fig), doubled=Object.fromEntries(Object.entries(loads).map(([k,v])=>[k,{x:2*v.x,y:2*v.y}]));
    const a=byClass(draw(fig,loads,1),'force').map(endpoints);
    const b=byClass(draw(fig,doubled,1),'force').map(endpoints);
    a.forEach((p,i) => {
      if (!p) return;
      close(Math.hypot(b[i].head.x-b[i].tail.x,b[i].head.y-b[i].tail.y),2*Math.hypot(p.head.x-p.tail.x,p.head.y-p.tail.y));
      checked++;
    });
  }
  assert.ok(checked>50);
});

test('zero forces are dashed rings with labels and zero loads retain accessible handles', () => {
  for (const fig of figures) {
    const loads=Object.fromEntries(fig.loads.map(l=>[l.name,{x:0,y:0}]));
    const svg=draw(fig,loads,1), forces=byClass(svg,'force');
    assert.ok(forces.length>0);
    for (const force of forces) {
      assert.equal(endpoints(force),null);
      const ring=byClass(force,'zero')[0];
      assert.ok(ring && attr(ring,'stroke-dasharray'));
      assert.ok(forceLabel(svg,force).textContent);
    }
    for (const handle of byClass(svg,'handle')) {
      const name=attr(handle,'data-load');
      assert.equal(attr(handle,'tabindex'),'0');
      assert.equal(attr(handle,'role'),'slider');
      assert.equal(attr(handle,'aria-label'),`Load ${name}, drag to change size and direction`);
      // Sizes are screen px at every viewport: r is HANDLE_PX divided by the scale (px per unit) the scene drew at.
      close(+attr(handle,'r'),HANDLE_PX/scaleOf(svg));
      assert.ok(2*HANDLE_PX>=44);
      assert.equal(attr(handle,'fill'),'transparent');
      assert.ok(attr(handle,'stroke'));
      const load=solve(fig,loads).forces.find(f=>f.kind==='load' && f.name===name);
      // Zero load: the handle sits on the point of application, carried by its member's explode offset (frac 1 here).
      const off=memberOffset(fig,load.member,1);
      close(+attr(handle,'cx'),load.at.x+off.dx);
      close(+attr(handle,'cy'),-(load.at.y+off.dy));
    }
  }
});

test('contact heads touch member surfaces: C on both arms, D, and the three rollers', () => {
  let checked=0;
  for (const fig of [figures[1],figures[3],figures[4],figures[5]]) {
    const svg=draw(fig,nominal(fig),1);
    for (const force of solve(fig,nominal(fig)).forces.filter(f=>f.unilateral)) {
      const connection=[...fig.supports,...fig.joints].find(c=>c.name===force.name && c.kind==='contact');
      assert.ok(connection.drawAt?.[force.member], `${fig.id} ${force.name} needs drawAt`);
      const group=byClass(svg,'force').find(n=>attr(n,'data-name')===force.name && attr(n,'data-member')===force.member && !attr(n,'data-sub') && attr(n,'data-role')==='normal');
      // The member is drawn shifted by its explode offset, and so is its arrow.
      const off=memberOffset(fig,force.member,1);
      const head=endpoints(group).head, point={x:head.x-off.dx,y:-head.y-off.dy};
      const member=fig.members.find(m=>m.id===force.member);
      // (Roller E is no longer split from a pin component E_x: the pin force at E is one arrow along link BE.)
      const on=nearestPoint(fig,member,point);
      close(Math.hypot(point.x-on.x,point.y-on.y),member.width/2);
      close(point.x,force.at.x);
      close(point.y,force.at.y);
      checked++;
    }
  }
  assert.equal(checked,6);
});

test('lift-off uses exact wording, grey reactions, zero contacts and visible ball gaps', () => {
  const fig=figures[3], svg=draw(fig,{P:{x:0,y:120}},1);
  // The line shows N_C and N_D with real subscripts; it is spoken as "N sub C and N sub D lift off: no equilibrium."
  const line=nodes(svg,n=>attr(n,'id')==='liftoff')[0];
  assert.equal(attr(line,'aria-label'),'N sub C and N sub D lift off: no equilibrium.');
  assert.equal(line.textContent,'NC and ND lift off: no equilibrium.');
  for (const force of [...byClass(svg,'reaction-force'),...byClass(svg,'pin-force')]) {
    assert.ok(force.classList.contains('greyed'));
    if (['C','D'].includes(attr(force,'data-name'))) assert.equal(byClass(force,'zero').length,1);
  }
  assert.ok(byClass(svg,'load-force').every(n=>!n.classList.contains('greyed')));
  // Measure actual geometry against the surfaces, not a data-gap assertion.
  const balls=byClass(svg,'ball');
  const c=balls.find(n=>attr(n,'data-name')==='C'), d=balls.find(n=>attr(n,'data-name')==='D');
  const cr=+attr(c,'r')+ +attr(c,'stroke-width')/2, dr=+attr(d,'r')+ +attr(d,'stroke-width')/2;
  // (svg y runs down; the arms are drawn at their explode offsets, ball C half way between them)
  const up=memberOffset(fig,'upper',1).dy, low=memberOffset(fig,'lower',1).dy;
  assert.ok((+attr(c,'cy')-cr)-(0.2-up)>=0.15-1e-9);
  assert.ok(1.8-low-(+attr(c,'cy')+cr)>=0.15-1e-9);
  assert.ok(+attr(d,'cy')-dr-(2.2-low)>=0.15-1e-9);
  // Ball D rests on the floor whether or not it lifts off: its underside, and the floor, do not move.
  const rest=byClass(draw(fig,nominal(fig),1),'ball').find(n=>attr(n,'data-name')==='D');
  close(+attr(d,'cy')+ +attr(d,'r'),+attr(rest,'cy')+ +attr(rest,'r'));
  const floorTop=svg=>Math.min(...byClass(svg,'ground').flatMap(n=>attr(n,'points').trim().split(/\s+/).map(p=>+p.split(',')[1])));
  close(floorTop(svg),floorTop(draw(fig,nominal(fig),1)));
});

test('roller lift-off opens a gap and returning to equilibrium closes it', () => {
  for (const [fig,loads,name,surface,axis] of [
    [figures[1],{P:{x:0,y:20}},'E',0.45,'cx'],
    [figures[4],{P:{x:-18,y:0}},'F',0.1,'cy'],
    [figures[5],{P:{x:0,y:12}},'F',0.05,'cy']
  ]) {
    const lifted=draw(fig,loads), closed=draw(fig);
    const ball=byClass(lifted,'roller').find(n=>attr(n,'data-name')===name);
    const rest=byClass(closed,'roller').find(n=>attr(n,'data-name')===name);
    const centre=axis==='cx' ? -+attr(ball,axis) : +attr(ball,axis);
    assert.ok(centre-+attr(ball,'r')- +attr(ball,'stroke-width')/2-surface>=0.15-1e-9);
    const restCentre=axis==='cx' ? -+attr(rest,axis) : +attr(rest,axis);
    close(restCentre-+attr(rest,'r'),surface);
  }
});

test('figure two: roller N_E and the link force F_E at E are different arrows, the second along BE', () => {
  const svg=draw(figures[1],nominal(figures[1]),1);
  const normal=byClass(svg,'reaction-force').find(n=>attr(n,'data-name')==='E');
  const link=byClass(svg,'pin-force').find(n=>attr(n,'data-name')==='E' && attr(n,'data-member')==='EDC');
  assert.equal(attr(normal,'data-role'),'normal'); assert.equal(attr(link,'data-role'),'link');
  // at the textbook load N_E is horizontal; F_E is along BE, direction (5,2): not parallel, so no arrow hides another
  const n=endpoints(normal), l=endpoints(link);
  assert.ok(Math.abs((n.head.x-n.tail.x)*(l.head.y-l.tail.y)-(n.head.y-n.tail.y)*(l.head.x-l.tail.x))>1e-6);
});

test('single-contact lift-off and zero boundary restore the scene', () => {
  // C=(2 Px-12 Py)/8=30; D=(4 Px-8 Py)/6=-80/3.
  const fig=figures[3], loads={P:{x:-120,y:-40}};
  assert.deepEqual(solve(fig,loads).liftOff,['D']);
  const svg=draw(fig,loads);
  assert.equal(attr(nodes(svg,n=>attr(n,'id')==='liftoff')[0],'aria-label'),'N sub D lifts off: no equilibrium.');
  const roller=draw(figures[4],{P:{x:-18,y:0}});
  assert.equal(attr(nodes(roller,n=>attr(n,'id')==='liftoff')[0],'aria-label'),'N sub F lifts off: no equilibrium.');
  assert.equal(attr(nodes(draw(figures[5],{P:{x:0,y:12}}),n=>attr(n,'id')==='liftoff')[0],'aria-label'),'N sub F lifts off: no equilibrium.');
  const boundary={P:{x:-3.6,y:-4}};
  render(roller,figures[4],{loads:boundary,held:null},solve(figures[4],boundary),0);
  assert.equal(nodes(roller,n=>attr(n,'id')==='liftoff')[0].textContent,'');
  assert.equal(byClass(roller,'greyed').length,0);
  const f=byClass(roller,'reaction-force').find(n=>attr(n,'data-name')==='F');
  assert.equal(byClass(f,'zero').length,1);
});

test('members, supports, forces and handles follow fractional explode offsets', () => {
  const fig=structuredClone(figures[0]);
  fig.view.explode={AC:{dx:-4,dy:2},CB:{dx:3,dy:-1}};
  assert.deepEqual(memberOffset(fig,'AC',0.25),{dx:-1,dy:0.5});
  const svg=draw(fig,nominal(fig),0.25);
  const member=byClass(svg,'member').find(n=>attr(n,'data-member')==='AC');
  assert.equal(attr(member,'transform'),'translate(-1 -0.5)');
  const support=byClass(svg,'support').find(n=>attr(n,'data-name')==='A');
  assert.equal(attr(support,'transform'),'translate(-1 -0.5)');
  const p=loadHandlePos(fig,{loads:nominal(fig)},'P',0.25);
  close(p.x,0.466*9.65-1); close(p.y,0.466*7.8+0.5+fig.view.arrowPerForce);
  const handle=byClass(svg,'handle').find(n=>attr(n,'data-load')==='P');
  close(+attr(handle,'cx'),p.x); close(+attr(handle,'cy'),-p.y);
  const load=byClass(svg,'load-force').find(n=>attr(n,'data-name')==='P');
  close(endpoints(load).head.x,0.466*9.65-1);
  close(endpoints(load).head.y,-(0.466*7.8+0.5));
  assert.deepEqual(fromSvg(toSvg({x:2,y:-3})),{x:2,y:-3});
});

test('label placer reserves boxes and tries the next free tail slot', () => {
  const place=createLabelPlacer();
  const a=place({x:0,y:0},{x:1,y:0},1,0.8,0.2);
  const b=place({x:0,y:0},{x:1,y:0},1,0.8,0.2);
  assert.ok(a.x+1<=b.x || b.x+1<=a.x || a.y+0.8<=b.y || b.y+0.8<=a.y);
  assert.ok(Math.hypot(a.x,a.y)<3 && Math.hypot(b.x,b.y)<3);
});

const polygonPoints = node => attr(node,'points').trim().split(/\s+/).map(pair=>pair.split(',').map(Number));

test('support data mounts figure two on a shared left wall and all other figures on floors', () => {
  for (const fig of figures) {
    for (const support of fig.supports) assert.equal(support.surface,fig.id===2?'wall-left':'floor');
    const svg=draw(fig), grounds=byClass(svg,'ground');
    assert.ok(grounds.length>0);
    assert.ok(grounds.every(n=>attr(n,'fill')==='#d6cbb3'));
    for (const support of fig.supports.filter(s=>s.kind==='pin')) {
      const glyph=byClass(svg,'support').find(n=>attr(n,'data-name')===support.name);
      const [tip,a,b]=polygonPoints(byClass(glyph,'support-pin')[0]);
      if (fig.id===2) {
        close(a[0],b[0]); assert.ok(a[0]<tip[0]);
        assert.ok(a[1]<tip[1] && b[1]>tip[1]);
      } else {
        close(a[1],b[1]); assert.ok(a[1]>tip[1]);
        assert.ok(a[0]<tip[0] && b[0]>tip[0]);
      }
    }
  }
  const wallScene=draw(figures[1]), wall=byClass(wallScene,'ground');
  assert.equal(wall.length,1,'A and E mount on one continuous wall');
  const points=polygonPoints(wall[0]);
  const wallX=Math.max(...points.map(p=>p[0]));
  const roller=byClass(wallScene,'roller')[0];
  // The wall meets the roller's face to within a pixel (a pad bridges the difference to A's wider bracket).
  assert.ok(Math.abs(wallX-(+attr(roller,'cx')-+attr(roller,'r')))<1.5/scaleOf(wallScene));
  assert.ok(Math.min(...points.map(p=>p[1]))<-4 && Math.max(...points.map(p=>p[1]))>0);
  const ballScene=draw(figures[3]), d=byClass(ballScene,'ball').find(n=>attr(n,'data-name')==='D');
  const floor=byClass(ballScene,'ground').find(n=>{
    const p=polygonPoints(n);
    return Math.min(...p.map(v=>v[0]))<10 && Math.max(...p.map(v=>v[0]))>10;
  });
  assert.ok(floor,'the floor extends under ball D');
  // The floor's top edge meets the ball's underside to within a pixel.
  const floorTop=Math.min(...polygonPoints(floor).map(p=>p[1])), ballBottom=+attr(d,'cy')+ +attr(d,'r');
  assert.ok(Math.abs(floorTop-ballBottom)*scaleOf(ballScene)<=1,`floor top ${floorTop} vs ball bottom ${ballBottom}`);
  const pad=byClass(ballScene,'support-pad').length;
  assert.ok(pad>=1,'a pad joins ball D to the floor');
});

test('document paint order is ground, supports, members, pins, balls, arrows, labels, handles', () => {
  for (const fig of figures) for (const frac of [0,0.5,1]) {
    const svg=draw(fig,nominal(fig),frac), all=nodes(svg,()=>true);
    const childrenOf=cls=>byClass(svg,cls).flatMap(n=>nodes(n,()=>true)).filter(n=>['path','polygon','line','circle'].includes(n.tag));
    const layers=[byClass(svg,'ground'),childrenOf('support'),childrenOf('member'),byClass(svg,'pin'),
      byClass(svg,'ball'),childrenOf('force'),byTag(svg,'text'),byClass(svg,'handle')].filter(a=>a.length);
    for (let i=1;i<layers.length;i++) {
      assert.ok(Math.max(...layers[i-1].map(n=>all.indexOf(n)))<Math.min(...layers[i].map(n=>all.indexOf(n))),
        `figure ${fig.id}, fraction ${frac}: paint layer ${i} covers its successor`);
    }
    const supportEnd=Math.max(...childrenOf('support').map(n=>all.indexOf(n)));
    for (const reaction of byClass(svg,'reaction-force')) {
      assert.ok(all.indexOf(reaction)>supportEnd,'reaction arrows must follow support glyphs');
    }
  }
});

test('every handle hit circle is at least 44 px across at every explode state, on all six figures (including 4-6)', () => {
  for (const fig of figures) for (const frac of [0,1]) {
    const svg=draw(fig,nominal(fig),frac), handles=byClass(svg,'handle');
    assert.equal(handles.length,fig.loads.length);
    for (const h of handles) assert.ok(2*+attr(h,'r')*scaleOf(svg)>=44-1e-9,`fig ${fig.id} frac ${frac}`);
  }
  assert.ok(figures.length===6 && figures.slice(3).every(f=>f.id>=4));
});

test('load handle slider exposes valuenow as a whole percent of nominal, 0 to 100', () => {
  const fig=figures[0], nom=nominal(fig);
  const handle=svg=>nodes(svg,n=>attr(n,'role')==='slider')[0];
  const mag=v=>Math.hypot(v.x,v.y);
  const at=factor=>handle(draw(fig,Object.fromEntries(Object.entries(nom).map(([k,v])=>[k,{x:v.x*factor,y:v.y*factor}]))));
  for (const [factor,want] of [[1,'100'],[0,'0'],[0.5,'50'],[0.333,'33']]) {
    const h=at(factor);
    assert.equal(attr(h,'aria-valuenow'),want,`factor ${factor}`);
    assert.equal(attr(h,'aria-valuemin'),'0');
    assert.equal(attr(h,'aria-valuemax'),'100');
    assert.doesNotMatch(attr(h,'aria-valuetext'),/\d/);
  }
  assert.ok(mag(nom.P??Object.values(nom)[0])>0);
});

test('the redrawn figure keeps its numbered label', () => {
  figures.forEach((fig,i)=>assert.equal(attr(draw(fig),'aria-label'),`Frame ${i+1} and its forces`));
});

test('two-force members: one arrow per end, drawn along the member, pointing the solved direction, in every state', () => {
  let checked=0;
  for (const fig of figures) for (const id of twoForceMembers(fig)) for (const frac of [0,1]) for (let deg=0;deg<360;deg+=5) for (const mult of [1,1.5]) {
    const a=deg*Math.PI/180, loads=Object.fromEntries(fig.loads.map(l=>{
      const m=mult*Math.hypot(l.nominal.x,l.nominal.y); return [l.name,{x:m*Math.cos(a),y:m*Math.sin(a)}];
    }));
    const sol=solve(fig,loads), svg=draw(fig,loads,frac), s=fig.view.arrowPerForce;
    const ends=[...fig.supports.filter(c=>c.member===id),...fig.joints.filter(c=>c.members.includes(id))];
    const [p,q]=ends.map(c=>resolvePoint(fig,c.at)), axis={x:p.x-q.x,y:p.y-q.y}, len=Math.hypot(axis.x,axis.y);
    const shownEnds=ends.filter(c=>frac>0 || fig.supports.includes(c));
    const groups=byClass(svg,'force').filter(g=>attr(g,'data-member')===id);
    assert.equal(groups.length,shownEnds.length,`${fig.id} ${id}: one arrow per visible end`);
    for (const g of groups) {
      assert.equal(attr(g,'data-role'),'link');
      const e=endpoints(g), want=sol.forces.filter(f=>f.member===id && f.name===attr(g,'data-name')).reduce((n,f)=>({x:n.x+f.vec.x,y:n.y+f.vec.y}),{x:0,y:0});
      if (!e) { assert.ok(Math.hypot(want.x,want.y)<1e-9); continue; }
      const v={x:(e.head.x-e.tail.x)/s,y:-(e.head.y-e.tail.y)/s};   // svg y runs down
      assert.ok(Math.abs(v.x*axis.y-v.y*axis.x)<=1e-9*len*(1+Math.hypot(want.x,want.y)),`${fig.id} ${id}: not parallel`);
      assert.ok(Math.abs(v.x-want.x)<1e-6*(1+Math.abs(want.x)) && Math.abs(v.y-want.y)<1e-6*(1+Math.abs(want.y)),'direction and size of the solved force');
      checked++;
    }
    // the matching force on the other member at each visible pin is one arrow on the same line
    if (frac>0) for (const joint of fig.joints.filter(j=>j.members.includes(id))) {
      const other=joint.members.find(m=>m!==id);
      const g=byClass(svg,'force').filter(n=>attr(n,'data-member')===other && attr(n,'data-name')===joint.name && attr(n,'data-role')==='link');
      assert.equal(g.length,1);
      const e=endpoints(g[0]);
      if (e) {
        const v={x:e.head.x-e.tail.x,y:-(e.head.y-e.tail.y)};
        assert.ok(Math.abs(v.x*axis.y-v.y*axis.x)<=1e-9*len*(1+Math.hypot(v.x,v.y)));
      }
    }
  }
  assert.ok(checked>=900,`checked ${checked}`);
});

test('fig 3 combined: support D is one arrow along BD', () => {
  const fig=figures[2], svg=draw(fig,nominal(fig),0);
  const d=byClass(svg,'reaction-force').filter(n=>attr(n,'data-name')==='D');
  assert.equal(d.length,1);
  const e=endpoints(d[0]), a=resolvePoint(fig,fig.points.B), b=resolvePoint(fig,fig.points.D);
  const v={x:e.head.x-e.tail.x,y:-(e.head.y-e.tail.y)}, axis={x:b.x-a.x,y:b.y-a.y};
  assert.ok(Math.abs(v.x*axis.y-v.y*axis.x)<1e-9*Math.hypot(v.x,v.y)*Math.hypot(axis.x,axis.y));
  assert.ok(Math.hypot(v.x,v.y)>1e-6);
});

test('third-law pairs share a hue unique to the pair, distinct from the load and the ground reactions, readable on white', () => {
  assert.ok(PAIR_COLOURS.length>=3);
  assert.equal(new Set(PAIR_COLOURS.map(c=>c.toLowerCase())).size,PAIR_COLOURS.length);
  for (const c of [...PAIR_COLOURS,PALETTE.load,PALETTE.reaction]) assert.ok(contrastOnWhite(c)>=3,`${c}: ${contrastOnWhite(c)}`);
  for (const c of PAIR_COLOURS) assert.ok(![PALETTE.load,PALETTE.reaction,PALETTE.greyed].includes(c));
  let pairs=0;
  for (const fig of figures) {
    const svg=draw(fig,nominal(fig),1), byPair=new Map();
    for (const g of byClass(svg,'pin-force')) {
      const key=attr(g,'data-name');
      byPair.set(key,[...(byPair.get(key)||[]),forceColour(g)]);
    }
    assert.equal(byPair.size,fig.joints.length);
    for (const [name,colours] of byPair) {
      assert.ok(colours.length>=2);
      assert.equal(new Set(colours).size,1,`fig ${fig.id} pair ${name}: both halves (every component) share one colour`);
      pairs++;
    }
    const used=[...byPair.values()].map(c=>c[0]);
    assert.equal(new Set(used).size,used.length,`fig ${fig.id}: pairs differ from each other`);
    for (const c of used) assert.ok(PAIR_COLOURS.includes(c) && contrastOnWhite(c)>=3);
    for (const g of byClass(svg,'reaction-force')) assert.equal(forceColour(g),PALETTE.reaction);
    for (const g of byClass(svg,'load-force')) assert.equal(forceColour(g),PALETTE.load);
    // the labels carry their arrow's colour
    for (const g of byClass(svg,'force')) assert.equal(attr(forceLabel(svg,g),'fill'),forceColour(g));
  }
  assert.equal(pairs,figures.reduce((n,f)=>n+f.joints.length,0));
  // lift-off grey still overrides the pair colours
  const lifted=draw(figures[3],{P:{x:0,y:120}},1);
  for (const g of [...byClass(lifted,'pin-force'),...byClass(lifted,'reaction-force')]) assert.equal(forceColour(g),PALETTE.greyed);
});

// ---- point letters: every single capital-letter key of fig.points ---------------------------------------------------
const letterGroups=svg=>byClass(svg,'point-label');
const letterCount=(svg)=>{
  const counts={};
  for (const g of letterGroups(svg)) { const p=attr(g,'data-point'); counts[p]=(counts[p]||0)+1; }
  return counts;
};
const tally=(names)=>Object.fromEntries(Object.entries(names).sort());

test('fig 4 combined shows A to E once each: no J, no upperBend, no lowerBend', () => {
  const svg=draw(figures[3],nominal(figures[3]),0);
  assert.deepEqual(tally(letterCount(svg)),{A:1,B:1,C:1,D:1,E:1});
  for (const g of letterGroups(svg)) assert.equal(byTag(g,'text')[0].textContent,attr(g,'data-point'));
});

test('fig 6 exploded: a split pin carries a letter on each member, one-member points one letter', () => {
  const svg=draw(figures[5],nominal(figures[5]),1);
  assert.deepEqual(tally(letterCount(svg)),{A:2,B:2,C:2,D:1,E:1,F:1});
  const members=p=>letterGroups(svg).filter(g=>attr(g,'data-point')===p).map(g=>attr(g,'data-member')).sort();
  assert.deepEqual(members('B'),['ABE','BCD']);
  assert.deepEqual(members('C'),['ACF','BCD']);
  assert.deepEqual(members('A'),['ABE','ACF']);
  assert.deepEqual(members('D'),['BCD']);   // the load's member
  assert.deepEqual(members('F'),['ACF']);   // the roller's member
  assert.deepEqual(members('E'),['ABE']);
  // combined: one letter per point
  assert.deepEqual(tally(letterCount(draw(figures[5],nominal(figures[5]),0))),{A:1,B:1,C:1,D:1,E:1,F:1});
});

test('every figure: one letter per point combined, one per carrying member exploded, text is the point name', () => {
  for (const fig of figures) {
    const names=Object.keys(fig.points).filter(k=>/^[A-Z]$/.test(k)).sort();
    assert.deepEqual(Object.keys(letterCount(draw(fig,nominal(fig),0))).sort(),names,`fig ${fig.id} combined`);
    for (const n of Object.values(letterCount(draw(fig,nominal(fig),0)))) assert.equal(n,1);
    const exploded=draw(fig,nominal(fig),1), counts=letterCount(exploded);
    assert.deepEqual(Object.keys(counts).sort(),names,`fig ${fig.id} exploded`);
    for (const p of names) {
      const carriers=new Set([
        ...fig.joints.filter(j=>j.name===p).flatMap(j=>j.members),
        ...fig.supports.filter(s=>s.name===p).map(s=>s.member)]);
      if (carriers.size) assert.equal(counts[p],carriers.size,`fig ${fig.id} ${p}`);
    }
    for (const g of letterGroups(exploded)) assert.equal(byTag(g,'text')[0].textContent,attr(g,'data-point'));
  }
});

test('letters are plain dark grey, not bold, the size of force labels, and never a force colour', () => {
  const forceColours=new Set([PALETTE.load,PALETTE.reaction,PALETTE.greyed,...PAIR_COLOURS]);
  let n=0;
  for (const fig of figures) for (const frac of [0,1]) {
    const svg=draw(fig,nominal(fig),frac);
    const size=+attr(byTag(byClass(svg,'force-label')[0],'text')[0],'font-size');
    for (const g of letterGroups(svg)) {
      const t=byTag(g,'text')[0];
      assert.equal(attr(t,'fill'),'#374151');
      assert.ok(!forceColours.has(attr(t,'fill')));
      assert.ok(!attr(t,'font-weight') && !attr(t,'font-style'),'plain: not bold, not italic');
      assert.ok(Math.abs(+attr(t,'font-size')-size)<1e-9,'same size as a force label');
      n++;
    }
  }
  assert.ok(n>60);
});

test('letters: the first copy of a point is solid, later copies fade in with the explode fraction', () => {
  for (const frac of [0.25,0.6,1]) {
    const svg=draw(figures[5],nominal(figures[5]),frac), seen=new Set();
    for (const g of letterGroups(svg)) {
      const p=attr(g,'data-point'), first=!seen.has(p); seen.add(p);
      assert.equal(+attr(g,'opacity'),first ? 1 : frac,`${p} on ${attr(g,'data-member')} at frac ${frac}`);
    }
    assert.ok(letterGroups(svg).some(g=>+attr(g,'opacity')===frac) || frac===1);
  }
  // fully combined, the extra copies are not drawn at all
  assert.equal(letterGroups(draw(figures[5],nominal(figures[5]),0)).length,6);
});

test('each letter sits near its own point copy (within 16 px of its member\'s edge) and keeps its glyph box clear of obstacles', () => {
  const near=16;   // px beyond the carrying member's outline, as tools/browser-harness.js SIM.letterNear
  let checked=0;
  for (const fig of figures) for (const frac of [0,1]) for (const loads of [nominal(fig),Object.fromEntries(fig.loads.map(l=>[l.name,{x:-l.nominal.y,y:l.nominal.x}]))]) {
    const svg=draw(fig,loads,frac), px=scaleOf(svg), labels=byClass(svg,'force-label').map(g=>byTag(g,'text')[0]);
    for (const g of letterGroups(svg)) {
      const t=byTag(g,'text')[0], size=+attr(t,'font-size'), cx=+attr(t,'x'), baseline=+attr(t,'y');
      const box={x:cx-0.4*size,y:baseline-0.905*size,w:0.8*size,h:1.2*size};
      const name=attr(g,'data-point'), member=attr(g,'data-member');
      const point=pointAnchor(fig,name,member), o=memberOffset(fig,member,frac), anchor={x:point.x+o.dx,y:-(point.y+o.dy)};
      const dx=Math.max(box.x-anchor.x,0,anchor.x-box.x-box.w), dy=Math.max(box.y-anchor.y,0,anchor.y-box.y-box.h);
      const bar=fig.members.find(m=>m.id===member).width/2*px;
      assert.ok(Math.hypot(dx,dy)*px-bar<=near,`fig ${fig.id} ${name} frac ${frac}: ${(Math.hypot(dx,dy)*px-bar).toFixed(1)} px from its point`);
      // clear of every other label's text box (a force label is centred on x, baseline y; sizes as the placer reserves them)
      for (const other of labels) {
        const w=0.8*size, ox=+attr(other,'x'), oy=+attr(other,'y');
        const lb={x:ox-w/2,y:oy-0.905*size,w,h:1.2*size};
        assert.ok(!(box.x<lb.x+lb.w && box.x+box.w>lb.x && box.y<lb.y+lb.h && box.y+box.h>lb.y),`fig ${fig.id} letter ${name} covers a force label`);
      }
      checked++;
    }
  }
  assert.ok(checked>80);
});

test('pointCarriers and pointAnchor: joints, supports, loads (by name or position), contacts; a ball letter sits where the ball touches', () => {
  assert.deepEqual(pointCarriers(figures[5],'D'),['BCD']);          // load at D
  assert.deepEqual(pointCarriers(figures[3],'E'),['upper']);         // fig 4 load located at E, no name
  assert.deepEqual(pointCarriers(figures[2],'A'),['ABC']);           // fig 3 load 'at' A by name
  assert.deepEqual(pointCarriers(figures[3],'C'),['upper','lower']); // contact joint
  assert.deepEqual(pointCarriers(figures[1],'E'),['BE','EDC']);      // the joint's members, then the support's member, de-duplicated
  assert.deepEqual(pointCarriers({points:{Z:{x:9,y:9}},joints:[],supports:[],loads:[],members:[]},'Z'),[]);
  assert.deepEqual(pointCarriers({points:{Z:{x:9,y:9}},joints:[],supports:[],loads:[],members:[{id:'m',path:[{seg:'line',from:'Y',to:'Z'}]}]},'Z'),['m']);
  assert.deepEqual(pointAnchor(figures[3],'C','upper'),{x:8,y:-0.2});
  assert.deepEqual(pointAnchor(figures[3],'C','lower'),{x:8,y:-1.8});
  assert.deepEqual(pointAnchor(figures[3],'D','lower'),{x:10,y:-2.2});
  assert.deepEqual(pointAnchor(figures[1],'E','EDC'),{x:0,y:0});   // a roller is lettered at the point itself, not at drawAt
});

test('createLabelPlacer exact mode: the nearest clear box by true distance, and the lazy ring search matches the old order', () => {
  const bounds={x:0,y:0,w:200,h:200}, obstacles=[{a:{x:100,y:100},b:{x:100,y:100},r:5.8},{a:{x:60,y:100},b:{x:140,y:100},r:8}];
  const place=createLabelPlacer(bounds,obstacles);
  const box=place({x:100,y:100},{x:0,y:-1},14,20,6,null,undefined,{exact:true,bias:3,rings:20});
  // the bar (r 8) is 8 px each side of y = 100: the nearest clear box is just above it
  assert.ok(box.y+box.h<=92+1e-9 && box.y+box.h>90,`box bottom ${box.y+box.h}`);
  assert.ok(box.cost<=12,box.cost);
  // exact mode is never farther from the point than the ring order's choice
  const ring=createLabelPlacer(bounds,obstacles)({x:100,y:100},{x:0,y:-1},14,20,6);
  const dist=b=>Math.hypot(Math.max(b.x-100,0,100-b.x-b.w),Math.max(b.y-100,0,100-b.y-b.h));
  assert.ok(dist(box)<=dist(ring)+1e-9);
  // with no room at all it falls back (cost Infinity) rather than throwing
  const jam=createLabelPlacer({x:0,y:0,w:10,h:10},[{box:{x:0,y:0,w:10,h:10}}])({x:5,y:5},{x:0,y:-1},4,4,1,null,undefined,{exact:true,bias:3,rings:3});
  assert.equal(jam.cost,Infinity);
});

test('createLabelPlacer: every box it places is clear by capsuleHitsBox, including boxes exactly r from a capsule (the pre-check must not hide a tangent hit)', () => {
  let seed=7; const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/2**32;
  let placed=0;
  for (let trial=0; trial<300; trial++) {
    const obstacles=Array.from({length:4+Math.floor(rnd()*6)},()=>{
      const a={x:rnd()*100,y:rnd()*100}, b=rnd()<0.4 ? a : {x:a.x+(rnd()-0.5)*50,y:a.y+(rnd()-0.5)*50};
      return {a,b,r:2+Math.floor(rnd()*4)};   // whole-number radii and gaps make exactly-tangent candidates common
    });
    const place=createLabelPlacer({x:0,y:0,w:100,h:100},obstacles);
    for (let k=0; k<4; k++) {
      const box=place({x:rnd()*100,y:rnd()*100},{x:rnd()-0.5,y:rnd()-0.5},8,8,2+Math.floor(rnd()*4),null);
      if (!Number.isFinite(box.cost)) continue;
      for (const o of obstacles) assert.equal(capsuleHitsBox(o,box),false,`trial ${trial}`);
      placed++;
    }
  }
  assert.ok(placed>800);
});
