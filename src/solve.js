import { resolvePoint } from './geometry.js';
import { solveLinear } from './linalg.js';

export function clean(value) {
  return Math.abs(value)<1e-12 ? 0 : value;
}

// Positive internal forces act on members[0]; the second member receives
// exactly the opposite. A contact unknown is a signed scalar along its normal.
export function solve(fig, loads) {
  const memberRows=new Map(fig.members.map((m,i) => [m.id,3*i]));
  const origins=fig.members.map(m => resolvePoint(fig,m.path[0].from));
  const unknowns=[];
  const keys=new Set();
  const supportPins=new Set(fig.supports.filter(c => c.kind==='pin').map(c => c.name));
  for (const [connections,internal] of [[fig.supports,false],[fig.joints,true]]) {
    for (const connection of connections) {
      const subs=connection.kind==='pin' ? ['x','y'] : [null];
      for (const sub of subs) {
        const suffix=internal && sub!==null && supportPins.has(connection.name) ? '#' : '';
        const key=connection.name+(sub || '')+suffix;
        if (keys.has(key)) throw new Error(`Unknown names collide: ${key}`);
        keys.add(key);
        const normal=sub==='x' ? {x:1,y:0} : sub==='y' ? {x:0,y:1} : connection.normal;
        if (!normal || !Number.isFinite(normal.x) || !Number.isFinite(normal.y) ||
            Math.abs(Math.hypot(normal.x,normal.y)-1)>1e-9) {
          throw new Error(`Contact ${connection.name} needs a unit normal`);
        }
        const ids=internal ? connection.members : [connection.member];
        const terms=ids.map((member,i) => ({
          name:connection.name, sub, kind:internal?'pin':'reaction', member,
          at:resolvePoint(fig,connection.drawAt?.[member] || connection.at),
          vec:{x:(i===0?1:-1)*normal.x,y:(i===0?1:-1)*normal.y},
          unilateral:connection.oneSided===true
        }));
        unknowns.push({key,connection,terms});
      }
    }
  }
  const n=3*fig.members.length;
  if (unknowns.length!==n) throw new Error(`Expected ${n} unknowns, got ${unknowns.length}`);
  const matrix=Array.from({length:n},() => Array(n).fill(0));
  const rhs=Array(n).fill(0);
  function coefficients(force) {
    const row=memberRows.get(force.member);
    if (row===undefined) throw new Error(`Unknown member: ${force.member}`);
    const origin=origins[row/3];
    return {row, entries:[force.vec.x,force.vec.y,
      (force.at.x-origin.x)*force.vec.y-(force.at.y-origin.y)*force.vec.x]};
  }
  unknowns.forEach((unknown,col) => {
    for (const term of unknown.terms) {
      const {row,entries}=coefficients(term);
      entries.forEach((v,i) => { matrix[row+i][col]+=v; });
    }
  });
  const forces=fig.loads.map(load => {
    const vector=loads[load.name];
    if (!vector || !Number.isFinite(vector.x) || !Number.isFinite(vector.y)) {
      throw new Error(`Missing or invalid load: ${load.name}`);
    }
    return {name:load.name,sub:null,kind:'load',member:load.member,
      at:resolvePoint(fig,load.at),vec:{x:clean(vector.x),y:clean(vector.y)},unilateral:false};
  });
  for (const force of forces) {
    const {row,entries}=coefficients(force);
    entries.forEach((v,i) => { rhs[row+i]-=v; });
  }
  const answer=solveLinear(matrix,rhs).map(clean);
  const values={};
  const liftOff=[];
  // All one-sided figures have one load. The maximum nominal also defines a
  // stable figure-wide force scale if a later figure has several applied loads.
  const nominal=Math.max(0,...fig.loads.map(load => Math.hypot(load.nominal.x,load.nominal.y)));
  unknowns.forEach((unknown,i) => {
    values[unknown.key]=answer[i];
    if (unknown.connection.oneSided && answer[i]<-1e-9*nominal) liftOff.push(unknown.connection.name);
    for (const term of unknown.terms) {
      forces.push({...term,vec:{x:clean(term.vec.x*answer[i]),y:clean(term.vec.y*answer[i])}});
    }
  });
  liftOff.sort();
  return {ok:liftOff.length===0,liftOff,values,forces};
}

// A two-force member has exactly two connections (supports or joints), no load and no contact: its two end forces are
// equal, opposite and along the line between the two points. Found from the figure data, never by name.
export function twoForceMembers(fig) {
  return fig.members.filter(m => {
    const mine=[...fig.supports.filter(s => s.member===m.id),...fig.joints.filter(j => j.members.includes(m.id))];
    return mine.length===2 && !mine.some(c => c.kind==='contact') && !fig.loads.some(l => l.member===m.id);
  }).map(m => m.id);
}

// What is drawn: the solved forces with, on a two-force member, the x and y components of each end merged into ONE force
// along the member (the other member's half of a joint pair at that end merges too, so the pair stays equal and opposite).
// The list's order and length depend only on the figure. role: 'load' | 'component' | 'link' | 'normal'.
export function displayForces(fig, forces) {
  const links=new Set(twoForceMembers(fig));
  const jointOf=name => fig.joints.find(j => j.name===name);
  const merged=new Map(), out=[];
  for (const f of forces) {
    if (f.kind==='load') { out.push({...f,role:'load'}); continue; }
    const connection=f.kind==='pin' ? jointOf(f.name) : fig.supports.find(s => s.name===f.name);
    if (connection.kind==='contact') { out.push({...f,role:'normal'}); continue; }
    const ends=f.kind==='pin' ? connection.members : [connection.member];
    if (!ends.some(id => links.has(id))) { out.push({...f,role:'component'}); continue; }
    const key=`${f.kind}|${f.name}|${f.member}`;
    if (!merged.has(key)) {
      const link=links.has(f.member) ? f.member : ends.find(id => links.has(id));
      const mine=[...fig.supports.filter(s => s.member===link),...fig.joints.filter(j => j.members.includes(link))];
      const [p,q]=mine.map(c => resolvePoint(fig,c.at)), u={x:p.x-q.x,y:p.y-q.y}, len=Math.hypot(u.x,u.y);
      const entry={...f,sub:null,vec:{x:0,y:0},role:'link',axis:{x:u.x/len,y:u.y/len},sum:{x:0,y:0}};
      merged.set(key,entry); out.push(entry);
    }
    const entry=merged.get(key);
    entry.sum.x+=f.vec.x; entry.sum.y+=f.vec.y;
  }
  // Project the summed force onto the member's axis: equilibrium makes it parallel (to rounding), so this only removes noise.
  for (const entry of merged.values()) {
    const along=entry.sum.x*entry.axis.x+entry.sum.y*entry.axis.y;
    entry.vec={x:clean(along*entry.axis.x),y:clean(along*entry.axis.y)};
    delete entry.axis; delete entry.sum;
  }
  return out;
}
