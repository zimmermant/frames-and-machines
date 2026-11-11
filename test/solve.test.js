import test from 'node:test';
import assert from 'node:assert/strict';
import { FIG1 } from '../src/figures/fig1.js';
import { FIG2 } from '../src/figures/fig2.js';
import { FIG3 } from '../src/figures/fig3.js';
import { FIG4 } from '../src/figures/fig4.js';
import { FIG5 } from '../src/figures/fig5.js';
import { FIG6 } from '../src/figures/fig6.js';
import { solve, clean, twoForceMembers, displayForces } from '../src/solve.js';
import { solveLinear } from '../src/linalg.js';
import { resolvePoint } from '../src/geometry.js';

const figures = [FIG1,FIG2,FIG3,FIG4,FIG5,FIG6];
const defaults = fig => Object.fromEntries(fig.loads.map(l => [l.name,{...l.nominal}]));
function expectValues(fig,expected) {
  const sol = solve(fig,defaults(fig));
  assert.equal(sol.ok,true);
  assert.deepEqual(Object.keys(sol.values).sort(),Object.keys(expected).sort());
  for (const [key,value] of Object.entries(expected)) assert.ok(Math.abs(sol.values[key]-value)<1e-9,`${key}: ${sol.values[key]} vs ${value}`);
}

test('fig1 textbook load', () => {
  // C acts on AC. M_A: 9.65 Cy - 7.8 Cx = 0.466*9.65 = 4.4969.
  // M_B on CB: 2.75 Cy + 7.8 Cx = -(1-0.62)*2.75 = -1.045.
  // Add: 12.4 Cy = 3.4519. Fx/Fy on each body give the four reactions.
  const cy = 3.4519/12.4;
  const cx = (9.65*cy-4.4969)/7.8;
  expectValues(FIG1,{Ax:-cx,Ay:1-cy,Bx:cx,By:1+cy,Cx:cx,Cy:cy});
});

test('fig2 textbook load', () => {
  // Whole-frame M_A: 4 E - 5*20 = 0 -> E=25; Fx: Ax=-25; Fy: Ay=20.
  // EDC M_E: -10 Cy - 5*20=0 -> Cy=-10.
  // BE: E=B, and M_B: 2 Ex-5 Ey=0. EDC Fy: -Cy-Ey-20=0
  // -> Ey=By=-10, Ex=Bx=-25. EDC Fx: E-Cx-Ex=0 -> Cx=50.
  expectValues(FIG2,{Ax:-25,Ay:20,E:25,Bx:-25,By:-10,Cx:50,Cy:-10,Ex:-25,Ey:-10});
});

test('fig3 textbook load', () => {
  // BD is a two-force link: By/Bx = -1.92/0.56 = -24/7; D=B.
  // ABC M_C: 1.4(By-Bx) - (0.7+1.4)*310 = 0 -> By-Bx=465.
  // Thus Bx=-105, By=360; ABC force balance: Cx=-310-Bx=-205, Cy=-By=-360.
  expectValues(FIG3,{Cx:-205,Cy:-360,Dx:-105,Dy:360,Bx:-105,By:360});
});

test('fig4 textbook load', () => {
  // Upper M_A: 8 C-2*120=0 -> C=30; Fx/Fy: Ax=-120, Ay=-30.
  // Whole frame M_B: 6 D-4*120=0 -> D=80; Fx/Fy: Bx=-120, By=-80.
  expectValues(FIG4,{Ax:-120,Ay:-30,Bx:-120,By:-80,C:30,D:80});
});

test('fig5 textbook load', () => {
  // Whole M_A: 3.6 F-4*18=0 -> F=20; Ax=-18, Ay=-20.
  // BE is horizontal: By=Ey=0, Ex=Bx. CDEF Fy: Cy=F=20.
  // CDEF Fx: Cx+Ex=18; M_F: 6 Cx+2 Ex=72 -> Cx=Ex=Bx=9.
  expectValues(FIG5,{Ax:-18,Ay:-20,F:20,Bx:9,By:0,Cx:9,Cy:20,Ex:9,Ey:0});
});

