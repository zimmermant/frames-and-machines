// Geometry stays in textbook coordinates (y up); rendering owns the y flip.
export function resolvePoint(fig, point) {
  const p = typeof point === 'string' ? fig.points[point] : point;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
    throw new Error(`Invalid figure point: ${String(point)}`);
  }
  return { x:p.x, y:p.y };
}

export function arcAngles(fig, segment) {
  const from = resolvePoint(fig,segment.from);
  const to = resolvePoint(fig,segment.to);
  const start = Math.atan2(from.y-segment.center.y,from.x-segment.center.x);
  const end = Math.atan2(to.y-segment.center.y,to.x-segment.center.x);
  const turn = 2*Math.PI;
  const sweep = segment.ccw ? ((end-start)%turn+turn)%turn : -(((start-end)%turn+turn)%turn);
  return { start, sweep };
}

export function sampleArc(fig, segment, steps = 32) {
  if (!Number.isInteger(steps) || steps<1) throw new Error('Arc sampling needs a positive integer step count');
  const { start, sweep } = arcAngles(fig,segment);
  return Array.from({length:steps+1},(_,i) => {
    if (i===0) return resolvePoint(fig,segment.from);
    if (i===steps) return resolvePoint(fig,segment.to);
    const angle=start+sweep*i/steps;
    return {x:segment.center.x+segment.r*Math.cos(angle),y:segment.center.y+segment.r*Math.sin(angle)};
  });
}

export function nearestPoint(fig, member, point) {
  const p=resolvePoint(fig,point);
  let nearest=null, best=Infinity;
  for (const segment of member.path) {
    const a=resolvePoint(fig,segment.from), b=resolvePoint(fig,segment.to);
    let candidates;
    if (segment.seg==='line') {
      const dx=b.x-a.x, dy=b.y-a.y;
      const length2=dx*dx+dy*dy;
      const t=length2===0 ? 0 : Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length2));
      candidates=[{x:a.x+t*dx,y:a.y+t*dy}];
    } else if (segment.seg==='arc') {
      const { start, sweep }=arcAngles(fig,segment);
      const angle=Math.atan2(p.y-segment.center.y,p.x-segment.center.x);
      const turn=2*Math.PI;
      const travel=(((segment.ccw ? angle-start : start-angle)%turn)+turn)%turn;
      candidates=[a,b];
      if (travel<=Math.abs(sweep)+1e-12) {
        candidates.push({x:segment.center.x+segment.r*Math.cos(angle),y:segment.center.y+segment.r*Math.sin(angle)});
      }
    } else throw new Error(`Unknown path segment: ${segment.seg}`);
    for (const q of candidates) {
      const d=(p.x-q.x)**2+(p.y-q.y)**2;
      if (d<best) { nearest=q; best=d; }
    }
  }
  if (!nearest) throw new Error(`Member ${member.id} has no path`);
  return nearest;
}

export function pointOnPath(fig, member, point, tolerance = 1e-9) {
  const p=resolvePoint(fig,point), q=nearestPoint(fig,member,p);
  return Math.hypot(p.x-q.x,p.y-q.y)<tolerance;
}
