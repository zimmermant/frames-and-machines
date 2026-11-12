export const FIG5 = {
  id: 5, title: 'Frame 5',
  points: { A:{x:0,y:0}, F:{x:3.6,y:0}, B:{x:1.2,y:2}, E:{x:3.6,y:2}, D:{x:3.6,y:4}, C:{x:3.6,y:6} },
  members: [
    { id:'ABC', path:[{seg:'line',from:'A',to:'C'}], width:0.2 },
    { id:'CDEF', path:[{seg:'line',from:'C',to:'F'}], width:0.2 },
    { id:'BE', path:[{seg:'line',from:'B',to:'E'}], width:0.16 }
  ],
  supports: [
    { name:'A', at:'A', member:'ABC', kind:'pin', surface:'floor' },
    { name:'F', at:'F', member:'CDEF', kind:'contact', surface:'floor', normal:{x:0,y:1}, oneSided:true, label:'Roller',
      drawAt:{ CDEF:{x:3.6,y:-0.1} } }
  ],
  joints: [
    { name:'B', at:'B', members:['ABC','BE'], kind:'pin' },
    { name:'C', at:'C', members:['ABC','CDEF'], kind:'pin' },
    { name:'E', at:'E', members:['BE','CDEF'], kind:'pin' }
  ],
  loads: [{ name:'P', at:{x:3.6,y:4}, member:'CDEF', nominal:{x:18,y:0} }],
  balls: [],
  // arrowPerForce: from the layout rule. Exploded: ABC slides left and CDEF (with roller F and its floor) right, 2.4 each,
  // leaving link BE between them with room for the pin-force pairs at B and E.
  view: { arrowPerForce:0.0461,
    explode:{ ABC:{dx:-2.4,dy:0}, CDEF:{dx:2.4,dy:0}, BE:{dx:0,dy:0} } }
};