test('fig6 textbook load', () => {
  // Amendment 2026-11-11: C is a full pin between BCD and ACF, F is a one-sided floor roller on ACF (normal up).
  // Points (m): E(0,0) F(1.8,0) A(0.9,1.8) B(0.3,0.6) on EA, C(1.5,0.6) on AF, D(2.1,0.6); P = 12 kN down at D.
  // BCD (B to D, horizontal), M_B: C is 1.2 from B and P is 1.8 from B, so 1.2 Cy - 1.8*12 = 0 -> Cy = 18 (up, on BCD).
  //   Fy on BCD: By + 18 - 12 = 0 -> By = -6.   Fx on BCD: Bx + Cx = 0.
  // Whole frame, M_E (Ex, Ey act at E): 1.8 N - 2.1*12 = 0 -> N = 14 (F pushes up).
  //   Fy: Ey + 14 - 12 = 0 -> Ey = -2.   Fx: Ex = 0.
  // ACF, M_A: N at F (0.9 right, 1.8 below A): 0.9*14 = 12.6.  The force of BCD on ACF at C is (-Cx, -18) at C - A = (0.6,-1.2):
  //   0.6*(-18) - (-1.2)(-Cx) = -10.8 - 1.2 Cx.   12.6 - 10.8 - 1.2 Cx = 0 -> Cx = 1.5.
  // So on BCD the pin force at B is (-1.5, -6), and on ABE it is (1.5, 6).
  // ACF, Fx and Fy: A on ACF = (1.5, 4) (Fx: Ax_ACF - 1.5 = 0; Fy: Ay_ACF + 14 - 18 = 0), so on ABE A is (-1.5, -4).
  // Check ABE, M_E: 0.3*6 - 0.6*1.5 + 0.9*(-4) - 1.8*(-1.5) = 0.9 - 3.6 + 2.7 = 0.  Fx: Ex + 1.5 - 1.5 = 0.  Fy: -2 + 6 - 4 = 0.
  // Joint values are the force on the first listed member: A on ABE, B on ABE, C on BCD.
  expectValues(FIG6,{Ex:0,Ey:-2,F:14,Ax:-1.5,Ay:-4,Bx:1.5,By:6,Cx:1.5,Cy:18});
});

test('fig6 lift-off cases: F is a one-sided roller, C is a two-component pin that never lifts', () => {
  // Whole frame M_E: 1.8 N + 0.6*(-Px)... in general 1.8 N + 2.1 Py - 0.6 Px = 0 -> N = (0.6 Px - 2.1 Py)/1.8.
  // P=(-12,0): N = -4 (pulls). P=(0,12): N = -2.1*12/1.8 = -14 (pulls). P=(12,0): N = 4 (pushes).
  for (const [p,n,ok] of [[{x:-12,y:0},-4,false],[{x:0,y:12},-14,false],[{x:12,y:0},4,true],[{x:0,y:-12},14,true]]) {
    const sol=solve(FIG6,{P:p});
    assert.ok(Math.abs(sol.values.F-n)<1e-9,`F ${sol.values.F} vs ${n}`);
    assert.equal(sol.ok,ok);
    assert.deepEqual(sol.liftOff,ok?[]:['F']);
  }
  // A full circle of directions: F pushes for 36 of the 72 five-degree directions (-160..15 degrees), and C is never reported.
  let pushes=0;
  for (let d=0;d<72;d++) {
    const sol=solve(FIG6,gridLoads(FIG6,d*Math.PI/36,2));
    assert.ok(!sol.liftOff.includes('C'));
    if (sol.ok) pushes++;
  }
  assert.equal(pushes,36);
  assert.ok(FIG6.supports.find(s => s.name==='F').oneSided);
  assert.equal(FIG6.joints.find(j => j.name==='C').kind,'pin');
});

test('two-force members are detected from the figure data: exactly two connections, no load, no contact', () => {
  assert.deepEqual(figures.map(f => twoForceMembers(f)),[[],['BE'],['BD'],[],['BE'],[]]);
  // detection is by structure, not by name: a load on the link, or a contact on it, removes it
  const loaded=structuredClone(FIG2);
  loaded.loads.push({name:'Q',at:'B',member:'BE',nominal:{x:0,y:-1}});
  assert.deepEqual(twoForceMembers(loaded),[]);
  const contact=structuredClone(FIG3);
  contact.supports[1]={...contact.supports[1],kind:'contact',normal:{x:0,y:1}};
  assert.deepEqual(twoForceMembers(contact),[]);
});

