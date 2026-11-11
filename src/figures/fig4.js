export const FIG4 = {
  id: 4, title: 'Frame 4',
  points: {
    A:{x:0,y:0}, B:{x:4,y:-2}, C:{x:8,y:0}, D:{x:10,y:-2}, E:{x:12,y:2},
    upperBend:{x:12,y:0}, lowerBend:{x:0,y:-2}, lowerEnd:{x:11.9,y:-2}
  },
  members: [
    { id:'upper', path:[{seg:'line',from:'A',to:'upperBend'},{seg:'line',from:'upperBend',to:'E'}], width:0.4 },
    { id:'lower', path:[{seg:'line',from:'A',to:'lowerBend'},{seg:'line',from:'lowerBend',to:'lowerEnd'}], width:0.4 }
  ],
  supports: [
    { name:'B', at:'B', member:'lower', kind:'pin', surface:'floor' },
    { name:'D', at:'D', member:'lower', kind:'contact', surface:'floor', normal:{x:0,y:1}, oneSided:true, label:'Ball',
      drawAt:{ lower:{x:10,y:-2.2} } }
  ],
  joints: [
    { name:'A', at:'A', members:['upper','lower'], kind:'pin' },
    // C identifies the upper centreline; the two physical contacts are on the facing surfaces.
    { name:'C', at:'C', members:['upper','lower'], kind:'contact', normal:{x:0,y:1}, oneSided:true, label:'Ball',
      drawAt:{ upper:{x:8,y:-0.2}, lower:{x:8,y:-1.8} } }
  ],
  loads: [{ name:'P', at:{x:12,y:2}, member:'upper', nominal:{x:120,y:0} }],
  balls: [{name:'C',at:{x:8,y:-1},r:0.8}, {name:'D',at:{x:10,y:-2.8},r:0.6}],
  // arrowPerForce: from the layout rule (chooseArrowScale in layout.js). Exploded: the upper arm rises 2.2, so ball C (drawn half way
  // between the arms) has a gap on each side for its two contact arrows; the lower arm stays on its pin B and ball D, so the
  // floor never moves.
  view: { arrowPerForce:0.00977,
    explode:{ upper:{dx:0,dy:2.2}, lower:{dx:0,dy:0} } }
};
