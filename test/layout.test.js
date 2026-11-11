import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout, contentBounds, frameBounds, chooseArrowScale, roundDown3, ARROW_MARGIN, createLabelPlacer, hasOneSided, MARGIN_PX, STRIP_PX } from '../src/layout.js';
import { LOAD_CAP } from '../src/state.js';
import { solve, displayForces } from '../src/solve.js';
import { memberOffset } from '../src/scene.js';
import { figures } from './scene-helpers.js';

test('the layout fills the width, or the height, and one unit is the same number of px both ways', () => {
  for (const fig of figures) for (const [w,h] of [[341,716],[800,654],[1248,624]]) {
    const L=computeLayout(fig,w,h), [,,vw,vh]=L.viewBox;
    assert.ok(Math.abs(vw*L.scale-w)<1e-6 && Math.abs(vh*L.scale-L.height)<1e-6, `${fig.id} ${w}: viewBox in px is the svg size`);
    assert.ok(L.height<=h+1e-9);
    const B=contentBounds(fig), used=Math.max((B.x1-B.x0)*L.scale+2*MARGIN_PX-w,(B.y1-B.y0)*L.scale+2*MARGIN_PX-h);
    assert.ok(used<=1e-6,'content and margin fit');
    // one of the two is the limit: the content (plus margin) touches the width or the height
    const slackW=w-((B.x1-B.x0)*L.scale+2*MARGIN_PX), slackH=h-((B.y1-B.y0)*L.scale+2*MARGIN_PX)-(hasOneSided(fig) ? STRIP_PX : 0);
    assert.ok(Math.min(slackW,slackH)<1e-6,`${fig.id} ${w}x${h} fills one dimension`);
  }
});

test('a bigger window gives a bigger scale, so the geometry and arrows grow while px sizes stay constant', () => {
  for (const fig of figures) assert.ok(computeLayout(fig,1248,624).scale>computeLayout(fig,341,716).scale);
});

test('content bounds hold every member, and every arrow tail at the worst case, combined and exploded', () => {
  for (const fig of figures) {
    const B=contentBounds(fig), s=fig.view.arrowPerForce, eps=1e-9;
    for (const frac of [0,1]) for (let k=0;k<72;k++) {
      const loads={}, a=k*Math.PI/36;
      for (const load of fig.loads) { const m=LOAD_CAP*Math.hypot(load.nominal.x,load.nominal.y); loads[load.name]={x:m*Math.cos(a),y:m*Math.sin(a)}; }
      for (const f of displayForces(fig,solve(fig,loads).forces)) {   // the arrows that are drawn (two-force members: one per end)
        const o=memberOffset(fig,f.member,frac);
        for (const [x,y] of [[f.at.x+o.dx,f.at.y+o.dy],[f.at.x+o.dx-f.vec.x*s,f.at.y+o.dy-f.vec.y*s]]) {
          assert.ok(x>=B.x0-eps && x<=B.x1+eps && y>=B.y0-eps && y<=B.y1+eps,`${fig.id} ${f.name}${f.sub||''} at ${k*5} deg, frac ${frac}`);
        }
      }
    }
  }
});

test('the label placer picks the nearest clear spot to the arrow, and moves on when it is taken', () => {
  const place=createLabelPlacer(null,[]);
  const a=place({x:0,y:0},{x:1,y:0},1,0.8,0.2);
  assert.ok(a.cost<=0.2+1e-9);
  const b=place({x:0,y:0},{x:1,y:0},1,0.8,0.2);
  assert.ok(a.x+a.w<=b.x+1e-9 || b.x+b.w<=a.x+1e-9 || a.y+a.h<=b.y+1e-9 || b.y+b.h<=a.y+1e-9, 'no overlap');
  assert.ok(b.cost>=a.cost);
  // an obstacle on the preferred side pushes the label to another side
  const blocked=createLabelPlacer(null,[{box:{x:0.1,y:-2,w:5,h:4}}]);
  const c=blocked({x:0,y:0},{x:1,y:0},1,0.8,0.2);
  assert.ok(c.x+c.w<=0.1+1e-9 || c.x>=5.1-1e-9 || c.y+c.h<=-2+1e-9 || c.y>=2-1e-9);
});

test('each figure stores the arrow scale the rule gives (largest scale whose worst-case arrows stick out of the frame by at most the margin)', () => {
  for (const fig of figures) {
    const rule=chooseArrowScale(fig), stored=fig.view.arrowPerForce;
    assert.ok(Math.abs(stored-Number(roundDown3(rule).toPrecision(3)))<1e-12*Math.max(1,rule),`${fig.id}: stored ${stored}, rule ${rule}`);
    assert.ok(stored<=rule*(1+1e-9) && stored>=0.99*rule);
    // and the worst-case envelope really adds at most the margin on every side of the frame
    const F=frameBounds(fig), C=contentBounds(fig), k=fig.view.arrowMargin ?? ARROW_MARGIN, mx=k*(F.x1-F.x0), my=k*(F.y1-F.y0);
    for (const [out,lim] of [[F.x0-C.x0,mx],[C.x1-F.x1,mx],[F.y0-C.y0,my],[C.y1-F.y1,my]]) assert.ok(out<=lim+1e-9,`${fig.id}: arrows stick out ${out} > ${lim}`);
  }
});

test('the frame fills at least 60 % of the svg exploded (and the textbook-load arrow is at least 24 px) at 1280x720 and 800x750', () => {
  // The svg is 1248 px wide at a 1280 px window (16 px page padding each side); its available height is the window minus the
  // page reserve; 800 wide gives a 768 px column in the harness. These are the sizes the browser harness measures.
  for (const fig of figures) for (const [w,h] of [[1248,720-96],[768,750-96]]) {
    const L=computeLayout(fig,w,h), F=frameBounds(fig,1);
    const span=Math.max((F.x1-F.x0)*L.scale/L.width,(F.y1-F.y0)*L.scale/L.height);
    assert.ok(span>=0.6,`${fig.id} at ${w}x${h}: frame spans ${(100*span).toFixed(1)} %`);
    if (w===1248) {
      const nominal=Math.hypot(fig.loads[0].nominal.x,fig.loads[0].nominal.y);
      assert.ok(nominal*fig.view.arrowPerForce*L.scale>=24,`${fig.id}: load arrow ${nominal*fig.view.arrowPerForce*L.scale} px`);
    }
  }
});