test('displayed forces on two-force members are one arrow per end, along the member, equal to the solved force', () => {
  let checked=0;
  for (const fig of figures) for (let d=0;d<72;d++) for (const scale of [0.5,1,1.5]) {
    const sol=solve(fig,gridLoads(fig,d*Math.PI/36,scale)), shown=displayForces(fig,sol.forces);
    for (const id of twoForceMembers(fig)) {
      const member=fig.members.find(m => m.id===id);
      const ends=[...fig.supports.filter(s => s.member===id),...fig.joints.filter(j => j.members.includes(id))];
      assert.equal(ends.length,2);
      const [p,q]=ends.map(c => resolvePoint(fig,c.at));
      const axis={x:p.x-q.x,y:p.y-q.y}, len=Math.hypot(axis.x,axis.y);
      for (const end of ends) {
        const mine=shown.filter(f => f.member===id && f.name===end.name && f.kind!=='load');
        assert.equal(mine.length,1,`${fig.id} ${id} ${end.name}`);
        const sum=sol.forces.filter(f => f.member===id && f.name===end.name && f.kind!=='load').reduce((a,f) => ({x:a.x+f.vec.x,y:a.y+f.vec.y}),{x:0,y:0});
        assert.ok(Math.abs(mine[0].vec.x-sum.x)<1e-9*(1+Math.abs(sum.x)) && Math.abs(mine[0].vec.y-sum.y)<1e-9*(1+Math.abs(sum.y)),'points the solved direction');
        assert.ok(Math.abs(mine[0].vec.x*axis.y-mine[0].vec.y*axis.x)<=1e-9*len*(1+Math.hypot(sum.x,sum.y)),'parallel to the member');
        assert.equal(mine[0].sub,null);
        // the matching force on the other member at that pin is one arrow too, exactly opposite
        for (const joint of fig.joints.filter(j => j.name===end.name && j.members.includes(id))) {
          const other=joint.members.find(m => m!==id), twin=shown.filter(f => f.member===other && f.name===joint.name && f.kind==='pin');
          assert.equal(twin.length,1);
          assert.ok(Math.abs(twin[0].vec.x+mine[0].vec.x)<1e-9 && Math.abs(twin[0].vec.y+mine[0].vec.y)<1e-9);
          assert.equal(twin[0].sub,null);
        }
        checked++;
      }
      assert.ok(member);
    }
  }
  assert.ok(checked>=3*216*2);
});
function assertEquilibrium(fig,sol) {
  for (const member of fig.members) {
    const origin = resolvePoint(fig,member.path[0].from);
    let fx=0, fy=0, moment=0;
    for (const force of sol.forces.filter(f => f.member===member.id)) {
      fx+=force.vec.x; fy+=force.vec.y;
      moment+=(force.at.x-origin.x)*force.vec.y-(force.at.y-origin.y)*force.vec.x;
    }
    for (const residual of [fx,fy,moment]) assert.ok(Math.abs(residual)<1e-9, `fig${fig.id} ${member.id}: ${residual}`);
  }
}
function gridLoads(fig,angle,multiple) {
  return Object.fromEntries(fig.loads.map(l => {
    const size = Math.hypot(l.nominal.x,l.nominal.y)*multiple;
    return [l.name,{x:size*Math.cos(angle),y:size*Math.sin(angle)}];
  }));
}

test('every member in equilibrium: 72 directions × three magnitudes × six figures', () => {
  let attempted=0, checked=0;
  for (const fig of figures) for (let d=0;d<72;d++) for (const scale of [0.5,1,1.5]) {
    const sol = solve(fig,gridLoads(fig,d*Math.PI/36,scale));
    attempted++;
    // Even a pulling-contact solution must satisfy the linear equations, though it is physically inadmissible.
    assertEquilibrium(fig,sol);
    if (sol.ok) checked++;
  }
  assert.equal(attempted,1296);
  // Admissible directions: fig1/3/6 all 72. Fig2 M_A gives E=-Px-1.25 Py,
  // so 36 directions (145..320) push. Fig4 has C=(2 Px-12 Py)/8 and
  // D=(4 Px-8 Py)/6: 32 directions (0,5 and 210..355) push both balls.
  // Fig5 F=(4 Px-3.6 Py)/3.6: 36 directions (0..45 and 230..355).
  // Fig6 F=(0.6 Px-2.1 Py)/1.8 (it is a one-sided roller since 2026-11-11): 36 directions (200..355 and 0..15).
  assert.equal(checked,(72+36+72+32+36+36)*3);
});

