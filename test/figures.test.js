import test from 'node:test';
import assert from 'node:assert/strict';
import { FIG1 } from '../src/figures/fig1.js';
import { FIG2 } from '../src/figures/fig2.js';
import { FIG3 } from '../src/figures/fig3.js';
import { FIG4 } from '../src/figures/fig4.js';
import { FIG5 } from '../src/figures/fig5.js';
import { FIG6 } from '../src/figures/fig6.js';
import { resolvePoint, nearestPoint, pointOnPath, sampleArc } from '../src/geometry.js';

const figures = [FIG1,FIG2,FIG3,FIG4,FIG5,FIG6];
for (const fig of figures) {
  test(`fig${fig.id} unknown count equals 3 × members`, () => {
    const count = [...fig.supports,...fig.joints].reduce((n,c) => n+(c.kind==='pin'?2:1),0);
    assert.equal(count,3*fig.members.length);
  });
  test(`fig${fig.id} every load point lies on its member`, () => {
    for (const load of fig.loads) {
      const member = fig.members.find(m => m.id===load.member);
      assert.ok(pointOnPath(fig,member,resolvePoint(fig,load.at)));
    }
  });
  test(`fig${fig.id} every joint/support point lies on its member(s)`, () => {
    for (const c of [...fig.supports,...fig.joints]) {
      for (const id of c.members || [c.member]) {
        const member = fig.members.find(m => m.id===id);
        const p = resolvePoint(fig,c.drawAt?.[id] || c.at);
        const q = nearestPoint(fig,member,p);
        // A ball touches the arm surface, half the bar width from its path.
        const expectedDistance = c.drawAt?.[id] ? member.width/2 : 0;
        assert.ok(Math.abs(Math.hypot(p.x-q.x,p.y-q.y)-expectedDistance)<1e-9, `${c.name} on ${id}`);
      }
    }
  });
}

test('arc projection, endpoints and sampling follow the specified circular sweep', () => {
  const member = FIG3.members[0];
  assert.ok(pointOnPath(FIG3,member,FIG3.points.B));
  assert.ok(!pointOnPath(FIG3,member,{x:-1.4,y:0}));
  const samples = sampleArc(FIG3,member.path[0],12);
  assert.equal(samples.length,13);
  assert.deepEqual(samples[0],FIG3.points.C);
  assert.deepEqual(samples.at(-1),FIG3.points.A);
  for (const p of samples) assert.ok(Math.abs(Math.hypot(p.x,p.y)-1.4)<1e-12);
  const q = nearestPoint(FIG3,member,{x:2,y:0});
  assert.ok(Math.hypot(q.x-1.4,q.y)<1e-12);
  // Reversing endpoints and sweep gives the same arc, sampled backwards.
  const reversed = sampleArc(FIG3,{...member.path[0],from:'A',to:'C',ccw:false},12);
  samples.forEach((p,i) => assert.ok(Math.hypot(p.x-reversed[12-i].x,p.y-reversed[12-i].y)<1e-12));
});

test('nearest point clamps lines and arcs to their finite endpoints', () => {
  assert.deepEqual(nearestPoint(FIG1,FIG1.members[0],{x:-1,y:-1}),FIG1.points.A);
  assert.deepEqual(nearestPoint(FIG3,FIG3.members[0],{x:0,y:2}),FIG3.points.A);
});

test('contacts declare their sidedness and unit push normals', () => {
  const unilateral = figures.flatMap(f => [...f.supports,...f.joints].filter(c => c.oneSided).map(c => `${f.id}:${c.name}`));
  assert.deepEqual(unilateral,['2:E','4:D','4:C','5:F','6:F']);
  // Figure 6 (amendment 2026-11-11): C is a full pin, F a one-sided floor roller with its normal up.
  assert.equal(FIG6.joints.find(c => c.name==='C').kind,'pin');
  const roller = FIG6.supports.find(c => c.name==='F');
  assert.deepEqual([roller.kind,roller.oneSided,roller.normal.x,roller.normal.y],['contact',true,0,1]);
  for (const f of figures) for (const c of [...f.supports,...f.joints]) {
    if (c.kind==='contact') assert.ok(Math.abs(Math.hypot(c.normal.x,c.normal.y)-1)<1e-12);
  }
});
