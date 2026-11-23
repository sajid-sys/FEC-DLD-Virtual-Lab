// FEC DLD Virtual Lab — core: board geometry, IC library, logic simulator,
// experiments and guided-build steps. No DOM access, so it also runs in Node for tests.
// Developed and maintained by Shahriar Hossen Sajid.
// ================= Geometry =================
const P=20, COLS=63, BBX=250, PW=1560, PH=830, NSW=12, NLED=8;
const ROWY={TP:250,TN:270,A:310,B:330,C:350,D:370,E:390,F:450,G:470,H:490,I:510,J:530,BN:570,BP:590};
const TOPR=['A','B','C','D','E'], BOTR=['F','G','H','I','J'], RAILS=['TP','TN','BN','BP'];
const RAILNAME={TP:'top + rail (+5 V)',TN:'top − rail (GND)',BN:'bottom − rail (GND)',BP:'bottom + rail (+5 V)'};
const colX=c=>BBX+(c-1)*P;
const railHas=c=>((c-1)%6)!==5;
const ledX=i=>330+(NLED-1-i)*80;
const swX=i=>330+(NSW-1-i)*70;
const NODES=new Map();
function addNode(id,x,y,strip,kind,label){NODES.set(id,{id,x,y,strip,kind,label});}
for(let c=1;c<=COLS;c++){
  for(const r of TOPR) addNode(r+c,colX(c),ROWY[r],'U'+c,'hole','Hole '+r+c);
  for(const r of BOTR) addNode(r+c,colX(c),ROWY[r],'D'+c,'hole','Hole '+r+c);
  if(railHas(c)) for(const r of RAILS) addNode(r+c,colX(c),ROWY[r],r,'rail','Hole on the '+RAILNAME[r]);
}
for(let i=0;i<NLED;i++)addNode('L'+i,ledX(i),135,'L'+i,'sock','LED L'+i+' input');
for(let i=0;i<NSW;i++)addNode('S'+i,swX(i),660,'S'+i,'sock','Switch S'+i+' output');
for(let k=0;k<4;k++){addNode('VCC'+k,50+k*40,360,'VCC','sock','+5 V supply terminal');addNode('GND'+k,50+k*40,450,'GND','sock','GND terminal');}

// ================= IC library =================
const CHIPS={};
const chipName=n=>'74LS'+n.slice(2);
function gateChip(num,kind,gates,op,opts={}){
  const n=14,names=Array(n).fill('NC'),role=Array(n).fill('nc');
  names[13]='VCC';role[13]='vcc';names[6]='GND';role[6]='gnd';
  gates.forEach((g,gi)=>{const ins=g.slice(0,-1),out=g[g.length-1];
    ins.forEach((p,k)=>{names[p-1]=(gi+1)+(ins.length===1?'A':'AB'[k]);role[p-1]='in';});
    names[out-1]=(gi+1)+'Y';role[out-1]='out';});
  CHIPS[num]={num,kind,pins:n,vcc:14,gnd:7,names,role,gates,note:opts.note||'',sym:opts.sym,
    eval(v){const o={};for(const g of gates){o[g[g.length-1]]=op(g.slice(0,-1).map(p=>v[p]))?1:0;}return o;}};
}
function msiChip(num,kind,names,outs,fn,opts={}){
  const role=names.map(nm=>nm==='VCC'?'vcc':nm==='GND'?'gnd':outs.includes(nm)?'out':'in');
  CHIPS[num]={num,kind,pins:names.length,vcc:names.indexOf('VCC')+1,gnd:names.indexOf('GND')+1,names,role,note:opts.note||'',sym:opts.sym,
    eval(v){const b={};names.forEach((nm,i)=>b[nm]=v[i+1]);const r=fn(b),o={};for(const k in r)o[names.indexOf(k)+1]=r[k]?1:0;return o;}};
}
const G2=[[1,2,3],[4,5,6],[10,9,8],[13,12,11]], G02=[[2,3,1],[5,6,4],[8,9,10],[11,12,13]], G04=[[1,2],[3,4],[5,6],[9,8],[11,10],[13,12]];
const and=a=>a.every(x=>x), or=a=>a.some(x=>x);
gateChip('7400','Quad 2-input NAND',G2,a=>!and(a),{sym:'nand'});
gateChip('7402','Quad 2-input NOR',G02,a=>!or(a),{sym:'nor',note:'Careful: the 7402 pinout differs from the 7400 — the outputs are pins 1, 4, 10 and 13.'});
gateChip('7404','Hex inverter (NOT)',G04,a=>!a[0],{sym:'not'});
gateChip('7408','Quad 2-input AND',G2,and,{sym:'and'});
gateChip('7432','Quad 2-input OR',G2,or,{sym:'or'});
gateChip('7486','Quad 2-input XOR',G2,a=>a[0]^a[1],{sym:'xor'});
msiChip('74148','8-to-3 priority encoder',['I4','I5','I6','I7','EI','A2','A1','GND','A0','I0','I1','I2','I3','GS','EO','VCC'],['A0','A1','A2','GS','EO'],b=>{
  if(b.EI)return{A0:1,A1:1,A2:1,GS:1,EO:1};
  for(let i=7;i>=0;i--)if(!b['I'+i]){const c=(~i)&7;return{A0:c&1,A1:c>>1&1,A2:c>>2&1,GS:0,EO:1};}
  return{A0:1,A1:1,A2:1,GS:1,EO:0};},{sym:'ENC',note:'Everything is active-LOW: an input is selected when it is 0, and the code comes out inverted. Tie EI (pin 5) to GND to enable it.'});
msiChip('74138','3-to-8 decoder / 1-to-8 demultiplexer',['A','B','C','G2A','G2B','G1','Y7','GND','Y6','Y5','Y4','Y3','Y2','Y1','Y0','VCC'],['Y0','Y1','Y2','Y3','Y4','Y5','Y6','Y7'],b=>{
  const en=b.G1&&!b.G2A&&!b.G2B,s=b.A+2*b.B+4*b.C,o={};for(let i=0;i<8;i++)o['Y'+i]=!(en&&s===i);return o;},{sym:'DEC',note:'Outputs are active-LOW. It is enabled only when G1 = HIGH, G2A = LOW and G2B = LOW.'});
msiChip('74151','8-to-1 multiplexer',['D3','D2','D1','D0','Y','W','G','GND','C','B','A','D7','D6','D5','D4','VCC'],['Y','W'],b=>{
  if(b.G)return{Y:0,W:1};const y=b['D'+(b.A+2*b.B+4*b.C)];return{Y:y,W:!y};},{sym:'MUX',note:'The strobe G (pin 7) is active-LOW: tie it to GND. W is the inverted output.'});