test('fig1 loads vary independently across 432 additional states', () => {
  let checked=0;
  for (const name of ['P','Q']) for (let d=0;d<72;d++) for (const scale of [0.5,1,1.5]) {
    const loads=defaults(FIG1);
    loads[name]={x:scale*Math.cos(d*Math.PI/36),y:scale*Math.sin(d*Math.PI/36)};
    const sol=solve(FIG1,loads);
    assert.equal(sol.ok,true);
    assertEquilibrium(FIG1,sol);
    checked++;
  }
  assert.equal(checked,432);
});

test('internal pairs are exactly opposite across every load direction', () => {
  for (const fig of figures) for (let d=0;d<72;d++) {
    const sol=solve(fig,gridLoads(fig,d*Math.PI/36,2));
    for (const joint of fig.joints) for (const sub of joint.kind==='pin'?['x','y']:[null]) {
      const pair=sol.forces.filter(f => f.kind==='pin' && f.name===joint.name && f.sub===sub);
      assert.equal(pair.length,2);
      assert.deepEqual(pair.map(f => f.member),joint.members);
      for (const axis of ['x','y']) assert.equal(pair[0].vec[axis]+pair[1].vec[axis],0);
    }
  }
});

test('zero loads give exact zeros', () => {
  for (const fig of figures) {
    const sol=solve(fig,Object.fromEntries(fig.loads.map(l => [l.name,{x:0,y:0}])));
    assert.equal(sol.ok,true);
    assert.deepEqual(sol.liftOff,[]);
    for (const v of Object.values(sol.values)) assert.ok(Object.is(v,0));
    for (const f of sol.forces) for (const v of Object.values(f.vec)) assert.ok(Object.is(v,0));
  }
});

test('liftoff boundary: load along DA gives exactly zero F; rotate 5° into pulling', () => {
  // M_A: 3.6 F +3.6 Py-4 Px=0. P=(-3.6,-4) lies along DA,
  // so its moment and F are zero. Clockwise rotation makes 4 Px-3.6 Py negative.
  const p={x:-3.6,y:-4};
  const boundary=solve(FIG5,{P:p});
  assert.ok(Object.is(boundary.values.F,0));
  assert.equal(boundary.ok,true);
  assert.deepEqual(boundary.liftOff,[]);
  const a=-Math.PI/36;
  const pulling=solve(FIG5,{P:{x:p.x*Math.cos(a)-p.y*Math.sin(a),y:p.x*Math.sin(a)+p.y*Math.cos(a)}});
  assert.equal(pulling.ok,false);
  assert.deepEqual(pulling.liftOff,['F']);
});

test('liftoff threshold is scaled by nominal magnitude and is strictly below the tolerance', () => {
  // Fig2: 4 E+5 Py=0 -> E=-1.25 Py; nominal=20, tolerance=20e-9.
  for (const [ratio,ok] of [[0,true],[0.5,true],[0.999,true],[1.001,false]]) {
    const sol=solve(FIG2,{P:{x:0,y:(20e-9/1.25)*ratio}});
    assert.equal(sol.ok,ok,`ratio ${ratio}`);
    assert.deepEqual(sol.liftOff,ok?[]:['E']);
  }
});

test('fig4 upward load lifts both balls', () => {
  // Upper M_A: 8 C+12*120=0 -> C=-180. Whole M_B: 6 D+8*120=0 -> D=-160.
  const sol=solve(FIG4,{P:{x:0,y:120}});
  assert.equal(sol.ok,false);
  assert.deepEqual(sol.liftOff,['C','D']);
  assert.ok(Math.abs(sol.values.C+180)<1e-9);
  assert.ok(Math.abs(sol.values.D+160)<1e-9);
});

test('clean removes negative zero and only values strictly below 1e-12', () => {
  for (const v of [0,-0,1e-13,-1e-13]) assert.ok(Object.is(clean(v),0));
  assert.equal(clean(1e-12),1e-12);
  assert.equal(clean(-1e-12),-1e-12);
});