msiChip('7485','4-bit magnitude comparator',['B3','A<B in','A=B in','A>B in','A>B','A=B','A<B','GND','B0','A0','B1','A1','A2','B2','A3','VCC'],['A>B','A=B','A<B'],b=>{
  const a=b.A0+2*b.A1+4*b.A2+8*b.A3,c=b.B0+2*b.B1+4*b.B2+8*b.B3;
  if(a>c)return{'A>B':1,'A=B':0,'A<B':0};if(a<c)return{'A>B':0,'A=B':0,'A<B':1};
  if(b['A=B in'])return{'A>B':0,'A=B':1,'A<B':0};
  return{'A>B':!b['A<B in'],'A=B':0,'A<B':!b['A>B in']};},{sym:'CMP',note:'For a single chip set the cascade inputs: A=B in (pin 3) to +5 V; A>B in (pin 4) and A<B in (pin 2) to GND.'});
const CHIP_ORDER=['7400','7402','7404','7408','7432','7486','74148','74138','74151','7485'];
for(const k in CHIPS){const ch=CHIPS[k];ch.evalNamed=b=>{const v=[0];for(let p=1;p<=ch.pins;p++)v.push(b[ch.names[p-1]]??0);const o=ch.eval(v),r={};for(const p in o)r[ch.names[p-1]]=o[p];return r;};}

function pinNode(ic,p){const ch=CHIPS[ic.type],h=ch.pins/2;return p<=h?'F'+(ic.col+p-1):'E'+(ic.col+(ch.pins-p));}
function pinsOf(ic){const ch=CHIPS[ic.type],r=[];for(let p=1;p<=ch.pins;p++)r.push(pinNode(ic,p));return r;}

// ================= State =================
function freshState(){return{ics:[],wires:[],nextId:1,sw:Array(NSW).fill(0),power:true};}
function nextRef(st){const used=new Set(st.ics.map(i=>i.ref));let k=1;while(used.has('U'+k))k++;return'U'+k;}
function occupied(st){
  const m=new Map();
  for(const ic of st.ics)for(const h of pinsOf(ic))m.set(h,{kind:'ic',id:ic.id});
  for(const w of st.wires)for(const e of[w.a,w.b])if(NODES.get(e).kind!=='sock')m.set(e,{kind:'wire',id:w.id});
  return m;
}
function stripHoles(id){const n=NODES.get(id);if(n.kind!=='hole')return[id];const c=n.strip.slice(1);
  return(n.strip[0]==='U'?['D','C','B','A','E']:['G','H','I','J','F']).map(r=>r+c);}
function icFits(st,type,col,ignoreId){
  const h=CHIPS[type].pins/2;if(col<1||col+h-1>COLS)return false;
  for(const ic of st.ics){if(ic.id===ignoreId)continue;const h2=CHIPS[ic.type].pins/2;if(col<=ic.col+h2&&ic.col<=col+h)return false;}
  const occ=occupied(st);for(const p of pinsOf({type,col}))if(occ.has(p)&&occ.get(p).kind!=='ic')return false;
  return true;
}

// ================= Simulation =================
// values: 0 LOW, 1 HIGH, 2 floating, 3 conflict
function compile(st){
  const idx=new Map(),parent=[];
  const id=k=>{let i=idx.get(k);if(i===undefined){i=parent.length;idx.set(k,i);parent.push(i);}return i;};
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const uni=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[a]=b;};
  for(const nd of NODES.values())uni(id(nd.id),id('#'+nd.strip));
  for(const w of st.wires)uni(id(w.a),id(w.b));
  const rootN=new Map(),netOf=new Map();let N=0;
  for(const[k,i]of idx){const r=find(i);let n=rootN.get(r);if(n===undefined){n=N++;rootN.set(r,n);}netOf.set(k,n);}
  const net=k=>netOf.get(k);
  const members=Array.from({length:N},()=>[]);
  for(const nd of NODES.values())members[net(nd.id)].push(nd.id);
  return{N,net,members,
    ics:st.ics.map(ic=>{const ch=CHIPS[ic.type],pn=[0];for(let p=1;p<=ch.pins;p++)pn.push(net(pinNode(ic,p)));return{ic,ch,pn};}),
    sw:Array.from({length:NSW},(_,i)=>net('S'+i)),vcc:net('VCC0'),gnd:net('GND0')};
}
function run(C,sw,power){
  const N=C.N,d0=new Uint16Array(N),d1=new Uint16Array(N),val=new Uint8Array(N);
  const outs=C.ics.map(()=>null),status=C.ics.map(()=>'off');let iter=0,osc=false;
  for(;;){
    d0.fill(0);d1.fill(0);
    if(power){d1[C.vcc]++;d0[C.gnd]++;for(let i=0;i<NSW;i++)(sw[i]?d1:d0)[C.sw[i]]++;}
    C.ics.forEach((x,k)=>{const o=outs[k];if(!o)return;for(const p in o)(o[p]?d1:d0)[x.pn[p]]++;});
    for(let n=0;n<N;n++)val[n]=d0[n]&&d1[n]?3:d1[n]?1:d0[n]?0:2;
    let changed=false;
    C.ics.forEach((x,k)=>{const vv=val[x.pn[x.ch.vcc]],gv=val[x.pn[x.ch.gnd]];
      const s=vv===1&&gv===0?'ok':vv===0&&gv===1?'rev':'off';status[k]=s;let o=null;
      if(s==='ok'){const v=[0];for(let p=1;p<=x.ch.pins;p++)v.push(val[x.pn[p]]===0?0:1);o=x.ch.eval(v);}
      if(JSON.stringify(o)!==JSON.stringify(outs[k])){changed=true;outs[k]=o;}});
    if(!changed)break;if(++iter>80){osc=true;break;}
  }
  return{val,status,outs,osc,read:id=>val[C.net(id)]};
}
function readOut(C,R,sock){return R.val[C.net(sock)]===1?1:0;}

// ================= Experiments =================
function rowsAll(n){const r=[];for(let i=0;i<1<<n;i++){const v=[];for(let b=n-1;b>=0;b--)v.push(i>>b&1);r.push(v);}return r;}
function autoColor(a,b){const pos=x=>/^(VCC|TP|BP)/.test(x),neg=x=>/^(GND|TN|BN)/.test(x);
  if(pos(a)||pos(b))return'#DC2626';if(neg(a)||neg(b))return'#1F2937';return null;}
function makeApi(st){
  const COL=['#2563EB','#16A34A','#EAB308','#EA580C','#7C3AED','#0EA5E9','#DB2777','#65A30D'];let ci=0;
  const ic=id=>st.ics.find(i=>i.id===id);
  const railNear=(r,c)=>{const occ=occupied(st);for(let k=0;k<COLS;k++)for(const cc of[c+k,c-k])if(cc>=1&&cc<=COLS&&railHas(cc)&&!occ.has(r+cc))return r+cc;throw Error('rail full');};
  const api={
    ic(type,col){const id=st.nextId++;st.ics.push({id,ref:nextRef(st),type,col});return id;},
    pin(id,p){return{id,p};},
    resolve(x){
      if(typeof x==='string'){if(x.includes('@')){const[r,c]=x.split('@');return railNear(r,+c);}return x;}
      const pn=pinNode(ic(x.id),x.p),occ=occupied(st);for(const h of stripHoles(pn))if(!occ.has(h))return h;throw Error('strip full at '+pn);},
    w(a,b){a=api.resolve(a);b=api.resolve(b);st.wires.push({id:st.nextId++,a,b,color:autoColor(a,b)||COL[ci++%COL.length]});},
    rails(){api.w('VCC0','TP@2');api.w('GND0','TN@3');api.w('VCC1','BP@2');api.w('GND1','BN@3');},
    railFor(id,p,pos){const n=pinNode(ic(id),p),top=n[0]==='E';return(pos?(top?'TP':'BP'):(top?'TN':'BN'))+'@'+(+n.slice(1));},
    vcc(id,p){api.w(api.pin(id,p),api.railFor(id,p,true));},
    gnd(id,p){api.w(api.pin(id,p),api.railFor(id,p,false));},
    power(id){const ch=CHIPS[ic(id).type];api.vcc(id,ch.vcc);api.gnd(id,ch.gnd);},
  };
  return api;
}
const pw=ch=>`Power the IC: pin ${CHIPS[ch].vcc} → +5 V and pin ${CHIPS[ch].gnd} → GND. Tip: first wire the trainer's +5 V terminal to the red + rail and GND to the blue − rail.`;
const placeStep=ch=>`Add a ${chipName(ch)} (use the Add button above). It sits across the centre gap with the notch on the left, so pin 1 is the bottom-left pin.`;
const pw14=list=>`Power every IC: pin 14 → +5 V and pin 7 → GND (${list}).`;
const FINAL='Flip the switches through every row of the truth table, watch the LEDs, then press Check my circuit.';
const G1='Exp 1 · Fundamental logic gates',G2N='Exp 2 · Universality of NAND',G3N='Exp 3 · Universality of NOR',G4='Exp 4 · Simplification of a logic expression',G5='Exp 5 · Half adder',G6='Exp 6 · Full adder';