test('solver is pure and force records match the shared interface', () => {
  const fig=structuredClone(FIG4), loads=defaults(fig);
  const before=JSON.stringify({fig,loads});
  const sol=solve(fig,loads);
  assert.equal(JSON.stringify({fig,loads}),before);
  for (const f of sol.forces) {
    assert.deepEqual(Object.keys(f).sort(),['name','sub','kind','member','at','vec','unilateral'].sort());
    assert.equal(typeof f.unilateral,'boolean');
    assert.ok(['load','reaction','pin'].includes(f.kind));
  }
  for (const f of sol.forces.filter(f => f.name==='C')) {
    assert.deepEqual(f.at,fig.joints[1].drawAt[f.member]);
    assert.equal(f.unilateral,true);
  }
});

test('unknown collision is rejected and a support/internal pin shares a letter using #', () => {
  const duplicate=structuredClone(FIG1);
  duplicate.supports[1].name='A';
  assert.throws(() => solve(duplicate,defaults(duplicate)),/collid|duplicate/i);
  const sameLetter=structuredClone(FIG1);
  sameLetter.joints[0].name='A';
  const sol=solve(sameLetter,defaults(sameLetter));
  assert.deepEqual(Object.keys(sol.values).sort(),['Ax','Ay','Bx','By','Ax#','Ay#'].sort());
  assertEquilibrium(sameLetter,sol);
});

test('partial pivoting solves a system with a zero leading diagonal without changing inputs', () => {
  // y=2 and 2x+3y=8 -> x=1. A row swap is required at the first column.
  const matrix=[[0,1],[2,3]], rhs=[2,8];
  assert.deepEqual(solveLinear(matrix,rhs),[1,2]);
  assert.deepEqual(matrix,[[0,1],[2,3]]);
  assert.deepEqual(rhs,[2,8]);
  assert.throws(() => solveLinear([[1,2],[2,4]],[1,2]),/singular/i);
});

test('fig4 with only one contact wanting to pull: the solver names exactly that contact and keeps the raw signed force', () => {
  // Derivation (P acts at (12,2); A is the origin; C is at x=8 on the upper arm, B=(4,-2), D=(10,-2)):
  //   upper arm, moments about A:   8 C + 12 Py - 2 Px = 0        -> C = (2 Px - 12 Py)/8
  //   whole frame, moments about B: 6 D + 8 Py - 4 Px = 0         -> D = (4 Px - 8 Py)/6
  // (a ball pushes when its value is >= 0; negative means it would have to pull, i.e. it lifts off).
  // D pulls but C does not: Px=-120, Py=-40 gives C=30, D=-80/3.
  // C pulls but D does not: need Px<6Py and Px>2Py; Px=120, Py=40 gives C=-30, D=80/3.
  // The solver does not clamp: a lifted contact keeps its (negative) equilibrium value and its force records carry it.
  const upper=(sol,name)=>sol.forces.find(f=>f.name===name && f.member==='upper');
  const lower=(sol,name)=>sol.forces.find(f=>f.name===name && f.member==='lower');
  let sol=solve(FIG4,{P:{x:-120,y:-40}});
  assert.equal(sol.ok,false);
  assert.deepEqual(sol.liftOff,['D']);
  assert.ok(Math.abs(sol.values.C-30)<1e-9);
  assert.ok(Math.abs(sol.values.D+80/3)<1e-9);
  // C pushes: +C on the upper arm, -C on the lower arm. D is a support on the lower arm only: vec = D * normal.
  assert.deepEqual(upper(sol,'C').vec,{x:0,y:sol.values.C});
  assert.deepEqual(lower(sol,'C').vec,{x:0,y:-sol.values.C});
  assert.deepEqual(lower(sol,'D').vec,{x:0,y:sol.values.D});
  assert.ok(lower(sol,'D').vec.y<0 && lower(sol,'D').unilateral);

  sol=solve(FIG4,{P:{x:120,y:40}});
  assert.equal(sol.ok,false);
  assert.deepEqual(sol.liftOff,['C']);
  assert.ok(Math.abs(sol.values.C+30)<1e-9);
  assert.ok(Math.abs(sol.values.D-80/3)<1e-9);
  assert.deepEqual(upper(sol,'C').vec,{x:0,y:-30});
  assert.deepEqual(lower(sol,'C').vec,{x:0,y:30});
  assert.ok(Math.abs(lower(sol,'D').vec.y-80/3)<1e-9);
});