function gateExp(id,ch,name,op,expr,theory){
  const g=CHIPS[ch].gates[0],one=g.length===2;
  return{id,group:G1,title:name+' gate',chips:[ch],sym:CHIPS[ch].sym,
    ins:one?[['A','S0']]:[['A','S1'],['B','S0']],outs:[['Y','L0']],
    f:i=>({Y:op(i)?1:0}),expr,theory,
    objective:`Verify the truth table of the ${name} gate using the ${chipName(ch)} IC.`,
    steps:[placeStep(ch),pw(ch),one?`Wire switch S0 to pin ${g[0]} (input A).`:`Wire switch S1 to pin ${g[0]} (input A) and switch S0 to pin ${g[1]} (input B).`,`Wire pin ${g[g.length-1]} (output Y) to LED L0.`,FINAL],
    solve(a){a.rails();const u=a.ic(ch,10);a.power(u);
      if(one){a.w('S0',a.pin(u,g[0]));a.w(a.pin(u,g[1]),'L0');}
      else{a.w('S1',a.pin(u,g[0]));a.w('S0',a.pin(u,g[1]));a.w(a.pin(u,g[2]),'L0');}}};
}
const EXPS=[
  gateExp('and','7408','AND',i=>i.A&&i.B,'Y = A · B','The output is HIGH only when every input is HIGH — like two switches in series.'),
  gateExp('or','7432','OR',i=>i.A||i.B,'Y = A + B','The output is HIGH when at least one input is HIGH — like two switches in parallel.'),
  gateExp('not','7404','NOT',i=>!i.A,'Y = A′','An inverter gives the opposite level at its output. The 7404 holds six of them.'),
  gateExp('nand','7400','NAND',i=>!(i.A&&i.B),'Y = (A · B)′','AND followed by NOT: the output goes LOW only when both inputs are HIGH.'),
  gateExp('nor','7402','NOR',i=>!(i.A||i.B),'Y = (A + B)′','OR followed by NOT: the output is HIGH only when both inputs are LOW. The 7402 pinout differs from the other gate chips.'),
  gateExp('xor','7486','XOR',i=>i.A!==i.B,'Y = A ⊕ B = A′B + AB′','Exclusive-OR is HIGH when the inputs are different. It is the heart of every adder.'),
  {id:'xnor',group:G1,title:'XNOR gate',chips:['7486','7404'],sym:'xnor',ins:[['A','S1'],['B','S0']],outs:[['Y','L0']],f:i=>({Y:i.A===i.B?1:0}),
    expr:'Y = (A ⊕ B)′',objective:'Verify the XNOR function by following an XOR gate with a NOT gate.',
    theory:'Exclusive-NOR is HIGH when the inputs are equal. Here it is built by inverting the output of an XOR gate.',
    steps:['Add a 74LS86 and a 74LS04.',pw14('both ICs'),'XOR: S1 → pin 1, S0 → pin 2. Pin 3 gives A ⊕ B.','Wire XOR pin 3 → NOT pin 1. NOT pin 2 is Y: wire it to LED L0.',FINAL],
    solve(a){a.rails();const x=a.ic('7486',6),n=a.ic('7404',18);a.power(x);a.power(n);a.w('S1',a.pin(x,1));a.w('S0',a.pin(x,2));a.w(a.pin(x,3),a.pin(n,1));a.w(a.pin(n,2),'L0');}},

  {id:'nand-not',group:G2N,title:'NOT from NAND',chips:['7400'],sym:'nand',only:['7400'],ins:[['A','S0']],outs:[['Y','L0']],f:i=>({Y:1-i.A}),
    expr:'(A · A)′ = A′',objective:'Make a NOT gate using one NAND gate.',
    theory:'Tie both inputs of a NAND gate together. Since A · A = A, the output is simply A′.',
    steps:[placeStep('7400'),pw('7400'),'Wire S0 to both pin 1 and pin 2.','Wire pin 3 to LED L0.',FINAL],
    solve(a){a.rails();const u=a.ic('7400',10);a.power(u);a.w('S0',a.pin(u,1));a.w('S0',a.pin(u,2));a.w(a.pin(u,3),'L0');}},
  {id:'nand-and',group:G2N,title:'AND from NAND',chips:['7400'],sym:'nand',only:['7400'],ins:[['A','S1'],['B','S0']],outs:[['Y','L0']],f:i=>({Y:i.A&i.B}),
    expr:'((A · B)′)′ = A · B',objective:'Make an AND gate using only NAND gates.',
    theory:'A NAND gives (A · B)′. Feed it into a second NAND wired as a NOT gate to invert it back to A · B.',
    steps:[placeStep('7400'),pw('7400'),'Gate 1: S1 → pin 1, S0 → pin 2. Pin 3 gives (AB)′.','Gate 2 as a NOT: wire pin 3 to both pin 4 and pin 5.','Wire pin 6 to LED L0.',FINAL],
    solve(a){a.rails();const u=a.ic('7400',10);a.power(u);a.w('S1',a.pin(u,1));a.w('S0',a.pin(u,2));a.w(a.pin(u,3),a.pin(u,4));a.w(a.pin(u,3),a.pin(u,5));a.w(a.pin(u,6),'L0');}},
  {id:'nand-or',group:G2N,title:'OR from NAND',chips:['7400'],sym:'nand',only:['7400'],ins:[['A','S1'],['B','S0']],outs:[['Y','L0']],f:i=>({Y:i.A|i.B}),
    expr:'(A′ · B′)′ = A + B',objective:'Make an OR gate using only NAND gates.',
    theory:'Invert A and B with two NANDs wired as NOT gates, then NAND the results. By De Morgan’s theorem (A′ · B′)′ = A + B.',
    steps:[placeStep('7400'),pw('7400'),'Gate 1: wire S1 to pin 1 and pin 2. Pin 3 gives A′.','Gate 2: wire S0 to pin 4 and pin 5. Pin 6 gives B′.','Gate 3: pin 3 → pin 10 and pin 6 → pin 9.','Wire pin 8 to LED L0.',FINAL],
    solve(a){a.rails();const u=a.ic('7400',10);a.power(u);a.w('S1',a.pin(u,1));a.w('S1',a.pin(u,2));a.w('S0',a.pin(u,4));a.w('S0',a.pin(u,5));a.w(a.pin(u,3),a.pin(u,10));a.w(a.pin(u,6),a.pin(u,9));a.w(a.pin(u,8),'L0');}},

  {id:'nor-not',group:G3N,title:'NOT from NOR',chips:['7402'],sym:'nor',only:['7402'],ins:[['A','S0']],outs:[['Y','L0']],f:i=>({Y:1-i.A}),
    expr:'(A + A)′ = A′',objective:'Make a NOT gate using one NOR gate.',
    theory:'Tie both inputs of a NOR gate together. Since A + A = A, the output is A′.',
    steps:[placeStep('7402'),pw('7402'),'The first NOR gate has inputs on pins 2 and 3 and its output on pin 1. Wire S0 to pin 2 and pin 3.','Wire pin 1 to LED L0.',FINAL],
    solve(a){a.rails();const u=a.ic('7402',10);a.power(u);a.w('S0',a.pin(u,2));a.w('S0',a.pin(u,3));a.w(a.pin(u,1),'L0');}},
  {id:'nor-or',group:G3N,title:'OR from NOR',chips:['7402'],sym:'nor',only:['7402'],ins:[['A','S1'],['B','S0']],outs:[['Y','L0']],f:i=>({Y:i.A|i.B}),
    expr:'((A + B)′)′ = A + B',objective:'Make an OR gate using only NOR gates.',
    theory:'A NOR gives (A + B)′. Invert it with a second NOR wired as a NOT gate to get A + B.',
    steps:[placeStep('7402'),pw('7402'),'Gate 1: S1 → pin 2, S0 → pin 3. Pin 1 gives (A + B)′.','Gate 2 as a NOT: wire pin 1 to both pin 5 and pin 6.','Wire pin 4 to LED L0.',FINAL],
    solve(a){a.rails();const u=a.ic('7402',10);a.power(u);a.w('S1',a.pin(u,2));a.w('S0',a.pin(u,3));a.w(a.pin(u,1),a.pin(u,5));a.w(a.pin(u,1),a.pin(u,6));a.w(a.pin(u,4),'L0');}},
  {id:'nor-and',group:G3N,title:'AND from NOR',chips:['7402'],sym:'nor',only:['7402'],ins:[['A','S1'],['B','S0']],outs:[['Y','L0']],f:i=>({Y:i.A&i.B}),
    expr:'(A′ + B′)′ = A · B',objective:'Make an AND gate using only NOR gates.',
    theory:'Invert A and B with two NORs wired as NOT gates, then NOR the results. By De Morgan’s theorem (A′ + B′)′ = A · B.',
    steps:[placeStep('7402'),pw('7402'),'Gate 1 (inputs 2, 3 → output 1): wire S1 to pin 2 and pin 3. Pin 1 gives A′.','Gate 2 (inputs 5, 6 → output 4): wire S0 to pin 5 and pin 6. Pin 4 gives B′.','Gate 3 (inputs 8, 9 → output 10): pin 1 → pin 8 and pin 4 → pin 9.','Wire pin 10 to LED L0.',FINAL],
    solve(a){a.rails();const u=a.ic('7402',10);a.power(u);a.w('S1',a.pin(u,2));a.w('S1',a.pin(u,3));a.w('S0',a.pin(u,5));a.w('S0',a.pin(u,6));a.w(a.pin(u,1),a.pin(u,8));a.w(a.pin(u,4),a.pin(u,9));a.w(a.pin(u,10),'L0');}},

  {id:'simp',group:G4,title:'Simplify F = Σm(1,3,5,6,7)',chips:['7408','7432'],sym:'KMAP',ins:[['A','S2'],['B','S1'],['C','S0']],outs:[['F','L0']],
    f:i=>({F:[1,3,5,6,7].includes(i.A*4+i.B*2+i.C)?1:0}),
    expr:'F = A′B′C + A′BC + AB′C + ABC′ + ABC  →  F = C + AB',objective:'Simplify a 3-variable function with a K-map, then build the simplified circuit with as few gates as possible.',
    theory:'On the K-map the four minterms with C = 1 (m1, m3, m5, m7) form one group of four, which gives the term C. Minterms m6 and m7 form a pair, which gives AB. So the five-term expression shrinks to F = C + AB: one AND gate and one OR gate instead of five 3-input ANDs.',
    steps:['Add a 74LS08 and a 74LS32.',pw14('both ICs'),'AND: S2 → pin 1 (A), S1 → pin 2 (B). Pin 3 gives AB.','OR: AND pin 3 → OR pin 1, S0 → OR pin 2 (C).','Wire OR pin 3 to LED L0 (F).',FINAL],
    solve(a){a.rails();const n=a.ic('7408',6),o=a.ic('7432',18);a.power(n);a.power(o);a.w('S2',a.pin(n,1));a.w('S1',a.pin(n,2));a.w(a.pin(n,3),a.pin(o,1));a.w('S0',a.pin(o,2));a.w(a.pin(o,3),'L0');}},

  {id:'half',group:G5,title:'Half adder',chips:['7486','7408'],sym:'SUM',ins:[['A','S1'],['B','S0']],outs:[['C','L1'],['S','L0']],f:i=>({S:i.A^i.B,C:i.A&i.B}),
    expr:'S = A ⊕ B,   C = A · B',objective:'Design a circuit that adds two 1-bit numbers, giving a sum S and a carry C.',
    theory:'1 + 1 = 10 in binary, so adding two bits needs two outputs. The sum bit is the XOR of the inputs and the carry bit is their AND.',
    steps:['Add a 74LS86 (XOR) and a 74LS08 (AND).',pw14('both ICs'),'XOR: S1 → pin 1, S0 → pin 2. Pin 3 is the sum: wire it to LED L0.','AND: S1 → pin 1, S0 → pin 2. Pin 3 is the carry: wire it to LED L1.',FINAL],
    solve(a){a.rails();const x=a.ic('7486',6),n=a.ic('7408',18);a.power(x);a.power(n);a.w('S1',a.pin(x,1));a.w('S0',a.pin(x,2));a.w(a.pin(x,3),'L0');a.w('S1',a.pin(n,1));a.w('S0',a.pin(n,2));a.w(a.pin(n,3),'L1');}},
  {id:'full',group:G6,title:'Full adder',chips:['7486','7408','7432'],sym:'SUM',ins:[['A','S2'],['B','S1'],['Cin','S0']],outs:[['Cout','L1'],['S','L0']],
    f:i=>({S:i.A^i.B^i.Cin,Cout:(i.A&i.B)|((i.A^i.B)&i.Cin)}),
    expr:'S = A ⊕ B ⊕ Cin,   Cout = AB + Cin(A ⊕ B)',objective:'Design a circuit that adds three bits (A, B and an incoming carry) using two half adders and an OR gate.',
    theory:'The first half adder makes P = A ⊕ B and the carry AB. The second adds Cin to P: the sum is P ⊕ Cin and its carry is P · Cin. If either half adder produces a carry, Cout is 1, so the two carries are ORed.',
    steps:['Add a 74LS86, a 74LS08 and a 74LS32.',pw14('all three ICs'),'XOR: S2 → pin 1, S1 → pin 2 (pin 3 = P). Then pin 3 → pin 4 and S0 → pin 5. Pin 6 is the sum → LED L0.','AND: S2 → pin 1, S1 → pin 2 (pin 3 = AB). XOR pin 3 → AND pin 4, S0 → AND pin 5 (pin 6 = P·Cin).','OR: AND pin 3 → OR pin 1, AND pin 6 → OR pin 2. OR pin 3 is Cout → LED L1.',FINAL],
    solve(a){a.rails();const x=a.ic('7486',5),n=a.ic('7408',16),o=a.ic('7432',27);[x,n,o].forEach(a.power);
      a.w('S2',a.pin(x,1));a.w('S1',a.pin(x,2));a.w(a.pin(x,3),a.pin(x,4));a.w('S0',a.pin(x,5));a.w(a.pin(x,6),'L0');
      a.w('S2',a.pin(n,1));a.w('S1',a.pin(n,2));a.w(a.pin(x,3),a.pin(n,4));a.w('S0',a.pin(n,5));
      a.w(a.pin(n,3),a.pin(o,1));a.w(a.pin(n,6),a.pin(o,2));a.w(a.pin(o,3),'L1');}},

  {id:'enc42',group:'Encoder',title:'4-to-2 encoder (gates)',chips:['7432'],sym:'ENC',ins:[['D3','S3'],['D2','S2'],['D1','S1'],['D0','S0']],outs:[['Y1','L1'],['Y0','L0']],
    rows:[[0,0,0,1],[0,0,1,0],[0,1,0,0],[1,0,0,0]],f:i=>({Y1:i.D2|i.D3,Y0:i.D1|i.D3}),
    expr:'Y1 = D2 + D3,   Y0 = D1 + D3',objective:'Turn one active input out of four into its 2-bit binary code.',
    theory:'Exactly one input is HIGH at a time, and the output is its number in binary. Y0 is HIGH for inputs 1 and 3; Y1 for inputs 2 and 3. Two OR gates are enough.',
    steps:[placeStep('7432'),pw('7432'),'Gate 1: S1 → pin 1, S3 → pin 2. Pin 3 is Y0 → LED L0.','Gate 2: S2 → pin 4, S3 → pin 5. Pin 6 is Y1 → LED L1.','Turn on only one of S0–S3 at a time and read the code on L1 L0, then press Check my circuit.'],
    solve(a){a.rails();const o=a.ic('7432',10);a.power(o);a.w('S1',a.pin(o,1));a.w('S3',a.pin(o,2));a.w(a.pin(o,3),'L0');a.w('S2',a.pin(o,4));a.w('S3',a.pin(o,5));a.w(a.pin(o,6),'L1');}},
  {id:'enc148',group:'Encoder',title:'8-to-3 priority encoder (74148)',chips:['74148'],sym:'ENC',
    ins:[7,6,5,4,3,2,1,0].map(i=>['I'+i,'S'+i]),outs:[['EO','L4'],['GS','L3'],['A2','L2'],['A1','L1'],['A0','L0']],
    f:i=>CHIPS['74148'].evalNamed({...i,EI:0}),
    expr:'Active-LOW: the highest input Ik = 0 gives A2 A1 A0 = k inverted',objective:'Encode eight inputs into 3 bits, where the highest-numbered active input wins.',
    theory:'If several inputs are active at once, a priority encoder reports only the highest one. The 74148 uses active-LOW signals: an input is active when it is 0, and the code comes out inverted (I7 gives 000, I0 gives 111). GS goes LOW when any input is active; EO goes LOW when none are.',
    steps:[placeStep('74148'),pw('74148'),'Inputs: S0 → pin 10, S1 → 11, S2 → 12, S3 → 13, S4 → 1, S5 → 2, S6 → 3, S7 → 4.','Tie EI (pin 5) to GND to enable the chip.','Outputs: pin 9 (A0) → L0, pin 7 (A1) → L1, pin 6 (A2) → L2, pin 14 (GS) → L3, pin 15 (EO) → L4.','Set every switch to 1 (inactive), then set one to 0 at a time. Check my circuit tests all 256 combinations.'],
    solve(a){a.rails();const u=a.ic('74148',12);a.power(u);[[10,0],[11,1],[12,2],[13,3],[1,4],[2,5],[3,6],[4,7]].forEach(([p,s])=>a.w('S'+s,a.pin(u,p)));
      a.gnd(u,5);[[9,'L0'],[7,'L1'],[6,'L2'],[14,'L3'],[15,'L4']].forEach(([p,l])=>a.w(a.pin(u,p),l));}},
  {id:'dec24',group:'Decoder',title:'2-to-4 decoder (gates)',chips:['7404','7408'],sym:'DEC',ins:[['A','S1'],['B','S0']],outs:[['Y3','L3'],['Y2','L2'],['Y1','L1'],['Y0','L0']],
    f:i=>({Y0:!i.A&&!i.B?1:0,Y1:!i.A&&i.B?1:0,Y2:i.A&&!i.B?1:0,Y3:i.A&&i.B?1:0}),
    expr:'Y0 = A′B′,  Y1 = A′B,  Y2 = AB′,  Y3 = AB',objective:'Turn on exactly one of four outputs for each 2-bit input code.',
    theory:'A decoder turns a binary number into "one-hot" form: for AB = 10 (two) only Y2 goes HIGH. Each output is one minterm, made with an AND gate fed by the true or inverted inputs.',
    steps:['Add a 74LS04 and a 74LS08.',pw14('both ICs'),'Inverters: S1 → pin 1 (pin 2 = A′), S0 → pin 3 (pin 4 = B′).','Y0: NOT pin 2 → AND pin 1, NOT pin 4 → AND pin 2, AND pin 3 → L0.','Y1: NOT pin 2 → AND pin 4, S0 → AND pin 5, AND pin 6 → L1.','Y2: S1 → AND pin 10, NOT pin 4 → AND pin 9, AND pin 8 → L2.','Y3: S1 → AND pin 13, S0 → AND pin 12, AND pin 11 → L3.',FINAL],
    solve(a){a.rails();const v=a.ic('7404',5),n=a.ic('7408',16);a.power(v);a.power(n);a.w('S1',a.pin(v,1));a.w('S0',a.pin(v,3));
      a.w(a.pin(v,2),a.pin(n,1));a.w(a.pin(v,4),a.pin(n,2));a.w(a.pin(n,3),'L0');a.w(a.pin(v,2),a.pin(n,4));a.w('S0',a.pin(n,5));a.w(a.pin(n,6),'L1');
      a.w('S1',a.pin(n,10));a.w(a.pin(v,4),a.pin(n,9));a.w(a.pin(n,8),'L2');a.w('S1',a.pin(n,13));a.w('S0',a.pin(n,12));a.w(a.pin(n,11),'L3');}},
  {id:'dec138',group:'Decoder',title:'3-to-8 decoder (74138)',chips:['74138'],sym:'DEC',ins:[['C','S2'],['B','S1'],['A','S0']],outs:[7,6,5,4,3,2,1,0].map(i=>['Y'+i,'L'+i]),
    f:i=>{const s=i.A+2*i.B+4*i.C,o={};for(let k=0;k<8;k++)o['Y'+k]=s===k?0:1;return o;},
    expr:'The selected output Yk goes LOW, where k = CBA',objective:'Decode a 3-bit code into one of eight active-LOW outputs.',
    theory:'When the chip is enabled, the output whose number matches CBA goes LOW and the other seven stay HIGH. On the trainer the selected LED turns OFF while the rest stay lit — that is what active-LOW looks like.',
    steps:[placeStep('74138'),pw('74138'),'Select inputs: S0 → pin 1 (A), S1 → pin 2 (B), S2 → pin 3 (C).','Enable: G1 (pin 6) → +5 V; G2A (pin 4) and G2B (pin 5) → GND.','Outputs: pin 15 (Y0) → L0, 14 → L1, 13 → L2, 12 → L3, 11 → L4, 10 → L5, 9 → L6, 7 (Y7) → L7.',FINAL],
    solve(a){a.rails();const u=a.ic('74138',12);a.power(u);a.w('S0',a.pin(u,1));a.w('S1',a.pin(u,2));a.w('S2',a.pin(u,3));a.vcc(u,6);a.gnd(u,4);a.gnd(u,5);
      [[15,0],[14,1],[13,2],[12,3],[11,4],[10,5],[9,6],[7,7]].forEach(([p,l])=>a.w(a.pin(u,p),'L'+l));}},
  {id:'mux21',group:'Multiplexer',title:'2-to-1 multiplexer (gates)',chips:['7404','7408','7432'],sym:'MUX',ins:[['Sel','S2'],['I1','S1'],['I0','S0']],outs:[['Y','L0']],
    f:i=>({Y:i.Sel?i.I1:i.I0}),expr:'Y = I0 · Sel′ + I1 · Sel',objective:'Use a select line to choose which of two inputs reaches the output.',
    theory:'A multiplexer is a data selector, like a digital rotary switch. When Sel = 0 the output follows I0; when Sel = 1 it follows I1. Each data input is ANDed with its select condition and the results are ORed.',
    steps:['Add a 74LS04, a 74LS08 and a 74LS32.',pw14('all three ICs'),'NOT: S2 → pin 1. Pin 2 gives Sel′.','AND gate 1: S0 → pin 1, NOT pin 2 → pin 2 (pin 3 = I0·Sel′).','AND gate 2: S1 → pin 4, S2 → pin 5 (pin 6 = I1·Sel).','OR: AND pin 3 → OR pin 1, AND pin 6 → OR pin 2, OR pin 3 → L0.',FINAL],
    solve(a){a.rails();const v=a.ic('7404',5),n=a.ic('7408',16),o=a.ic('7432',27);[v,n,o].forEach(a.power);
      a.w('S2',a.pin(v,1));a.w('S0',a.pin(n,1));a.w(a.pin(v,2),a.pin(n,2));a.w('S1',a.pin(n,4));a.w('S2',a.pin(n,5));a.w(a.pin(n,3),a.pin(o,1));a.w(a.pin(n,6),a.pin(o,2));a.w(a.pin(o,3),'L0');}},
  {id:'mux151',group:'Multiplexer',title:'8-to-1 multiplexer (74151)',chips:['74151'],sym:'MUX',
    ins:[['C','S10'],['B','S9'],['A','S8'],...[7,6,5,4,3,2,1,0].map(i=>['D'+i,'S'+i])],outs:[['W','L1'],['Y','L0']],
    f:i=>{const y=i['D'+(i.A+2*i.B+4*i.C)];return{Y:y,W:1-y};},
    expr:'Y = D(CBA),   W = Y′',objective:'Route one of eight data inputs to the output, chosen by a 3-bit select code.',
    theory:'Put the data on S7–S0 and the select code CBA on S10–S8. The output Y copies whichever data input the code points to, and W is its complement. The strobe G must be LOW to enable the chip.',
    steps:[placeStep('74151'),pw('74151'),'Data: S0 → pin 4 (D0), S1 → 3, S2 → 2, S3 → 1, S4 → 15, S5 → 14, S6 → 13, S7 → 12 (D7).','Select: S8 → pin 11 (A), S9 → pin 10 (B), S10 → pin 9 (C).','Strobe G (pin 7) → GND.','Outputs: pin 5 (Y) → L0, pin 6 (W) → L1.','Check my circuit tests all 2048 combinations.'],
    solve(a){a.rails();const u=a.ic('74151',12);a.power(u);[[4,0],[3,1],[2,2],[1,3],[15,4],[14,5],[13,6],[12,7],[11,8],[10,9],[9,10]].forEach(([p,s])=>a.w('S'+s,a.pin(u,p)));
      a.gnd(u,7);a.w(a.pin(u,5),'L0');a.w(a.pin(u,6),'L1');}},
  {id:'demux12',group:'Demultiplexer',title:'1-to-2 demultiplexer (gates)',chips:['7404','7408'],sym:'DMX',ins:[['D','S1'],['Sel','S0']],outs:[['Y1','L1'],['Y0','L0']],
    f:i=>({Y0:i.D&&!i.Sel?1:0,Y1:i.D&&i.Sel?1:0}),expr:'Y0 = D · Sel′,   Y1 = D · Sel',objective:'Send one data input to one of two outputs, chosen by a select line.',
    theory:'A demultiplexer is the opposite of a multiplexer: one input, many outputs. The select line decides which output receives the data; the other output stays LOW.',
    steps:['Add a 74LS04 and a 74LS08.',pw14('both ICs'),'NOT: S0 → pin 1. Pin 2 gives Sel′.','AND gate 1: S1 → pin 1, NOT pin 2 → pin 2, pin 3 → L0.','AND gate 2: S1 → pin 4, S0 → pin 5, pin 6 → L1.',FINAL],
    solve(a){a.rails();const v=a.ic('7404',5),n=a.ic('7408',16);a.power(v);a.power(n);a.w('S0',a.pin(v,1));a.w('S1',a.pin(n,1));a.w(a.pin(v,2),a.pin(n,2));a.w(a.pin(n,3),'L0');a.w('S1',a.pin(n,4));a.w('S0',a.pin(n,5));a.w(a.pin(n,6),'L1');}},
  {id:'demux138',group:'Demultiplexer',title:'1-to-8 demultiplexer (74138)',chips:['74138'],sym:'DMX',ins:[['D','S3'],['C','S2'],['B','S1'],['A','S0']],outs:[7,6,5,4,3,2,1,0].map(i=>['Y'+i,'L'+i]),
    f:i=>{const s=i.A+2*i.B+4*i.C,o={};for(let k=0;k<8;k++)o['Y'+k]=s===k?i.D:1;return o;},
    expr:'Y(CBA) = D; every other output stays HIGH',objective:'Use the 74138 decoder as a demultiplexer by feeding the data into an enable input.',
    theory:'Any decoder with an enable input also works as a demultiplexer. Put the data on G2A: when D = 0 the chip is enabled and the selected output goes LOW; when D = 1 it is disabled and every output is HIGH. So the selected output simply copies D.',
    steps:[placeStep('74138'),pw('74138'),'Select: S0 → pin 1 (A), S1 → pin 2 (B), S2 → pin 3 (C).','Data: S3 → pin 4 (G2A). Tie G1 (pin 6) to +5 V and G2B (pin 5) to GND.','Outputs: pin 15 → L0, 14 → L1, 13 → L2, 12 → L3, 11 → L4, 10 → L5, 9 → L6, 7 → L7.',FINAL],
    solve(a){a.rails();const u=a.ic('74138',12);a.power(u);a.w('S0',a.pin(u,1));a.w('S1',a.pin(u,2));a.w('S2',a.pin(u,3));a.w('S3',a.pin(u,4));a.vcc(u,6);a.gnd(u,5);
      [[15,0],[14,1],[13,2],[12,3],[11,4],[10,5],[9,6],[7,7]].forEach(([p,l])=>a.w(a.pin(u,p),'L'+l));}},
  {id:'cmp1',group:'Comparator',title:'1-bit comparator (gates)',chips:['7404','7408','7486'],sym:'CMP',ins:[['A','S1'],['B','S0']],outs:[['A>B','L2'],['A=B','L1'],['A<B','L0']],
    f:i=>({'A>B':i.A&&!i.B?1:0,'A=B':i.A===i.B?1:0,'A<B':!i.A&&i.B?1:0}),
    expr:'A>B = AB′,   A=B = (A ⊕ B)′,   A<B = A′B',objective:'Compare two bits and light one of three LEDs: greater, equal or less.',
    theory:'A is greater only when A = 1 and B = 0, and less only when A = 0 and B = 1. Otherwise they are equal, which is what XNOR detects (here an XOR followed by a NOT).',
    steps:['Add a 74LS04, a 74LS08 and a 74LS86.',pw14('all three ICs'),'NOT: S1 → pin 1 (pin 2 = A′), S0 → pin 3 (pin 4 = B′).','A>B: S1 → AND pin 1, NOT pin 4 → AND pin 2, AND pin 3 → L2.','A<B: NOT pin 2 → AND pin 4, S0 → AND pin 5, AND pin 6 → L0.','A=B: S1 → XOR pin 1, S0 → XOR pin 2, XOR pin 3 → NOT pin 5, NOT pin 6 → L1.',FINAL],
    solve(a){a.rails();const v=a.ic('7404',5),n=a.ic('7408',16),x=a.ic('7486',27);[v,n,x].forEach(a.power);
      a.w('S1',a.pin(v,1));a.w('S0',a.pin(v,3));a.w('S1',a.pin(n,1));a.w(a.pin(v,4),a.pin(n,2));a.w(a.pin(n,3),'L2');
      a.w(a.pin(v,2),a.pin(n,4));a.w('S0',a.pin(n,5));a.w(a.pin(n,6),'L0');a.w('S1',a.pin(x,1));a.w('S0',a.pin(x,2));a.w(a.pin(x,3),a.pin(v,5));a.w(a.pin(v,6),'L1');}},
  {id:'cmp85',group:'Comparator',title:'4-bit comparator (7485)',chips:['7485'],sym:'CMP',
    ins:[['A3','S7'],['A2','S6'],['A1','S5'],['A0','S4'],['B3','S3'],['B2','S2'],['B1','S1'],['B0','S0']],outs:[['A>B','L2'],['A=B','L1'],['A<B','L0']],
    f:i=>{const a=i.A0+2*i.A1+4*i.A2+8*i.A3,b=i.B0+2*i.B1+4*i.B2+8*i.B3;return{'A>B':a>b?1:0,'A=B':a===b?1:0,'A<B':a<b?1:0};},
    expr:'Compare A3A2A1A0 with B3B2B1B0',objective:'Compare two 4-bit numbers with the 7485 magnitude comparator.',
    theory:'The 7485 compares from the most significant bit down: the first bit position where A and B differ decides the result. The cascade inputs let you chain chips for wider numbers; for one chip set A=B in HIGH and the other two LOW.',
    steps:[placeStep('7485'),pw('7485'),'A: S4 → pin 10 (A0), S5 → pin 12 (A1), S6 → pin 13 (A2), S7 → pin 15 (A3).','B: S0 → pin 9 (B0), S1 → pin 11 (B1), S2 → pin 14 (B2), S3 → pin 1 (B3).','Cascade: pin 3 (A=B in) → +5 V; pin 2 (A<B in) and pin 4 (A>B in) → GND.','Outputs: pin 5 (A>B) → L2, pin 6 (A=B) → L1, pin 7 (A<B) → L0.','Check my circuit tests all 256 combinations.'],
    solve(a){a.rails();const u=a.ic('7485',12);a.power(u);[[10,4],[12,5],[13,6],[15,7],[9,0],[11,1],[14,2],[1,3]].forEach(([p,s])=>a.w('S'+s,a.pin(u,p)));
      a.vcc(u,3);a.gnd(u,2);a.gnd(u,4);a.w(a.pin(u,5),'L2');a.w(a.pin(u,6),'L1');a.w(a.pin(u,7),'L0');}},
];
function expRows(e){return e.rows||rowsAll(e.ins.length);}
function buildSolution(e){const st=freshState();e.solve(makeApi(st));return st;}
function checkExp(st,e){
  const C=compile(st),out=[];
  for(const r of expRows(e)){const sw=st.sw.slice(),inp={};e.ins.forEach(([n,s],k)=>{sw[+s.slice(1)]=r[k];inp[n]=r[k];});
    const R=run(C,sw,true),want=e.f(inp),got=e.outs.map(([n,s])=>readOut(C,R,s)),exp=e.outs.map(([n])=>want[n]?1:0);
    out.push({r,exp,got,ok:exp.every((v,k)=>v===got[k])});}
  return out;
}
// ================= Guided build =================
function icOrd(st,ic){return st.ics.filter(x=>x.type===ic.type).sort((a,b)=>a.col-b.col||a.id-b.id).indexOf(ic);}
function studentIC(st,type,ord){return st.ics.filter(x=>x.type===type).sort((a,b)=>a.col-b.col||a.id-b.id)[ord]||null;}
function endpointOf(st,node){
  if(/^(VCC|TP|BP)/.test(node))return{k:'vcc'};
  if(/^(GND|TN|BN)/.test(node))return{k:'gnd'};
  const n=NODES.get(node);if(n.kind==='sock')return{k:'sock',id:node};
  for(const ic of st.ics){const ps=pinsOf(ic);for(let i=0;i<ps.length;i++)if(NODES.get(ps[i]).strip===n.strip)return{k:'pin',type:ic.type,ord:icOrd(st,ic),p:i+1};}
  return null;
}
const epKey=e=>e.k==='pin'?e.type+'#'+e.ord+'.'+e.p:e.k==='sock'?e.id:e.k;
function guideSteps(e){
  const s=buildSolution(e),need={},seen=new Set(),pow=[],sig=[];
  for(const ic of s.ics)need[ic.type]=(need[ic.type]||0)+1;
  const swap=(a,b)=>(b.k==='sock'&&/^S/.test(b.id))||a.k==='vcc'||a.k==='gnd'||(a.k==='sock'&&b.k==='pin');
  for(const w of s.wires){let a=endpointOf(s,w.a),b=endpointOf(s,w.b);if(!a||!b)continue;const ka=epKey(a),kb=epKey(b);if(ka===kb)continue;
    const key=[ka,kb].sort().join('|');if(seen.has(key))continue;seen.add(key);if(swap(a,b))[a,b]=[b,a];
    (b.k==='vcc'||b.k==='gnd'?pow:sig).push({k:'wire',a,b});}
  return[{k:'place',need},...pow,...sig];
}
function epNet(st,C,ep){if(ep.k==='vcc')return C.vcc;if(ep.k==='gnd')return C.gnd;if(ep.k==='sock')return C.net(ep.id);
  const ic=studentIC(st,ep.type,ep.ord);return ic?C.net(pinNode(ic,ep.p)):null;}
function guideStatus(st,C,steps){return steps.map(s=>{
  if(s.k==='place')return Object.entries(s.need).every(([t,n])=>st.ics.filter(x=>x.type===t).length>=n);
  const a=epNet(st,C,s.a),b=epNet(st,C,s.b);return a!=null&&b!=null&&a===b;});}
