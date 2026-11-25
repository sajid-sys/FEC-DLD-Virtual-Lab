// FEC DLD Virtual Lab — core: board geometry, IC library, logic simulator,
// experiments and guided-build steps. No DOM access, so it also runs in Node for tests.
// Developed and maintained by Shahriar Hossen Sajid.
// Copyright (C) 2026 Shahriar Hossen Sajid. SPDX-License-Identifier: GPL-3.0-only
// Licensed under the GNU GPL v3.0 with additional terms (keep the author credit visible; the name and
// logos are not licensed) — see LICENSE and ADDITIONAL-TERMS.md.
// ================= Geometry =================
const P=20, COLS=63, BBX=250, PW=1560, PH=830, NSW=16, NLED=16;
const ROWY={TP:250,TN:270,A:310,B:330,C:350,D:370,E:390,F:450,G:470,H:490,I:510,J:530,BN:570,BP:590};
const TOPR=['A','B','C','D','E'], BOTR=['F','G','H','I','J'], RAILS=['TP','TN','BN','BP'];
const RAILNAME={TP:'top + rail (+5 V)',TN:'top − rail (GND)',BN:'bottom − rail (GND)',BP:'bottom + rail (+5 V)'};
const colX=c=>BBX+(c-1)*P;
const railHas=c=>((c-1)%6)!==5;
const ledX=i=>292+(NLED-1-i)*39;
const swX=i=>290+(NSW-1-i)*48;
const CLKX=1100;
const NODES=new Map();
function addNode(id,x,y,strip,kind,label){NODES.set(id,{id,x,y,strip,kind,label});}
for(let c=1;c<=COLS;c++){
  for(const r of TOPR) addNode(r+c,colX(c),ROWY[r],'U'+c,'hole','Hole '+r+c);
  for(const r of BOTR) addNode(r+c,colX(c),ROWY[r],'D'+c,'hole','Hole '+r+c);
  if(railHas(c)) for(const r of RAILS) addNode(r+c,colX(c),ROWY[r],r,'rail','Hole on the '+RAILNAME[r]);
}
for(let i=0;i<NLED;i++)addNode('L'+i,ledX(i),135,'L'+i,'sock','LED L'+i+' input');
for(let i=0;i<NSW;i++)addNode('S'+i,swX(i),660,'S'+i,'sock','Switch S'+i+' output');
addNode('CLK',CLKX,660,'CLK','sock','CLOCK pulse output (one pulse per press)');
for(let k=0;k<4;k++){addNode('VCC'+k,50+k*40,360,'VCC','sock','+5 V supply terminal');addNode('GND'+k,50+k*40,450,'GND','sock','GND terminal');}

// ================= IC library =================
const CHIPS={};
// Printed part name: 74LS-series by default; CMOS and parts with no LS version set opts.label.
const chipName=n=>(CHIPS[n]&&CHIPS[n].label)||'74LS'+n.slice(2);
// Chip categories, in the order the ICs tab lists them.
const CATS=[['gate','Logic gates (TTL)'],['cmos','CMOS gates and comparator'],['arith','Arithmetic'],['code','Encoders and decoders'],['mux','Multiplexers and demultiplexers'],
  ['ff','Flip-flops and latches'],['shift','Shift registers'],['count','Counters']];
function gateChip(num,kind,gates,op,opts={}){
  const n=14,names=Array(n).fill('NC'),role=Array(n).fill('nc');
  names[13]=opts.cmos?'VDD':'VCC';role[13]='vcc';names[6]=opts.cmos?'VSS':'GND';role[6]='gnd';
  gates.forEach((g,gi)=>{const ins=g.slice(0,-1),out=g[g.length-1],one=gates.length===1;
    ins.forEach((p,k)=>{names[p-1]=opts.inName?opts.inName(gi,k):(one?'':gi+1)+(ins.length===1?'A':'ABCDEFGH'[k]);role[p-1]='in';});
    names[out-1]=(one?'':gi+1)+'Y';role[out-1]='out';});
  CHIPS[num]={num,kind,pins:n,vcc:14,gnd:7,names,role,gates,note:opts.note||'',sym:opts.sym,label:opts.label,cat:opts.cat||(opts.cmos?'cmos':'gate'),cmos:!!opts.cmos,
    eval(v){const o={};for(const g of gates){o[g[g.length-1]]=op(g.slice(0,-1).map(p=>v[p]))?1:0;}return o;}};
}
// MSI chip from its pin names (pin 1 first). Combinational chips give fn(inputs) -> outputs.
// Sequential chips give opts.seq = {init(), step(state, in, prevIn), out(state, in)}: step runs once the
// circuit has settled and handles clock edges and asynchronous set/clear; out may return 2 for a
// high-impedance (3-state) output.
function msiChip(num,kind,names,outs,fn,opts={}){
  const role=names.map(nm=>nm==='VCC'||nm==='VDD'?'vcc':nm==='GND'||nm==='VSS'?'gnd':nm==='NC'?'nc':outs.includes(nm)?'out':'in');
  const named=v=>{const b={};names.forEach((nm,i)=>b[nm]=v[i+1]);return b;};
  const pinOut=r=>{const o={};for(const k in r)o[names.indexOf(k)+1]=r[k]===2?2:r[k]?1:0;return o;};
  const vcc=names.findIndex(x=>x==='VCC'||x==='VDD')+1,gnd=names.findIndex(x=>x==='GND'||x==='VSS')+1,sq=opts.seq;
  CHIPS[num]={num,kind,pins:names.length,vcc,gnd,names,role,note:opts.note||'',sym:opts.sym,label:opts.label,cat:opts.cat||'code',cmos:vcc>0&&names[vcc-1]==='VDD',
    seq:!!sq,init:sq&&sq.init,step:sq&&((s,v,pv)=>sq.step(s,named(v),named(pv))),out:sq&&((s,v)=>pinOut(sq.out(s,named(v)))),
    eval(v){return sq?{}:pinOut(fn(named(v)));}};
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
  if(b.G)return{Y:0,W:1};const y=b['D'+(b.A+2*b.B+4*b.C)];return{Y:y,W:!y};},{sym:'MUX',cat:'mux',note:'The strobe G (pin 7) is active-LOW: tie it to GND. W is the inverted output.'});
msiChip('7485','4-bit magnitude comparator',['B3','A<B in','A=B in','A>B in','A>B','A=B','A<B','GND','B0','A0','B1','A1','A2','B2','A3','VCC'],['A>B','A=B','A<B'],b=>{
  const a=b.A0+2*b.A1+4*b.A2+8*b.A3,c=b.B0+2*b.B1+4*b.B2+8*b.B3;
  if(a>c)return{'A>B':1,'A=B':0,'A<B':0};if(a<c)return{'A>B':0,'A=B':0,'A<B':1};
  if(b['A=B in'])return{'A>B':0,'A=B':1,'A<B':0};
  return{'A>B':!b['A<B in'],'A=B':0,'A<B':!b['A>B in']};},{sym:'CMP',cat:'arith',note:'For a single chip set the cascade inputs: A=B in (pin 3) to +5 V; A>B in (pin 4) and A<B in (pin 2) to GND.'});

// ---- more gates (TTL) ----
const PIN3=[[1,2,13,12],[3,4,5,6],[9,10,11,8]], PIN4=[[1,2,4,5,6],[9,10,12,13,8]];
gateChip('7410','Triple 3-input NAND',PIN3,a=>!and(a),{sym:'nand'});
gateChip('7411','Triple 3-input AND',PIN3,and,{sym:'and'});
gateChip('7427','Triple 3-input NOR',PIN3,a=>!or(a),{sym:'nor'});
gateChip('7420','Dual 4-input NAND',PIN4,a=>!and(a),{sym:'nand',note:'Pins 3 and 11 are not connected.'});
gateChip('7421','Dual 4-input AND',PIN4,and,{sym:'and',note:'Pins 3 and 11 are not connected.'});
gateChip('7425','Dual 4-input NOR with strobe',[[1,2,4,5,3,6],[9,10,12,13,11,8]],a=>!(a[4]&&(a[0]||a[1]||a[2]||a[3])),
  {sym:'nor',label:'7425',inName:(g,k)=>(g+1)+'ABCDG'[k],note:'Standard TTL (there is no LS version). Each gate has a strobe G: with G = HIGH it is a 4-input NOR; with G = LOW the output stays HIGH.'});
gateChip('7430','8-input NAND',[[1,2,3,4,5,6,11,12,8]],a=>!and(a),{sym:'nand',note:'Pins 9, 10 and 13 are not connected.'});
gateChip('7414','Hex Schmitt-trigger inverter',G04,a=>!a[0],{sym:'not',note:'Same pinout and logic as the 7404, but each input has hysteresis (switches at about 1.6 V going up and 0.8 V going down), so slow or noisy signals give one clean edge.'});
gateChip('74266','Quad 2-input XNOR (open collector)',[[1,2,3],[5,6,4],[8,9,10],[12,13,11]],a=>a[0]===a[1],
  {sym:'xnor',note:'Open-collector outputs: on a real board put a pull-up resistor (about 2.2 kΩ) from each output to +5 V. Note the pinout: outputs are on pins 3, 4, 10 and 11.'});
// ---- CMOS 4000-series gates (VDD = pin 14, VSS = pin 7) ----
const GC=[[1,2,3],[5,6,4],[8,9,10],[12,13,11]], GC3=[[1,2,8,9],[3,4,5,6],[11,12,13,10]], GC4=[[2,3,4,5,1],[9,10,11,12,13]];
const cm=(label,extra)=>({cmos:true,label,note:'CMOS: power it from VDD (pin 14) = +5 V and VSS (pin 7) = GND. Never leave a CMOS input floating — tie unused inputs to VDD or VSS.'+(extra||'')});
gateChip('4071','Quad 2-input OR (CMOS)',GC,or,{sym:'or',...cm('CD4071')});
gateChip('4081','Quad 2-input AND (CMOS)',GC,and,{sym:'and',...cm('CD4081')});
gateChip('4070','Quad 2-input XOR (CMOS)',GC,a=>a[0]^a[1],{sym:'xor',...cm('CD4070')});
gateChip('4077','Quad 2-input XNOR (CMOS)',GC,a=>a[0]===a[1],{sym:'xnor',...cm('CD4077')});
gateChip('4075','Triple 3-input OR (CMOS)',GC3,or,{sym:'or',...cm('CD4075',' Gate 1 uses pins 1, 2 and 8 with its output on pin 9.')});
gateChip('4073','Triple 3-input AND (CMOS)',GC3,and,{sym:'and',...cm('CD4073',' Gate 1 uses pins 1, 2 and 8 with its output on pin 9.')});
gateChip('4072','Dual 4-input OR (CMOS)',GC4,or,{sym:'or',...cm('CD4072',' Outputs are on pins 1 and 13.')});
gateChip('4082','Dual 4-input AND (CMOS)',GC4,and,{sym:'and',...cm('CD4082',' Outputs are on pins 1 and 13.')});

// ---- arithmetic ----
const num4=(b,p,s=0)=>b[p+(s)]+2*b[p+(s+1)]+4*b[p+(s+2)]+8*b[p+(s+3)];
const bits=(n,names)=>Object.fromEntries(names.map((nm,i)=>[nm,n>>i&1]));
msiChip('7483','4-bit binary full adder',['A4','Σ3','A3','B3','VCC','Σ2','B2','A2','Σ1','A1','B1','GND','C0','C4','Σ4','B4'],['Σ1','Σ2','Σ3','Σ4','C4'],b=>{
  const s=num4(b,'A',1)+num4(b,'B',1)+b.C0;return{...bits(s,['Σ1','Σ2','Σ3','Σ4']),C4:s>15};},
  {sym:'SUM',cat:'arith',note:'Unusual power pins: VCC is pin 5 and GND is pin 12. Bits are numbered 1–4 (A1 is the least significant bit).'});
msiChip('74283','4-bit binary full adder (fast carry)',['Σ2','B2','A2','Σ1','A1','B1','C0','GND','C4','Σ4','B4','A4','Σ3','A3','B3','VCC'],['Σ1','Σ2','Σ3','Σ4','C4'],b=>{
  const s=num4(b,'A',1)+num4(b,'B',1)+b.C0;return{...bits(s,['Σ1','Σ2','Σ3','Σ4']),C4:s>15};},
  {sym:'SUM',cat:'arith',note:'Same job as the 7483 but with normal power pins (16 = VCC, 8 = GND). Bits are numbered 1–4.'});
// 74181: per bit p = A + B·S0 + B′·S1 and g = A·B′·S2 + A·B·S3 (g implies p).
// Arithmetic (M = L): F = p ⊕ g ⊕ carry, carry(i+1) = g + p·carry, carry(0) = NOT Cn.  Logic (M = H): F = NOT(p ⊕ g).
msiChip('74181','4-bit arithmetic logic unit (ALU)',['B0','A0','S3','S2','S1','S0','Cn','M','F0','F1','F2','GND','F3','A=B','P','Cn+4','G','B3','A3','B2','A2','B1','A1','VCC'],
  ['F0','F1','F2','F3','A=B','P','Cn+4','G'],b=>{
  const p=[],g=[],F=[];let c=b.Cn?0:1;
  for(let i=0;i<4;i++){const A=b['A'+i],B=b['B'+i];p[i]=A|(B&b.S0)|((1-B)&b.S1);g[i]=(A&(1-B)&b.S2)|(A&B&b.S3);
    F[i]=b.M?1-(p[i]^g[i]):p[i]^g[i]^c;c=g[i]|(p[i]&c);}
  const G=g[3]|(p[3]&g[2])|(p[3]&p[2]&g[1])|(p[3]&p[2]&p[1]&g[0]),P=p[0]&p[1]&p[2]&p[3];
  return{F0:F[0],F1:F[1],F2:F[2],F3:F[3],'A=B':F[0]&F[1]&F[2]&F[3],'Cn+4':!c,G:!G,P:!P};},
  {sym:'ALU',cat:'arith',note:'24-pin chip. With active-HIGH data the carry input Cn and carry output Cn+4 are active-LOW: Cn = HIGH means no carry in, Cn+4 = LOW means a carry out. M = HIGH selects logic functions, M = LOW arithmetic. P and G (active-LOW) feed a 74182 look-ahead carry generator. A=B is open-collector on the real chip.'});
msiChip('74182','Look-ahead carry generator',['G1','P1','G0','P0','G3','P3','P','GND','Cn+z','G','Cn+y','Cn+x','Cn','G2','P2','VCC'],['P','G','Cn+x','Cn+y','Cn+z'],b=>{
  const g=[0,1,2,3].map(i=>1-b['G'+i]),p=[0,1,2,3].map(i=>1-b['P'+i]),c=b.Cn;
  return{'Cn+x':g[0]|(p[0]&c),'Cn+y':g[1]|(p[1]&g[0])|(p[1]&p[0]&c),'Cn+z':g[2]|(p[2]&g[1])|(p[2]&p[1]&g[0])|(p[2]&p[1]&p[0]&c),
    G:!(g[3]|(p[3]&g[2])|(p[3]&p[2]&g[1])|(p[3]&p[2]&p[1]&g[0])),P:!(p[0]&p[1]&p[2]&p[3])};},
  {sym:'ALU',cat:'arith',label:'74S182',note:'Schottky part (74S182; there is no LS version). The G0–G3 and P0–P3 inputs and the G and P outputs are active-LOW; Cn and Cn+x/y/z are active-HIGH.'});
msiChip('4585','4-bit magnitude comparator (CMOS)',['B2','A2','A=B','A>B in','A<B in','A=B in','A1','VSS','B0','A0','B1','A<B','A>B','B3','A3','VDD'],['A>B','A=B','A<B'],b=>{
  const a=num4(b,'A'),c=num4(b,'B'),L=b['A<B in'],E=b['A=B in'],G=b['A>B in'];
  if(a>c)return{'A>B':G,'A=B':0,'A<B':0};if(a<c)return{'A>B':0,'A=B':0,'A<B':1};
  return{'A<B':L&&!E,'A=B':E&&!L,'A>B':!L&&!E&&G};},
  {sym:'CMP',cat:'cmos',label:'CD4585',note:'CMOS. For a single chip tie A<B in (pin 5) to VSS, and A=B in (pin 6) and A>B in (pin 4) to VDD. Unlike the 7485, the A>B output only goes HIGH when the A>B cascade input is HIGH.'});

// ---- encoders and decoders ----
msiChip('74139','Dual 2-to-4 decoder',['1G','1A','1B','1Y0','1Y1','1Y2','1Y3','GND','2Y3','2Y2','2Y1','2Y0','2B','2A','2G','VCC'],
  ['1Y0','1Y1','1Y2','1Y3','2Y0','2Y1','2Y2','2Y3'],b=>{const o={};for(const h of['1','2']){const s=b[h+'A']+2*b[h+'B'];for(let i=0;i<4;i++)o[h+'Y'+i]=!(!b[h+'G']&&s===i);}return o;},
  {sym:'DEC',note:'Two independent decoders. Enables (G) and outputs are active-LOW.'});
msiChip('7442','BCD-to-decimal decoder',['Y0','Y1','Y2','Y3','Y4','Y5','Y6','GND','Y7','Y8','Y9','D','C','B','A','VCC'],['Y0','Y1','Y2','Y3','Y4','Y5','Y6','Y7','Y8','Y9'],b=>{
  const s=b.A+2*b.B+4*b.C+8*b.D,o={};for(let i=0;i<10;i++)o['Y'+i]=s!==i;return o;},
  {sym:'DEC',note:'Outputs are active-LOW. Invalid codes 10–15 leave every output HIGH.'});
msiChip('74154','4-to-16 decoder',['Y0','Y1','Y2','Y3','Y4','Y5','Y6','Y7','Y8','Y9','Y10','GND','Y11','Y12','Y13','Y14','Y15','G1','G2','D','C','B','A','VCC'],
  ['Y0','Y1','Y2','Y3','Y4','Y5','Y6','Y7','Y8','Y9','Y10','Y11','Y12','Y13','Y14','Y15'],b=>{
  const s=b.A+2*b.B+4*b.C+8*b.D,en=!b.G1&&!b.G2,o={};for(let i=0;i<16;i++)o['Y'+i]=!(en&&s===i);return o;},
  {sym:'DEC',note:'24-pin chip. Outputs are active-LOW; both enables G1 and G2 must be LOW.'});
msiChip('74147','10-to-4 priority encoder (decimal to BCD)',['I4','I5','I6','I7','I8','C','B','GND','A','I9','I1','I2','I3','D','NC','VCC'],['A','B','C','D'],b=>{
  let k=0;for(let i=1;i<=9;i++)if(!b['I'+i])k=i;const c=(~k)&15;return{A:c&1,B:c>>1&1,C:c>>2&1,D:c>>3&1};},
  {sym:'ENC',note:'Inputs and outputs are active-LOW: the highest input that is LOW wins, and DCBA gives its number inverted. There is no I0 input — "zero" is all inputs HIGH (output 1111).'});

// ---- multiplexers and demultiplexers ----
msiChip('74157','Quad 2-to-1 multiplexer',['S','1A','1B','1Y','2A','2B','2Y','GND','3Y','3B','3A','4Y','4B','4A','G','VCC'],['1Y','2Y','3Y','4Y'],b=>{
  const o={};for(let i=1;i<=4;i++)o[i+'Y']=b.G?0:b.S?b[i+'B']:b[i+'A'];return o;},
  {sym:'MUX',cat:'mux',note:'Select S (pin 1): LOW picks the A inputs, HIGH the B inputs. Strobe G (pin 15) is active-LOW.'});
msiChip('74153','Dual 4-to-1 multiplexer',['1G','B','1C3','1C2','1C1','1C0','1Y','GND','2Y','2C0','2C1','2C2','2C3','A','2G','VCC'],['1Y','2Y'],b=>{
  const s=b.A+2*b.B;return{'1Y':b['1G']?0:b['1C'+s],'2Y':b['2G']?0:b['2C'+s]};},
  {sym:'MUX',cat:'mux',note:'Both halves share the select inputs B, A. Each strobe G is active-LOW.'});
msiChip('74150','16-to-1 multiplexer',['E7','E6','E5','E4','E3','E2','E1','E0','G','W','D','GND','C','B','A','E15','E14','E13','E12','E11','E10','E9','E8','VCC'],['W'],b=>{
  return{W:b.G?1:1-b['E'+(b.A+2*b.B+4*b.C+8*b.D)]};},
  {sym:'MUX',cat:'mux',label:'74150',note:'24-pin standard TTL part. The only output W is INVERTED. The strobe G (pin 9) is active-LOW.'});
msiChip('74155','Dual 2-to-4 decoder / 1-to-8 demultiplexer',['1C','1G','B','1Y3','1Y2','1Y1','1Y0','GND','2Y0','2Y1','2Y2','2Y3','A','2G','2C','VCC'],
  ['1Y0','1Y1','1Y2','1Y3','2Y0','2Y1','2Y2','2Y3'],b=>{const s=b.A+2*b.B,e1=b['1C']&&!b['1G'],e2=!b['2C']&&!b['2G'],o={};
  for(let i=0;i<4;i++){o['1Y'+i]=!(e1&&s===i);o['2Y'+i]=!(e2&&s===i);}return o;},
  {sym:'DMX',cat:'mux',note:'Outputs are active-LOW. Section 1 works when 1C = HIGH and 1G = LOW; section 2 when 2C = LOW and 2G = LOW. Join 1C with 2C and 1G with 2G to get a 3-to-8 decoder.'});

// ---- sequential helpers ----
const rise=(b,pb,k)=>!pb[k]&&b[k], fall=(b,pb,k)=>pb[k]&&!b[k];
const jk=(q,J,K)=>J&&K?1-q:J?1:K?0:q;
// ---- flip-flops and latches ----
msiChip('7474','Dual D flip-flop (positive edge)',['1CLR','1D','1CLK','1PRE','1Q',"1Q'",'GND',"2Q'",'2Q','2PRE','2CLK','2D','2CLR','VCC'],['1Q',"1Q'",'2Q',"2Q'"],null,{sym:'FF',cat:'ff',
  note:'PRE and CLR are active-LOW and act at once (no clock needed). The flip-flop copies D on the rising edge of CLK.',
  seq:{init:()=>({q:[0,0]}),
    step(s,b,pb){for(const i of[1,2]){const P=b[i+'PRE'],C=b[i+'CLR'];if(!P||!C){if(P!==C)s.q[i-1]=P?0:1;}else if(rise(b,pb,i+'CLK'))s.q[i-1]=pb[i+'D'];}},
    out(s,b){const o={};for(const i of[1,2]){const P=b[i+'PRE'],C=b[i+'CLR'],q=!P&&!C?1:s.q[i-1];o[i+'Q']=q;o[i+"Q'"]=!P&&!C?1:1-q;}return o;}}});
const jkChip=(num,kind,names,opts,edgeNote)=>msiChip(num,kind,names,['1Q',"1Q'",'2Q',"2Q'"],null,{sym:'FF',cat:'ff',...opts,
  note:edgeNote,
  seq:{init:()=>({q:[0,0]}),
    step(s,b,pb){for(const i of[1,2]){const P=b[i+'PRE']??1,C=b[i+'CLR'];if(!P||!C){if(P!==C)s.q[i-1]=P?0:1;}else if(fall(b,pb,i+'CLK'))s.q[i-1]=jk(s.q[i-1],pb[i+'J'],pb[i+'K']);}},
    out(s,b){const o={};for(const i of[1,2]){const P=b[i+'PRE']??1,C=b[i+'CLR'],q=!P&&!C?1:s.q[i-1];o[i+'Q']=q;o[i+"Q'"]=!P&&!C?1:1-q;}return o;}}});
jkChip('7476','Dual JK flip-flop with preset and clear',['1CLK','1PRE','1CLR','1J','VCC','2CLK','2PRE','2CLR','2J',"2Q'",'2Q','2K','GND',"1Q'",'1Q','1K'],{},
  'Unusual power pins: VCC is pin 5 and GND is pin 13. PRE and CLR are active-LOW. The 74LS76 acts on the falling edge of CLK: J K = 00 hold, 10 set, 01 reset, 11 toggle.');
jkChip('74112','Dual JK flip-flop (negative edge)',['1CLK','1K','1J','1PRE','1Q',"1Q'","2Q'",'GND','2Q','2PRE','2J','2K','2CLK','2CLR','1CLR','VCC'],{},
  'Negative-edge triggered with active-LOW PRE and CLR. J K = 00 hold, 10 set, 01 reset, 11 toggle.');
jkChip('74107','Dual JK flip-flop with clear',['1J',"1Q'",'1Q','1K','2Q',"2Q'",'GND','2J','2CLK','2CLR','2K','1CLK','1CLR','VCC'],{},
  'Negative-edge triggered, with an active-LOW clear and no preset. Note the odd pinout: 1J is pin 1, 1Q is pin 3.');
msiChip('7475','4-bit D latch',["1Q'",'1D','2D','C34','VCC','3D','4D',"4Q'",'4Q','3Q',"3Q'",'GND','C12',"2Q'",'2Q','1Q'],['1Q',"1Q'",'2Q',"2Q'",'3Q',"3Q'",'4Q',"4Q'"],null,{sym:'FF',cat:'ff',
  note:'Unusual power pins: VCC is pin 5 and GND is pin 12. A latch is level-triggered: while its enable (C12 on pin 13 for latches 1–2, C34 on pin 4 for 3–4) is HIGH, Q follows D; when the enable goes LOW, Q holds.',
  seq:{init:()=>({q:[0,0,0,0]}),step(s,b){for(let i=0;i<4;i++)if(b[i<2?'C12':'C34'])s.q[i]=b[(i+1)+'D'];},
    out(s,b){const o={};for(let i=0;i<4;i++){const q=s.q[i];o[(i+1)+'Q']=q;o[(i+1)+"Q'"]=1-q;}return o;}}});
const dReg=(num,kind,names,n,withQn)=>msiChip(num,kind,names,names.filter(x=>/Q/.test(x)),null,{sym:'FF',cat:'ff',
  note:'All flip-flops share one clock and copy their D inputs on its rising edge. CLR (pin 1) is active-LOW and clears them at once.',
  seq:{init:()=>({q:Array(n).fill(0)}),step(s,b,pb){if(!b.CLR)s.q.fill(0);else if(rise(b,pb,'CLK'))for(let i=0;i<n;i++)s.q[i]=pb[(i+1)+'D'];},
    out(s,b){const o={};for(let i=0;i<n;i++){const q=s.q[i];o[(i+1)+'Q']=q;if(withQn)o[(i+1)+"Q'"]=1-q;}return o;}}});
dReg('74175','Quad D flip-flop with clear',['CLR','1Q',"1Q'",'1D','2D',"2Q'",'2Q','GND','CLK','3Q',"3Q'",'3D','4D',"4Q'",'4Q','VCC'],4,true);
dReg('74174','Hex D flip-flop with clear',['CLR','1Q','1D','2D','2Q','3D','3Q','GND','CLK','4Q','4D','5Q','5D','6D','6Q','VCC'],6,false);

// ---- shift registers ----
msiChip('7495','4-bit shift register (parallel in, parallel out)',['SER','A','B','C','D','MODE','GND','CLK2','CLK1','QD','QC','QB','QA','VCC'],['QA','QB','QC','QD'],null,{sym:'REG',cat:'shift',
  note:'MODE = LOW: shift right (SER → QA → QB → QC → QD) on the falling edge of CLK1 (pin 9). MODE = HIGH: load A–D in parallel on the falling edge of CLK2 (pin 8). For one clock, wire both clock pins together.',
  seq:{init:()=>({q:[0,0,0,0]}),step(s,b,pb){if(!pb.MODE&&fall(b,pb,'CLK1'))s.q=[pb.SER,...s.q.slice(0,3)];else if(pb.MODE&&fall(b,pb,'CLK2'))s.q=[pb.A,pb.B,pb.C,pb.D];},
    out:s=>({QA:s.q[0],QB:s.q[1],QC:s.q[2],QD:s.q[3]})}});
const L8='ABCDEFGH';
msiChip('74164','8-bit serial-in, parallel-out shift register',['A','B','QA','QB','QC','QD','GND','CLK','CLR','QE','QF','QG','QH','VCC'],[...L8].map(c=>'Q'+c),null,{sym:'REG',cat:'shift',
  note:'The serial data is A AND B (tie the unused one HIGH). Shifts on the rising edge of CLK; CLR is active-LOW.',
  seq:{init:()=>({q:Array(8).fill(0)}),step(s,b,pb){if(!b.CLR)s.q.fill(0);else if(rise(b,pb,'CLK'))s.q=[pb.A&pb.B,...s.q.slice(0,7)];},
    out:(s,b)=>Object.fromEntries([...L8].map((c,i)=>['Q'+c,s.q[i]]))}});
msiChip('74165','8-bit parallel-in, serial-out shift register',['SH/LD','CLK','E','F','G','H',"QH'",'GND','QH','SER','A','B','C','D','CLK INH','VCC'],['QH',"QH'"],null,{sym:'REG',cat:'shift',
  note:'SH/LD = LOW loads A–H at once (no clock needed). With SH/LD = HIGH and CLK INH = LOW, each rising clock edge shifts one place towards QH; SER fills the empty first stage.',
  seq:{init:()=>({q:Array(8).fill(0)}),step(s,b,pb){if(!b['SH/LD'])s.q=[...L8].map(c=>b[c]);else if(!pb['CLK INH']&&!b['CLK INH']&&rise(b,pb,'CLK'))s.q=[pb.SER,...s.q.slice(0,7)];},
    out(s,b){const q=s.q[7];return{QH:q,"QH'":1-q};}}});
msiChip('74595','8-bit shift register with output latch',['QB','QC','QD','QE','QF','QG','QH','GND',"QH'",'SRCLR','SRCLK','RCLK','OE','SER','QA','VCC'],[...[...L8].map(c=>'Q'+c),"QH'"],null,{sym:'REG',cat:'shift',
  note:'SRCLK (pin 11) shifts SER in on its rising edge; RCLK (pin 12) copies the shift register to the outputs on its rising edge. OE (pin 13) is active-LOW: HIGH turns the outputs off (high-impedance). SRCLR (pin 10) is active-LOW. QH\' (pin 9) is the serial output for chaining.',
  seq:{init:()=>({sr:Array(8).fill(0),st:Array(8).fill(0)}),
    step(s,b,pb){const old=s.sr.slice();if(!b.SRCLR)s.sr.fill(0);else if(rise(b,pb,'SRCLK'))s.sr=[pb.SER,...old.slice(0,7)];if(rise(b,pb,'RCLK'))s.st=old;},
    out:(s,b)=>({...Object.fromEntries([...L8].map((c,i)=>['Q'+c,b.OE?2:s.st[i]])),"QH'":s.sr[7]})}});
msiChip('4015','Dual 4-bit serial-in, parallel-out shift register (CMOS)',['CLKB','Q4B','Q3A','Q2A','Q1A','RSTA','DA','VSS','CLKA','Q4A','Q3B','Q2B','Q1B','RSTB','DB','VDD'],
  ['Q1A','Q2A','Q3A','Q4A','Q1B','Q2B','Q3B','Q4B'],null,{sym:'REG',cat:'shift',label:'CD4015',
  note:'CMOS. Two independent 4-bit registers. Each shifts its data input in on the rising clock edge; RESET is active-HIGH. Tie unused inputs to VSS.',
  seq:{init:()=>({A:[0,0,0,0],B:[0,0,0,0]}),step(s,b,pb){for(const h of'AB'){if(b['RST'+h])s[h]=[0,0,0,0];else if(rise(b,pb,'CLK'+h))s[h]=[pb['D'+h],...s[h].slice(0,3)];}},
    out(s){const o={};for(const h of'AB')for(let i=0;i<4;i++)o['Q'+(i+1)+h]=s[h][i];return o;}}});
msiChip('4094','8-bit shift-and-store register (CMOS)',['STR','DATA','CLK','Q1','Q2','Q3','Q4','VSS','QS',"Q'S",'Q8','Q7','Q6','Q5','OE','VDD'],['Q1','Q2','Q3','Q4','Q5','Q6','Q7','Q8','QS',"Q'S"],null,{sym:'REG',cat:'shift',label:'CD4094',
  note:'CMOS. Data shifts in on the rising clock edge. While STROBE is HIGH the storage register (and the Q outputs) follows the shift register; when STROBE is LOW they hold. OUTPUT ENABLE HIGH turns the Q outputs on. QS is the serial output.',
  seq:{init:()=>({sr:Array(8).fill(0),st:Array(8).fill(0),qs2:0}),step(s,b,pb){if(rise(b,pb,'CLK'))s.sr=[pb.DATA,...s.sr.slice(0,7)];if(fall(b,pb,'CLK'))s.qs2=s.sr[7];if(b.STR)s.st=s.sr.slice();},
    out(s,b){const o={},q=b.STR?s.sr:s.st;for(let i=0;i<8;i++)o['Q'+(i+1)]=b.OE?q[i]:2;o.QS=s.sr[7];o["Q'S"]=s.qs2;return o;}}});
msiChip('4014','8-bit parallel-in, serial-out shift register (CMOS)',['P8','Q6','Q8','P4','P3','P2','P1','VSS','P/S','CLK','SER','Q7','P5','P6','P7','VDD'],['Q6','Q7','Q8'],null,{sym:'REG',cat:'shift',label:'CD4014',
  note:'CMOS. Everything happens on the rising clock edge: with P/S = HIGH the inputs P1–P8 are loaded, with P/S = LOW the data shifts one place (SER fills stage 1). Only stages 6, 7 and 8 are brought out.',
  seq:{init:()=>({q:Array(8).fill(0)}),step(s,b,pb){if(rise(b,pb,'CLK'))s.q=pb['P/S']?[1,2,3,4,5,6,7,8].map(i=>pb['P'+i]):[pb.SER,...s.q.slice(0,7)];},
    out:s=>({Q6:s.q[5],Q7:s.q[6],Q8:s.q[7]})}});

// ---- counters ----
const rippleNote='The A section (CKA → QA) divides by 2 and the B section (CKB → QB, QC, QD) by ';
msiChip('7490','Decade (BCD) ripple counter',['CKB','R0(1)','R0(2)','NC','VCC','R9(1)','R9(2)','QC','QB','GND','QD','QA','NC','CKA'],['QA','QB','QC','QD'],null,{sym:'CNT',cat:'count',
  note:'Unusual power pins: VCC is pin 5 and GND is pin 10. '+rippleNote+'5, both on the falling clock edge. Wire QA (pin 12) to CKB (pin 1) for a BCD counter. R0(1)·R0(2) = HIGH resets to 0; R9(1)·R9(2) = HIGH sets 9.',
  seq:{init:()=>({a:0,b:0}),step(s,x,px){const r0=x['R0(1)']&&x['R0(2)'],r9=x['R9(1)']&&x['R9(2)'];if(r9){s.a=1;s.b=4;}else if(r0){s.a=0;s.b=0;}else{if(fall(x,px,'CKA'))s.a^=1;if(fall(x,px,'CKB'))s.b=(s.b+1)%5;}},
    out(s){const a=s.a,b=s.b;return{QA:a,QB:b&1,QC:b>>1&1,QD:b>>2&1};}}});
msiChip('7492','Divide-by-12 ripple counter',['CKB','NC','NC','NC','VCC','R0(1)','R0(2)','QD','QC','GND','QB','QA','NC','CKA'],['QA','QB','QC','QD'],null,{sym:'CNT',cat:'count',
  note:'Unusual power pins: VCC is pin 5 and GND is pin 10. '+rippleNote+'6 (QD QC QB count 000, 001, 010, 100, 101, 110). Wire QA (pin 12) to CKB (pin 1) to divide by 12. R0(1)·R0(2) = HIGH resets.',
  seq:{init:()=>({a:0,b:0}),step(s,x,px){if(x['R0(1)']&&x['R0(2)']){s.a=0;s.b=0;}else{if(fall(x,px,'CKA'))s.a^=1;if(fall(x,px,'CKB'))s.b=(s.b+1)%6;}},
    out(s){const c=[0,1,2,4,5,6][s.b];return{QA:s.a,QB:c&1,QC:c>>1&1,QD:c>>2&1};}}});
msiChip('7493','4-bit binary ripple counter',['CKB','R0(1)','R0(2)','NC','VCC','NC','NC','QC','QB','GND','QD','QA','NC','CKA'],['QA','QB','QC','QD'],null,{sym:'CNT',cat:'count',
  note:'Unusual power pins: VCC is pin 5 and GND is pin 10. '+rippleNote+'8. Wire QA (pin 12) to CKB (pin 1) to count 0–15. R0(1)·R0(2) = HIGH resets to 0.',
  seq:{init:()=>({a:0,b:0}),step(s,x,px){if(x['R0(1)']&&x['R0(2)']){s.a=0;s.b=0;}else{if(fall(x,px,'CKA'))s.a^=1;if(fall(x,px,'CKB'))s.b=(s.b+1)%8;}},
    out(s){const b=s.b;return{QA:s.a,QB:b&1,QC:b>>1&1,QD:b>>2&1};}}});
const SYNC=['CLR','CLK','A','B','C','D','ENP','GND','LOAD','ENT','QD','QC','QB','QA','RCO','VCC'];
const syncCounter=(num,decade,asyncClr)=>msiChip(num,`Synchronous ${decade?'decade':'4-bit binary'} counter (${asyncClr?'direct':'synchronous'} clear)`,SYNC,['QA','QB','QC','QD','RCO'],null,{sym:'CNT',cat:'count',
  note:`Counts ${decade?'0–9':'0–15'} on the rising clock edge when ENP and ENT are both HIGH. LOAD (active-LOW) loads D C B A on the next clock edge. CLR (active-LOW) clears ${asyncClr?'at once, without waiting for the clock':'on the next clock edge'}. RCO goes HIGH at ${decade?9:15} when ENT is HIGH.`,
  seq:{init:()=>({n:0}),step(s,b,pb){const max=decade?9:15;if(asyncClr&&!b.CLR){s.n=0;return;}
      if(rise(b,pb,'CLK')){if(!pb.CLR)s.n=0;else if(!pb.LOAD)s.n=pb.A+2*pb.B+4*pb.C+8*pb.D;else if(pb.ENP&&pb.ENT)s.n=s.n===max?0:(s.n+1)&15;}},
    out(s,b){const n=s.n;return{...bits(n,['QA','QB','QC','QD']),RCO:b.ENT&&n===(decade?9:15)};}}});
syncCounter('74160',true,true);syncCounter('74161',false,true);syncCounter('74162',true,false);syncCounter('74163',false,false);
const UD1=['B','QB','QA','CTEN','D/U','QC','QD','GND','D','C','LOAD','MAX/MIN','RCO','CLK','A','VCC'];
const udCounter=(num,decade)=>msiChip(num,`Synchronous up/down ${decade?'decade':'binary'} counter (single clock)`,UD1,['QA','QB','QC','QD','MAX/MIN','RCO'],null,{sym:'CNT',cat:'count',
  note:`Counts on the rising clock edge while CTEN (enable, active-LOW) is LOW: up when D/U = LOW, down when D/U = HIGH. LOAD (active-LOW) loads D C B A at once. MAX/MIN goes HIGH at ${decade?9:15} counting up or at 0 counting down; RCO goes LOW while CLK is LOW at that point (for cascading).`,
  seq:{init:()=>({n:0}),step(s,b,pb){const max=decade?9:15;if(!b.LOAD){s.n=b.A+2*b.B+4*b.C+8*b.D;return;}
      if(rise(b,pb,'CLK')&&!pb.CTEN)s.n=pb['D/U']?(s.n===0?max:s.n-1):(s.n>=max?0:s.n+1);},
    out(s,b){const n=s.n,mm=b['D/U']?n===0:n===(decade?9:15);return{...bits(n,['QA','QB','QC','QD']),'MAX/MIN':mm,RCO:!(mm&&!b.CTEN&&!b.CLK)};}}});
udCounter('74190',true);udCounter('74191',false);
const UD2=['B','QB','QA','DOWN','UP','QC','QD','GND','D','C','LOAD','CO','BO','CLR','A','VCC'];
const udCounter2=(num,decade)=>msiChip(num,`Synchronous up/down ${decade?'decade':'binary'} counter (dual clock)`,UD2,['QA','QB','QC','QD','CO','BO'],null,{sym:'CNT',cat:'count',
  note:`Counts up on the rising edge of UP while DOWN is HIGH, and down on the rising edge of DOWN while UP is HIGH. CLR (active-HIGH) clears at once; LOAD (active-LOW) loads D C B A at once. CO goes LOW at ${decade?9:15} while UP is LOW; BO goes LOW at 0 while DOWN is LOW.`,
  seq:{init:()=>({n:0}),step(s,b,pb){const max=decade?9:15;if(b.CLR){s.n=0;return;}if(!b.LOAD){s.n=b.A+2*b.B+4*b.C+8*b.D;return;}
      if(rise(b,pb,'UP')&&b.DOWN)s.n=s.n>=max?0:s.n+1;else if(rise(b,pb,'DOWN')&&b.UP)s.n=s.n===0?max:s.n-1;},
    out(s,b){const max=decade?9:15,n=s.n;return{...bits(n,['QA','QB','QC','QD']),CO:!(n===max&&!b.UP),BO:!(n===0&&!b.DOWN)};}}});
udCounter2('74192',true);udCounter2('74193',false);
msiChip('4017','Decade counter with 10 decoded outputs (CMOS)',['Q5','Q1','Q0','Q2','Q6','Q7','Q3','VSS','Q8','Q4','Q9','CO','INH','CLK','RST','VDD'],
  ['Q0','Q1','Q2','Q3','Q4','Q5','Q6','Q7','Q8','Q9','CO'],null,{sym:'CNT',cat:'count',label:'CD4017',
  note:'CMOS. Exactly one of Q0–Q9 is HIGH. It advances on the rising clock edge while CLOCK INHIBIT is LOW. RESET (active-HIGH) returns to Q0. CARRY OUT is HIGH for counts 0–4, so it runs at one tenth of the clock.',
  seq:{init:()=>({n:0}),step(s,b,pb){if(b.RST)s.n=0;else if((rise(b,pb,'CLK')&&!b.INH)||(fall(b,pb,'INH')&&b.CLK))s.n=(s.n+1)%10;},
    out(s,b){const n=s.n,o={CO:n<5};for(let i=0;i<10;i++)o['Q'+i]=n===i;return o;}}});
const binCounter=(num,label,kind,names,stages,clk,extra)=>msiChip(num,kind,names,names.filter(x=>/^Q\d/.test(x)||/^φO/.test(x)),null,{sym:'CNT',cat:'count',label,
  note:'CMOS ripple counter. It advances on the FALLING edge of the clock input; RESET is active-HIGH. Output Qn divides the clock by 2^n.'+(extra||''),
  seq:{init:()=>({n:0}),step(s,b,pb){if(b.RST)s.n=0;else if(fall(b,pb,clk))s.n=(s.n+1)%(1<<stages);},
    out(s,b){const n=s.n,o={};for(const nm of names)if(/^Q\d+$/.test(nm))o[nm]=n>>(+nm.slice(1)-1)&1;if(clk==='φI'){o['φO']=1-b['φI'];o["φO'"]=b['φI'];}return o;}}});
binCounter('4020','CD4020','14-stage binary ripple counter (CMOS)',['Q12','Q13','Q14','Q6','Q5','Q7','Q4','VSS','Q1','CLK','RST','Q9','Q8','Q10','Q11','VDD'],14,'CLK',' Q2 and Q3 are not brought out.');
binCounter('4040','CD4040','12-stage binary ripple counter (CMOS)',['Q12','Q6','Q5','Q7','Q4','Q3','Q2','VSS','Q1','CLK','RST','Q9','Q8','Q10','Q11','VDD'],12,'CLK');
binCounter('4060','CD4060','14-stage ripple counter with oscillator (CMOS)',['Q12','Q13','Q14','Q6','Q5','Q7','Q4','VSS','φO',"φO'",'φI','RST','Q9','Q8','Q10','VDD'],14,'φI',
  ' The clock goes into φI (pin 11). On a real board a resistor and capacitor (or a crystal) on pins 9, 10 and 11 make it oscillate by itself; here you clock it from the trainer. Q1–Q3 and Q11 are not brought out.');

const CHIP_ORDER=Object.keys(CHIPS);
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

// ================= Validating saved / shared circuits =================
// Circuit codes come from other people and from localStorage, and parts of them end up in HTML,
// so every field is checked strictly before anything is loaded. Returns true only if the whole
// circuit is valid; nothing is changed either way.
const MAX_ICS=40,MAX_WIRES=1500;
const isId=x=>Number.isInteger(x)&&x>0&&x<1e7;
function validState(s){
  if(!s||typeof s!=='object'||!Array.isArray(s.ics)||!Array.isArray(s.wires))return false;
  if(s.ics.length>MAX_ICS||s.wires.length>MAX_WIRES||!isId(s.nextId))return false;
  const ids=new Set(),refs=new Set(),fresh=freshState();
  for(const ic of s.ics){
    if(!ic||typeof ic!=='object'||!isId(ic.id)||ids.has(ic.id))return false;
    if(typeof ic.ref!=='string'||!/^U\d{1,3}$/.test(ic.ref)||refs.has(ic.ref))return false;
    if(typeof ic.type!=='string'||!Object.prototype.hasOwnProperty.call(CHIPS,ic.type))return false;
    const h=CHIPS[ic.type].pins/2;
    if(!Number.isInteger(ic.col)||ic.col<1||ic.col+h-1>COLS)return false;   // fully on the breadboard
    if(!icFits(fresh,ic.type,ic.col))return false;                          // no overlap with ICs already added
    fresh.ics.push({id:ic.id,ref:ic.ref,type:ic.type,col:ic.col});ids.add(ic.id);refs.add(ic.ref);
  }
  for(const w of s.wires){
    if(!w||typeof w!=='object'||!isId(w.id)||ids.has(w.id))return false;
    if(typeof w.a!=='string'||typeof w.b!=='string'||!NODES.has(w.a)||!NODES.has(w.b))return false;
    if(typeof w.color!=='string'||!/^#[0-9A-Fa-f]{3,8}$/.test(w.color))return false;
    ids.add(w.id);
  }
  return s.nextId>Math.max(0,...ids);
}
// Copy only the fields the app uses (call after validState passes).
function cleanState(s){return{ics:s.ics.map(({id,ref,type,col})=>({id,ref,type,col})),wires:s.wires.map(({id,a,b,color})=>({id,a,b,color})),nextId:s.nextId};}

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
    sw:Array.from({length:NSW},(_,i)=>net('S'+i)),clk:net('CLK'),vcc:net('VCC0'),gnd:net('GND0')};
}
// mem (optional Map keyed by IC id) keeps each chip's last outputs and, for flip-flops, counters and
// registers, their stored state, so it survives from one run to the next. clk is the level of the
// trainer's CLOCK output. A run alternates two phases until nothing changes: settle the logic with every
// stored state held, then let sequential chips react to clock edges and set/clear inputs (all of them
// see the same settled values, so synchronous circuits clock together; ripple stages follow round by round).
function run(C,sw,power,mem,clk){
  mem=mem||new Map();
  const N=C.N,d0=new Uint16Array(N),d1=new Uint16Array(N),val=new Uint8Array(N);
  const memOf=x=>{const m=mem.get(x.ic.id);if(m&&m.t!==x.ic.type){mem.delete(x.ic.id);return null;}return m;}; // ids are reused, so check the chip type
  const outs=C.ics.map(x=>{const m=memOf(x);return m&&m.o||null;}),status=C.ics.map(()=>'off');let osc=false;
  // A floating TTL input reads HIGH (like the real chips). A floating CMOS input is undefined on a real chip;
  // here it reads LOW so a missing tie shows up, and the app warns about it.
  const vec=x=>{const v=[0];for(let p=1;p<=x.ch.pins;p++){const q=val[x.pn[p]];v.push(q===0||(q===2&&x.ch.cmos)?0:1);}return v;};
  const settle=()=>{for(let iter=0;;iter++){
    d0.fill(0);d1.fill(0);
    if(power){d1[C.vcc]++;d0[C.gnd]++;for(let i=0;i<NSW;i++)(sw[i]?d1:d0)[C.sw[i]]++;(clk?d1:d0)[C.clk]++;}
    C.ics.forEach((x,k)=>{const o=outs[k];if(!o)return;for(const p in o)if(o[p]!==2)(o[p]?d1:d0)[x.pn[p]]++;});
    for(let n=0;n<N;n++)val[n]=d0[n]&&d1[n]?3:d1[n]?1:d0[n]?0:2;
    let changed=false;
    C.ics.forEach((x,k)=>{const vv=val[x.pn[x.ch.vcc]],gv=val[x.pn[x.ch.gnd]];
      const s=vv===1&&gv===0?'ok':vv===0&&gv===1?'rev':'off';status[k]=s;let o=null;
      if(s==='ok'){const v=vec(x);
        if(x.ch.seq){let m=memOf(x);if(!m||!m.s){m={t:x.ic.type,s:x.ch.init(),pv:null,o:m&&m.o};mem.set(x.ic.id,m);}o=x.ch.out(m.s,v);}
        else o=x.ch.eval(v);}
      else if(x.ch.seq)mem.delete(x.ic.id);   // losing power forgets the stored state
      if(JSON.stringify(o)!==JSON.stringify(outs[k])){changed=true;outs[k]=o;}});
    if(!changed)return true;if(iter>80){osc=true;return false;}}};
  for(let round=0;;round++){
    if(!settle())break;
    let any=false;
    C.ics.forEach((x,k)=>{if(!x.ch.seq||status[k]!=='ok')return;const m=mem.get(x.ic.id),v=vec(x),before=JSON.stringify(m.s);
      x.ch.step(m.s,v,m.pv||v);m.pv=v;if(JSON.stringify(m.s)!==before)any=true;});
    if(!any)break;if(round>300){osc=true;break;}
  }
  C.ics.forEach((x,k)=>{let m=memOf(x);if(!m){if(!outs[k])return;m={t:x.ic.type};mem.set(x.ic.id,m);}m.o=outs[k];});
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

// ================= Experiments for the extended IC set =================
// chipExp builds a one-chip experiment from a spec: inputs go on switches (the first listed input gets
// the highest switch), outputs on LEDs (the first listed output gets the highest LED), plus pins tied to
// +5 V or GND, CLOCK connections and pin-to-pin links. The procedure text is generated from the solution.
// Sequential experiments give seq (steps: input values + number of CLOCK pulses) and model(state, inputs,
// pulses) -> expected outputs, written from the datasheet behaviour.
const b01=x=>x?1:0;
const GM='More logic gates',GCM='CMOS logic gates',GA='Arithmetic',GF='Flip-flops and latches',GS='Shift registers',GK='Counters';
function chipExp(o){
  const ins=o.ins.map(([n],k)=>[n,'S'+(o.ins.length-1-k)]),outs=o.outs.map(([n],k)=>[n,'L'+(o.outs.length-1-k)]);
  return{id:o.id,group:o.group,title:o.title,chips:[o.chip],sym:o.sym||CHIPS[o.chip].sym,ins,outs,f:o.f,seq:o.seq,model:o.model,clk:!!o.clk,rows:o.rows,
    expr:o.expr,theory:o.theory,objective:o.objective,
    solve(a){a.rails();const u=a.ic(o.chip,o.col||12);a.power(u);
      for(const p of o.gnd||[])a.gnd(u,p);for(const p of o.vcc||[])a.vcc(u,p);
      o.ins.forEach(([n,pins],k)=>{for(const p of[].concat(pins))a.w(ins[k][1],a.pin(u,p));});
      for(const p of[].concat(o.clk||[]))a.w('CLK',a.pin(u,p));
      for(const[p,q]of o.links||[])a.w(a.pin(u,p),a.pin(u,q));
      o.outs.forEach(([n,p],k)=>a.w(a.pin(u,p),outs[k][1]));}};
}
const SQ=rows=>rows.map(([i,clk])=>({in:i,clk:clk||0}));
const v4=(i,p,lo=0)=>i[p+lo]+2*i[p+(lo+1)]+4*i[p+(lo+2)]+8*i[p+(lo+3)];
const outBits=(n,names)=>Object.fromEntries(names.map((nm,k)=>[nm,n>>(names.length-1-k)&1])); // names MSB first
// Gate experiments
const gx=(id,group,chip,title,ins,out,f,expr,theory,extra={})=>chipExp({id,group,chip,title,col:10,ins,outs:[['Y',out]],f:i=>({Y:b01(f(i))}),expr,theory,
  objective:`Verify the truth table of the ${title.toLowerCase()} using the ${chipName(chip)}.`,...extra});
const allOf=(i,ks)=>[...ks].every(k=>i[k]),anyOf=(i,ks)=>[...ks].some(k=>i[k]);
const CMOS_TIP=' CMOS inputs must never float, so the procedure ties the unused gate inputs to GND (VSS).';
const NEW_EXPS=[
  gx('nand3',GM,'7410','3-input NAND gate',[['A',1],['B',2],['C',13]],12,i=>!allOf(i,'ABC'),'Y = (A · B · C)′','The output goes LOW only when all three inputs are HIGH. Gate 1 of the 74LS10 uses pins 1, 2 and 13, with its output on pin 12.'),
  gx('and3',GM,'7411','3-input AND gate',[['A',1],['B',2],['C',13]],12,i=>allOf(i,'ABC'),'Y = A · B · C','The output is HIGH only when all three inputs are HIGH. One 3-input gate replaces two cascaded 2-input gates.'),
  gx('nor3',GM,'7427','3-input NOR gate',[['A',1],['B',2],['C',13]],12,i=>!anyOf(i,'ABC'),'Y = (A + B + C)′','The output is HIGH only when all three inputs are LOW.'),
  gx('nand4',GM,'7420','4-input NAND gate',[['A',1],['B',2],['C',4],['D',5]],6,i=>!allOf(i,'ABCD'),'Y = (A · B · C · D)′','The output goes LOW only when all four inputs are HIGH. Pin 3 is not connected inside the 74LS20.'),
  gx('and4',GM,'7421','4-input AND gate',[['A',1],['B',2],['C',4],['D',5]],6,i=>allOf(i,'ABCD'),'Y = A · B · C · D','The output is HIGH only when all four inputs are HIGH.'),
  gx('nor4s',GM,'7425','4-input NOR gate with strobe',[['G',3],['A',1],['B',2],['C',4],['D',5]],6,i=>!(i.G&&anyOf(i,'ABCD')),'Y = (G · (A + B + C + D))′',
    'The strobe G enables the gate. With G = 1 it is an ordinary 4-input NOR; with G = 0 the output is forced HIGH whatever A–D are.'),
  gx('nand8',GM,'7430','8-input NAND gate',[['A',1],['B',2],['C',3],['D',4],['E',5],['F',6],['G',11],['H',12]],8,i=>!allOf(i,'ABCDEFGH'),'Y = (A · B · C · D · E · F · G · H)′',
    'Only the input pattern 11111111 makes the output LOW, so the 74LS30 is often used to detect one particular 8-bit code.'),
  gx('xnor266',GM,'74266','XNOR gate (open collector)',[['A',1],['B',2]],3,i=>i.A===i.B,'Y = (A ⊕ B)′ = A·B + A′·B′',
    'XNOR is HIGH when the inputs are equal — a 1-bit equality detector. The 74LS266 has open-collector outputs: they can only pull LOW, so a real circuit needs a pull-up resistor to +5 V (the trainer LED input here reads it for you). Because of that, several outputs can be wired together to compare whole words.'),
  gx('schmitt',GM,'7414','Schmitt-trigger inverter',[['A',1]],2,i=>!i.A,'Y = A′  (with hysteresis)',
    'Logically it is a NOT gate, but the input switches HIGH at about 1.6 V and back LOW at about 0.8 V. That gap (hysteresis) turns a slow or noisy signal — such as a bouncing mechanical switch — into one clean edge.'),
  gx('c4071',GCM,'4071','CMOS 2-input OR gate',[['A',1],['B',2]],3,i=>i.A||i.B,'Y = A + B','The CD4071 does the same job as the 74LS32 but in CMOS: it draws almost no current and runs from 3 V to 15 V.'+CMOS_TIP,{gnd:[5,6,8,9,12,13]}),
  gx('c4081',GCM,'4081','CMOS 2-input AND gate',[['A',1],['B',2]],3,i=>i.A&&i.B,'Y = A · B','CMOS AND gate. Note the CMOS quad-gate pinout differs from the 74LS08: gate 2 has its output on pin 4 and inputs on pins 5 and 6.'+CMOS_TIP,{gnd:[5,6,8,9,12,13]}),
  gx('c4070',GCM,'4070','CMOS 2-input XOR gate',[['A',1],['B',2]],3,i=>i.A!==i.B,'Y = A ⊕ B','CMOS exclusive-OR: HIGH when the inputs differ.'+CMOS_TIP,{gnd:[5,6,8,9,12,13]}),
  gx('c4077',GCM,'4077','CMOS 2-input XNOR gate',[['A',1],['B',2]],3,i=>i.A===i.B,'Y = (A ⊕ B)′','CMOS exclusive-NOR: HIGH when the inputs are equal.'+CMOS_TIP,{gnd:[5,6,8,9,12,13]}),
  gx('c4075',GCM,'4075','CMOS 3-input OR gate',[['A',1],['B',2],['C',8]],9,i=>anyOf(i,'ABC'),'Y = A + B + C','Gate 1 of the CD4075 uses inputs 1, 2 and 8 and its output is pin 9.'+CMOS_TIP,{gnd:[3,4,5,11,12,13]}),
  gx('c4073',GCM,'4073','CMOS 3-input AND gate',[['A',1],['B',2],['C',8]],9,i=>allOf(i,'ABC'),'Y = A · B · C','Gate 1 of the CD4073 uses inputs 1, 2 and 8 and its output is pin 9.'+CMOS_TIP,{gnd:[3,4,5,11,12,13]}),
  gx('c4072',GCM,'4072','CMOS 4-input OR gate',[['A',2],['B',3],['C',4],['D',5]],1,i=>anyOf(i,'ABCD'),'Y = A + B + C + D','Gate 1 of the CD4072 has inputs on pins 2–5 and its output on pin 1.'+CMOS_TIP,{gnd:[9,10,11,12]}),
  gx('c4082',GCM,'4082','CMOS 4-input AND gate',[['A',2],['B',3],['C',4],['D',5]],1,i=>allOf(i,'ABCD'),'Y = A · B · C · D','Gate 1 of the CD4082 has inputs on pins 2–5 and its output on pin 1.'+CMOS_TIP,{gnd:[9,10,11,12]}),

  chipExp({id:'add83',group:GA,title:'4-bit binary adder (7483)',chip:'7483',ins:[['C0',13],['A4',1],['A3',3],['A2',8],['A1',10],['B4',16],['B3',4],['B2',7],['B1',11]],
    outs:[['C4',14],['Σ4',15],['Σ3',2],['Σ2',6],['Σ1',9]],
    f:i=>{const s=v4(i,'A',1)+v4(i,'B',1)+i.C0;return{C4:b01(s>15),...outBits(s&15,['Σ4','Σ3','Σ2','Σ1'])};},
    expr:'C4 Σ4 Σ3 Σ2 Σ1 = A4A3A2A1 + B4B3B2B1 + C0',objective:'Add two 4-bit numbers and a carry-in with the 7483 parallel adder.',
    theory:'Inside are four full adders with fast (look-ahead) carry. Watch the odd power pins: VCC is pin 5 and GND is pin 12. A1/B1/Σ1 are the least significant bits; C4 is the carry out, the fifth bit of the sum.'}),
  {id:'addsub',group:GA,title:'4-bit adder-subtractor (74283 + 7486)',chips:['74283','7486'],sym:'SUM',
    ins:[['M','S8'],['A4','S7'],['A3','S6'],['A2','S5'],['A1','S4'],['B4','S3'],['B3','S2'],['B2','S1'],['B1','S0']],outs:[['C4','L4'],['Σ4','L3'],['Σ3','L2'],['Σ2','L1'],['Σ1','L0']],
    f:i=>{const A=v4(i,'A',1),B=v4(i,'B',1),s=i.M?A+(15-B)+1:A+B;return{C4:b01(s>15),...outBits(s&15,['Σ4','Σ3','Σ2','Σ1'])};},
    expr:'M = 0: A + B     M = 1: A + B′ + 1 = A − B',objective:'Build one circuit that adds when M = 0 and subtracts (2’s complement) when M = 1.',
    theory:'Each B bit passes through an XOR gate controlled by M: with M = 0 the XOR passes B unchanged, with M = 1 it inverts it (1’s complement). M also goes to the carry input C0, adding the extra 1 that makes the 2’s complement, so the adder computes A − B. When subtracting, C4 = 1 means no borrow (A ≥ B).',
    solve(a){a.rails();const s=a.ic('74283',8),x=a.ic('7486',22);a.power(s);a.power(x);
      [[0,1,2,6],[1,4,5,2],[2,9,10,15],[3,12,13,11]].forEach(([b,xi,xm,sb])=>{a.w('S'+b,a.pin(x,xi));a.w('S8',a.pin(x,xm));});
      a.w(a.pin(x,3),a.pin(s,6));a.w(a.pin(x,6),a.pin(s,2));a.w(a.pin(x,8),a.pin(s,15));a.w(a.pin(x,11),a.pin(s,11));a.w('S8',a.pin(s,7));
      [[4,5],[5,3],[6,14],[7,12]].forEach(([sw,p])=>a.w('S'+sw,a.pin(s,p)));
      [[4,'L0'],[1,'L1'],[13,'L2'],[10,'L3'],[9,'L4']].forEach(([p,l])=>a.w(a.pin(s,p),l));}},
  chipExp({id:'alu181',group:GA,title:'4-bit ALU (74181)',chip:'74181',col:12,
    ins:[['M',8],['Cn',7],['S3',3],['S2',4],['S1',5],['S0',6],['A3',19],['A2',21],['A1',23],['A0',2],['B3',18],['B2',20],['B1',22],['B0',1]],
    outs:[['G',17],['P',15],['A=B',14],['Cn+4',16],['F3',13],['F2',11],['F1',10],['F0',9]],
    f:i=>{const A=v4(i,'A'),B=v4(i,'B'),S=v4(i,'S'),nb=15-B,s0=i.S0?15:0,s1=i.S1?15:0;
      // datasheet function table, active-HIGH data
      const LOGIC=[15-A,15-(A|B),(15-A)&B,0,15-(A&B),nb,A^B,A&nb,(15-A)|B,15-(A^B),B,A&B,15,A|nb,A|B,A];
      const ARITH=[A,A|B,A|nb,15,A+(A&nb),(A|B)+(A&nb),A+nb,(A&nb)+15,A+(A&B),A+B,(A|nb)+(A&B),(A&B)+15,A+A,(A|B)+A,(A|nb)+A,A+15]; // "minus 1" = plus 15 (mod 16)
      const sum=ARITH[S]+(i.Cn?0:1),F=i.M?LOGIC[S]:sum&15;
      return{...outBits(F,['F3','F2','F1','F0']),'Cn+4':b01(sum<16),'A=B':b01(F===15),G:b01(ARITH[S]<16),P:b01((A|(B&s0)|(nb&s1))!==15)};},
    expr:'M = 1: 16 logic functions of A, B     M = 0: 16 arithmetic functions (+ carry)',objective:'Explore the 32 functions of the 74181 arithmetic logic unit, selected by S3–S0 and M.',
    theory:'S3–S0 pick one of 16 functions. With M = 1 the ALU works bit by bit (S = 0110 gives A XOR B, S = 1011 gives A AND B, S = 1110 gives A OR B). With M = 0 it does arithmetic with carries: S = 1001 is A PLUS B and S = 0110 is A MINUS B MINUS 1. For active-HIGH data the carry pins are active-LOW: set Cn = 1 for no carry in (Cn = 0 adds 1, so S = 0110 with Cn = 0 gives A − B), and Cn+4 = 0 means a carry out. A=B goes HIGH when all F outputs are 1; P and G feed a 74182.'}),
  chipExp({id:'cla182',group:GA,title:'Look-ahead carry generator (74182)',chip:'74182',
    ins:[['Cn',13],['G3',5],['G2',14],['G1',1],['G0',3],['P3',6],['P2',15],['P1',2],['P0',4]],outs:[['Cn+z',9],['Cn+y',11],['Cn+x',12],['G',10],['P',7]],
    f:i=>{const g=k=>!i['G'+k],p=k=>!i['P'+k],c=i.Cn;
      return{'Cn+x':b01(g(0)||p(0)&&c),'Cn+y':b01(g(1)||p(1)&&g(0)||p(1)&&p(0)&&c),'Cn+z':b01(g(2)||p(2)&&g(1)||p(2)&&p(1)&&g(0)||p(2)&&p(1)&&p(0)&&c),
        G:b01(!(g(3)||p(3)&&g(2)||p(3)&&p(2)&&g(1)||p(3)&&p(2)&&p(1)&&g(0))),P:b01(!(p(0)&&p(1)&&p(2)&&p(3)))};},
    expr:'Cn+x = G0 + P0·Cn,  Cn+y = G1 + P1·G0 + P1·P0·Cn,  Cn+z = G2 + P2·G1 + P2·P1·G0 + P2·P1·P0·Cn',
    objective:'Compute the carries for four adder blocks at once from their generate (G) and propagate (P) signals.',
    theory:'A ripple-carry adder waits for each carry to pass along. The look-ahead generator works out every carry directly: a block generates a carry (G) or passes one through (P). G0–G3 and P0–P3 are active-LOW (they come straight from the 74181’s G and P pins), so 0 means "generate" or "propagate".'}),
  chipExp({id:'c4585',group:'Comparator',title:'CMOS 4-bit comparator (CD4585)',chip:'4585',ins:[['A3',15],['A2',2],['A1',7],['A0',10],['B3',14],['B2',1],['B1',11],['B0',9]],
    gnd:[5],vcc:[6,4],outs:[['A>B',13],['A=B',3],['A<B',12]],
    f:i=>{const A=v4(i,'A'),B=v4(i,'B');return{'A>B':b01(A>B),'A=B':b01(A===B),'A<B':b01(A<B)};},
    expr:'Compare A3A2A1A0 with B3B2B1B0',objective:'Compare two 4-bit numbers with the CMOS CD4585.',
    theory:'It does the same job as the 7485, but its cascade inputs are tied differently for a single chip: A<B in LOW, A=B in HIGH and A>B in HIGH. The A>B output only goes HIGH when the A>B cascade input is HIGH.'}),

  chipExp({id:'dec139',group:'Decoder',title:'Dual 2-to-4 decoder (74139)',chip:'74139',ins:[['1G',1],['1B',3],['1A',2],['2G',15],['2B',13],['2A',14]],
    outs:[['1Y3',7],['1Y2',6],['1Y1',5],['1Y0',4],['2Y3',9],['2Y2',10],['2Y1',11],['2Y0',12]],
    f:i=>{const o={};for(const h of'12'){const s=i[h+'A']+2*i[h+'B'];for(let k=0;k<4;k++)o[h+'Y'+k]=b01(!(!i[h+'G']&&s===k));}return o;},
    expr:'Yk = 0 when G = 0 and BA = k',objective:'Use both independent 2-to-4 decoders of the 74LS139.',
    theory:'Each half has its own enable G and select inputs B, A. Everything is active-LOW: a half works only while G = 0, and then the output numbered BA goes LOW. With G = 1 all four outputs stay HIGH.'}),
  chipExp({id:'dec42',group:'Decoder',title:'BCD-to-decimal decoder (7442)',chip:'7442',ins:[['D',12],['C',13],['B',14],['A',15]],
    outs:[9,8,7,6,5,4,3,2,1,0].map(k=>['Y'+k,[1,2,3,4,5,6,7,9,10,11][k]]),
    f:i=>{const s=8*i.D+4*i.C+2*i.B+i.A,o={};for(let k=0;k<10;k++)o['Y'+k]=b01(s!==k);return o;},
    expr:'Yk = 0 when DCBA = k (k = 0–9)',objective:'Decode a BCD digit into one of ten active-LOW outputs.',
    theory:'For each valid BCD code 0–9 exactly one output goes LOW (its LED turns OFF). The six invalid codes 1010–1111 select nothing, so all ten outputs stay HIGH.'}),
  chipExp({id:'dec154',group:'Decoder',title:'4-to-16 decoder (74154)',chip:'74154',ins:[['D',20],['C',21],['B',22],['A',23]],gnd:[18,19],
    outs:[15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0].map(k=>['Y'+k,k<=10?k+1:k+2]),
    f:i=>{const s=8*i.D+4*i.C+2*i.B+i.A,o={};for(let k=0;k<16;k++)o['Y'+k]=b01(s!==k);return o;},
    expr:'Yk = 0 when DCBA = k (k = 0–15)',objective:'Decode a 4-bit code into one of sixteen active-LOW outputs.',
    theory:'The 74LS154 is a 24-pin chip. With both enables G1 and G2 tied LOW, the output numbered DCBA goes LOW and the other fifteen stay HIGH — watch the one dark LED move across all 16 LEDs.'}),
  chipExp({id:'enc147',group:'Encoder',title:'10-to-4 priority encoder (74147)',chip:'74147',
    ins:[['I9',10],['I8',5],['I7',4],['I6',3],['I5',2],['I4',1],['I3',13],['I2',12],['I1',11]],outs:[['D',14],['C',6],['B',7],['A',9]],
    f:i=>{let k=0;for(let d=1;d<=9;d++)if(!i['I'+d])k=d;return outBits(15-k,['D','C','B','A']);},
    expr:'DCBA = inverted BCD of the highest input that is LOW',objective:'Encode a decimal key (1–9) into BCD, where the highest key pressed wins.',
    theory:'Used for keypads: each key pulls one input LOW. The highest-numbered LOW input wins and its number comes out in inverted BCD (key 9 gives 0110, key 1 gives 1110). With no key pressed the output is 1111 — the code for 0.'}),
  chipExp({id:'mux157',group:'Multiplexer',title:'Quad 2-to-1 multiplexer (74157)',chip:'74157',
    ins:[['S',1],['4A',14],['3A',11],['2A',5],['1A',2],['4B',13],['3B',10],['2B',6],['1B',3]],gnd:[15],outs:[['4Y',12],['3Y',9],['2Y',7],['1Y',4]],
    f:i=>{const o={};for(const k of'1234')o[k+'Y']=i.S?i[k+'B']:i[k+'A'];return o;},
    expr:'Y = A when S = 0,  Y = B when S = 1  (all four bits at once)',objective:'Select one of two 4-bit words with a single select line.',
    theory:'Four 2-to-1 multiplexers share the select input S, so one switch chooses which whole 4-bit word (A or B) reaches the outputs. The strobe G must be LOW to enable the chip.'}),
  chipExp({id:'mux153',group:'Multiplexer',title:'Dual 4-to-1 multiplexer (74153)',chip:'74153',
    ins:[['B',2],['A',14],['1C3',3],['1C2',4],['1C1',5],['1C0',6],['2C3',13],['2C2',12],['2C1',11],['2C0',10]],gnd:[1,15],outs:[['1Y',7],['2Y',9]],
    f:i=>{const s=2*i.B+i.A;return{'1Y':i['1C'+s],'2Y':i['2C'+s]};},
    expr:'1Y = 1C(BA),  2Y = 2C(BA)',objective:'Use the two 4-to-1 multiplexers of the 74LS153, which share one select code.',
    theory:'The select inputs B and A pick input number BA in both halves at the same time. Both strobes are tied LOW to enable the chip.'}),
  chipExp({id:'mux150',group:'Multiplexer',title:'Function generator with a 16-to-1 MUX (74150)',chip:'74150',ins:[['D',11],['C',13],['B',14],['A',15]],
    gnd:[9,...[1,2,4,7,8,11,13,14].map(k=>[8,7,6,5,4,3,2,1,23,22,21,20,19,18,17,16][k])],vcc:[0,3,5,6,9,10,12,15].map(k=>[8,7,6,5,4,3,2,1,23,22,21,20,19,18,17,16][k]),
    outs:[['W',10]],
    f:i=>({W:(i.D+i.C+i.B+i.A)&1}),
    expr:'F(D,C,B,A) = Σm(1,2,4,7,8,11,13,14)  (odd parity)',objective:'Implement any 4-variable function with one 74150 by tying its data inputs HIGH or LOW.',
    theory:'A 16-to-1 multiplexer can produce any function of its four select variables: data input Ek simply holds the function value for minterm k. The 74150’s only output W is inverted, so each Ek is tied to the COMPLEMENT of F: GND where F = 1 (minterms 1, 2, 4, 7, 8, 11, 13, 14) and +5 V where F = 0. Here F is the odd-parity function — W is HIGH when an odd number of switches are on.'}),
  chipExp({id:'demux155',group:'Demultiplexer',title:'1-to-8 demultiplexer (74155)',chip:'74155',ins:[['D',[2,14]],['C',[1,15]],['B',3],['A',13]],
    outs:[['Y7',4],['Y6',5],['Y5',6],['Y4',7],['Y3',12],['Y2',11],['Y1',10],['Y0',9]],
    f:i=>{const s=4*i.C+2*i.B+i.A,o={};for(let k=0;k<8;k++)o['Y'+k]=k===s?i.D:1;return o;},
    expr:'Y(CBA) = D; every other output stays HIGH',objective:'Join the two halves of the 74LS155 into one 1-to-8 demultiplexer.',
    theory:'Tie 1G and 2G together as the data input D, and 1C with 2C as the third select bit C. Section 1 needs C = 1 and section 2 needs C = 0 (2C is inverted), so C chooses the half and BA the output inside it: 2Y0–2Y3 are outputs 0–3 and 1Y0–1Y3 are 4–7. The selected output copies D.'}),

  chipExp({id:'dff74',group:GF,title:'D flip-flop (7474)',chip:'7474',ins:[['PRE',4],['CLR',1],['D',2]],clk:[3],outs:[['Q',5],["Q'",6]],
    seq:SQ([[[1,0,0]],[[1,1,1],1],[[1,1,0]],[[1,1,0],1],[[0,1,0]],[[1,1,0]],[[1,1,1],2],[[1,1,0],1],[[0,0,1]]]),
    model:(s,i,n)=>{s.q=s.q||0;if(!i.PRE&&!i.CLR)return{Q:1,"Q'":1};if(!i.PRE)s.q=1;else if(!i.CLR)s.q=0;else if(n)s.q=i.D;return{Q:s.q,"Q'":1-s.q};},
    expr:'Q(next) = D at the rising clock edge',objective:'Verify the D flip-flop: it stores D on each rising clock edge; PRE and CLR act at once.',
    theory:'A D flip-flop is a 1-bit memory. On each rising edge of CLK, Q takes the value of D and then holds it, however D changes. PRE (preset) and CLR (clear) are active-LOW and override the clock: PRE = 0 forces Q = 1, CLR = 0 forces Q = 0. Never make both LOW together — then Q and Q′ are both HIGH.'}),
  chipExp({id:'jk76',group:GF,title:'JK flip-flop (7476)',chip:'7476',ins:[['PRE',2],['CLR',3],['J',4],['K',16]],clk:[1],outs:[['Q',15],["Q'",14]],
    seq:SQ([[[1,0,0,0]],[[1,1,0,0],1],[[1,1,1,0],1],[[1,1,0,0],1],[[1,1,0,1],1],[[1,1,1,1],1],[[1,1,1,1],1],[[1,1,1,1],3],[[1,0,0,0]],[[0,1,0,0]],[[1,1,0,0]]]),
    model:(s,i,n)=>{s.q=s.q||0;if(!i.PRE)s.q=1;else if(!i.CLR)s.q=0;else for(let k=0;k<n;k++)s.q=i.J&&i.K?1-s.q:i.J?1:i.K?0:s.q;return{Q:s.q,"Q'":1-s.q};},
    expr:'JK = 00 hold, 01 reset, 10 set, 11 toggle',objective:'Verify the four modes of the JK flip-flop.',
    theory:'The JK flip-flop removes the forbidden state of the SR flip-flop: with J = K = 1 every clock pulse toggles Q. The 74LS76 changes on the falling edge, i.e. when you release the CLOCK button. Watch the odd power pins: VCC is pin 5 and GND is pin 13.'}),
  chipExp({id:'jk112',group:GF,title:'T flip-flop from a JK (74112)',chip:'74112',ins:[['PRE',4],['CLR',15],['T',[3,2]]],clk:[1],outs:[['Q',5],["Q'",6]],
    seq:SQ([[[1,0,0]],[[1,1,1],1],[[1,1,0],2],[[1,1,1],1],[[1,1,0],2],[[1,1,1],3],[[1,0,0]],[[0,1,0]],[[1,1,1],1]]),
    model:(s,i,n)=>{s.q=s.q||0;if(!i.PRE)s.q=1;else if(!i.CLR)s.q=0;else if(i.T&&n%2)s.q=1-s.q;return{Q:s.q,"Q'":1-s.q};},
    expr:'T = 1: Q toggles on every clock;  T = 0: Q holds',objective:'Turn a JK flip-flop into a T (toggle) flip-flop by joining J and K.',
    theory:'Wire J and K together as one input T. With T = 1 the output toggles on every falling clock edge, so Q runs at half the clock frequency — the basic building block of counters. With T = 0 it holds.'}),
  chipExp({id:'jk107',group:GF,title:'2-bit ripple counter (74107)',chip:'74107',ins:[['CLR',[13,10]]],vcc:[1,4,8,11],clk:[12],links:[[3,9]],outs:[['Q1',5],['Q0',3]],
    seq:SQ([[[0]],[[1],1],[[1],1],[[0]],[[1],3],[[0]],[[1],1],[[1],1],[[1],1],[[1],1]]),
    model:(s,i,n)=>{s.n=s.n||0;s.n=i.CLR?(s.n+n)%4:0;return outBits(s.n,['Q1','Q0']);},
    expr:'Q1 Q0 counts 00 → 01 → 10 → 11 → 00',objective:'Build a 2-bit ripple counter from the two JK flip-flops of the 74LS107.',
    theory:'Both flip-flops have J = K = 1, so each one toggles on a falling clock edge. The first is clocked by the CLOCK button; its output Q0 clocks the second. Q1 toggles each time Q0 falls from 1 to 0, so Q1 Q0 counts in binary. The active-LOW CLR resets both.'}),
  chipExp({id:'latch75',group:GF,title:'4-bit D latch (7475)',chip:'7475',ins:[['C',[13,4]],['D4',7],['D3',6],['D2',3],['D1',2]],outs:[['Q4',9],['Q3',10],['Q2',15],['Q1',16]],
    seq:SQ([[[1,1,0,1,0]],[[0,1,0,1,0]],[[0,0,1,0,1]],[[1,0,1,0,1]],[[1,1,1,1,1]],[[0,1,1,1,1]],[[0,0,0,0,0]]]),
    model:(s,i)=>{s.q=s.q||[0,0,0,0];if(i.C)s.q=[i.D4,i.D3,i.D2,i.D1];return{Q4:s.q[0],Q3:s.q[1],Q2:s.q[2],Q1:s.q[3]};},
    expr:'C = 1: Q follows D;  C = 0: Q holds',objective:'Show the difference between a latch (level-triggered) and a flip-flop (edge-triggered).',
    theory:'While the enable C is HIGH the latch is transparent: each Q follows its D at once. When C goes LOW the last values are held, whatever D does. Here both enables (pins 13 and 4) are driven by one switch. VCC is pin 5 and GND pin 12.'}),
  chipExp({id:'dff175',group:GF,title:'4-bit register (74175)',chip:'74175',ins:[['CLR',1],['D4',13],['D3',12],['D2',5],['D1',4]],clk:[9],outs:[['Q4',15],['Q3',10],['Q2',7],['Q1',2]],
    seq:SQ([[[0,0,0,0,0]],[[1,1,0,1,1],1],[[1,0,1,0,0]],[[1,0,1,0,0],1],[[1,1,1,1,1],1],[[0,1,1,1,1]]]),
    model:(s,i,n)=>{s.q=s.q||[0,0,0,0];if(!i.CLR)s.q=[0,0,0,0];else if(n)s.q=[i.D4,i.D3,i.D2,i.D1];return{Q4:s.q[0],Q3:s.q[1],Q2:s.q[2],Q1:s.q[3]};},
    expr:'Q4–Q1 ← D4–D1 on each rising clock edge',objective:'Store a 4-bit word in a register of four D flip-flops with a common clock.',
    theory:'All four flip-flops share the clock, so a single pulse copies the whole word D4–D1 into Q4–Q1. Between clock edges the register holds its value. CLR (active-LOW) empties it at once.'}),
  chipExp({id:'dff174',group:GF,title:'6-bit register (74174)',chip:'74174',ins:[['CLR',1],['D6',14],['D5',13],['D4',11],['D3',6],['D2',4],['D1',3]],clk:[9],
    outs:[['Q6',15],['Q5',12],['Q4',10],['Q3',7],['Q2',5],['Q1',2]],
    seq:SQ([[[0,0,0,0,0,0,0]],[[1,1,0,1,0,1,0],1],[[1,0,1,0,1,0,1]],[[1,0,1,0,1,0,1],1],[[1,1,1,0,0,1,1],1],[[0,1,1,0,0,1,1]]]),
    model:(s,i,n)=>{s.q=s.q||Array(6).fill(0);if(!i.CLR)s.q.fill(0);else if(n)s.q=[i.D6,i.D5,i.D4,i.D3,i.D2,i.D1];return Object.fromEntries(s.q.map((v,k)=>['Q'+(6-k),v]));},
    expr:'Q6–Q1 ← D6–D1 on each rising clock edge',objective:'Store a 6-bit word in the hex D flip-flop 74LS174.',
    theory:'Six D flip-flops with one common clock and one active-LOW clear. Unlike the 74175 there are no Q′ outputs, which leaves room for six bits in a 16-pin package.'}),

  chipExp({id:'sr95',group:GS,title:'4-bit shift register (7495)',chip:'7495',ins:[['MODE',6],['SER',1],['A',2],['B',3],['C',4],['D',5]],clk:[9,8],
    outs:[['QA',13],['QB',12],['QC',11],['QD',10]],
    seq:SQ([[[1,0,1,0,1,1],1],[[0,0,1,0,1,1],1],[[0,1,1,0,1,1],1],[[0,1,0,0,0,0],2],[[0,0,0,0,0,0],1],[[1,0,0,1,0,0],1],[[0,0,0,1,0,0],4]]),
    model:(s,i,n)=>{s.q=s.q||[0,0,0,0];for(let k=0;k<n;k++)s.q=i.MODE?[i.A,i.B,i.C,i.D]:[i.SER,...s.q.slice(0,3)];return{QA:s.q[0],QB:s.q[1],QC:s.q[2],QD:s.q[3]};},
    expr:'MODE = 1: load A–D;  MODE = 0: shift right SER → QA → QB → QC → QD',objective:'Use the 7495 for parallel loading and serial right shifting.',
    theory:'With MODE = 1 a clock pulse loads A–D in parallel. With MODE = 0 every pulse moves the data one place to the right and SER enters at QA. The 7495 has two clock pins (CLK1 for shifting, CLK2 for loading); wiring both to the CLOCK button lets MODE choose. It acts on the falling edge.'}),
  chipExp({id:'sr164',group:GS,title:'8-bit serial-in parallel-out register (74164)',chip:'74164',ins:[['CLR',9],['A',1]],vcc:[2],clk:[8],
    outs:[...L8].map((c,k)=>['Q'+c,[3,4,5,6,10,11,12,13][k]]),
    seq:SQ([[[0,0]],[[1,1],1],[[1,0],1],[[1,1],2],[[1,0],3],[[1,1],1],[[1,0],2],[[0,0]]]),
    model:(s,i,n)=>{s.q=s.q||Array(8).fill(0);if(!i.CLR)s.q.fill(0);else for(let k=0;k<n;k++)s.q=[i.A,...s.q.slice(0,7)];return Object.fromEntries([...L8].map((c,k)=>['Q'+c,s.q[k]]));},
    expr:'On each rising edge: QA ← A·B, QB ← QA, … QH ← QG',objective:'Shift a serial bit stream into the 74LS164 and read it out in parallel.',
    theory:'Each clock pulse moves every bit one place along (QA → QH) and takes in a new bit at QA. The serial input is A AND B, so B is tied HIGH and A carries the data. After 8 pulses the last 8 bits sent are all visible at once — serial-to-parallel conversion.'}),
  chipExp({id:'sr165',group:GS,title:'8-bit parallel-in serial-out register (74165)',chip:'74165',
    ins:[['SH/LD',1],['A',11],['B',12],['C',13],['D',14],['E',3],['F',4],['G',5],['H',6]],gnd:[15,10],clk:[2],outs:[['QH',9],["QH'",7]],
    seq:SQ([[[0,1,0,1,1,0,0,1,1]],...Array(8).fill([[1,1,0,1,1,0,0,1,1],1]),[[0,0,1,0,0,1,1,0,0]],...Array(7).fill([[1,0,1,0,0,1,1,0,0],1])]),
    model:(s,i,n)=>{s.q=s.q||Array(8).fill(0);if(!i['SH/LD'])s.q=[...L8].map(c=>i[c]);else for(let k=0;k<n;k++)s.q=[0,...s.q.slice(0,7)];return{QH:s.q[7],"QH'":1-s.q[7]};},
    expr:'SH/LD = 0: load A–H;  SH/LD = 1: shift one bit out at QH per clock',objective:'Load a byte in parallel and send it out one bit at a time.',
    theory:'With SH/LD = 0 the eight switches A–H are loaded at once, and QH shows H. With SH/LD = 1 each clock pulse shifts the byte one place, so QH shows G, F, E … A in turn — parallel-to-serial conversion. SER (tied LOW here) fills in behind. CLK INH must be LOW.'}),
  chipExp({id:'sr595',group:GS,title:'Shift register with output latch (74595)',chip:'74595',ins:[['SRCLR',10],['RCLK',12],['SER',14]],gnd:[13],clk:[11],
    outs:[...[...L8].map((c,k)=>['Q'+c,[15,1,2,3,4,5,6,7][k]]),["QH'",9]],
    seq:SQ([[[0,0,0]],[[1,0,1],8],[[1,1,1]],[[1,0,0],3],[[1,1,0]],[[1,0,1],5],[[1,1,1]],[[0,0,0]],[[0,1,0]]]),
    model:(s,i,n)=>{s.sr=s.sr||Array(8).fill(0);s.st=s.st||Array(8).fill(0);if(i.RCLK&&!s.r)s.st=s.sr.slice();s.r=i.RCLK;if(!i.SRCLR)s.sr.fill(0);
      else for(let k=0;k<n;k++)s.sr=[i.SER,...s.sr.slice(0,7)];return{...Object.fromEntries([...L8].map((c,k)=>['Q'+c,s.st[k]])),"QH'":s.sr[7]};},
    expr:'CLOCK shifts SER in;  RCLK 0 → 1 copies the shift register to QA–QH',objective:'Shift data in without disturbing the outputs, then update all eight outputs at once.',
    theory:'The 74595 has two registers. The CLOCK button (SRCLK) shifts bits into the hidden shift register; the LEDs do not change. Flipping RCLK from 0 to 1 copies all eight bits to the outputs in one go, so the outputs never show half-shifted data. QH′ is the serial output for chaining another 74595. OE is tied LOW to enable the outputs.'}),
  chipExp({id:'c4015',group:GS,title:'CMOS 4-bit shift register (CD4015)',chip:'4015',ins:[['RST',6],['DATA',7]],gnd:[1,14,15],clk:[9],outs:[['Q1A',5],['Q2A',4],['Q3A',3],['Q4A',10]],
    seq:SQ([[[1,0]],[[0,1],1],[[0,0],1],[[0,1],1],[[0,1],1],[[0,0],2],[[1,0]]]),
    model:(s,i,n)=>{s.q=s.q||[0,0,0,0];if(i.RST)s.q=[0,0,0,0];else for(let k=0;k<n;k++)s.q=[i.DATA,...s.q.slice(0,3)];return{Q1A:s.q[0],Q2A:s.q[1],Q3A:s.q[2],Q4A:s.q[3]};},
    expr:'On each rising edge: Q1 ← DATA, Q2 ← Q1, Q3 ← Q2, Q4 ← Q3',objective:'Shift data through register A of the CD4015.',
    theory:'The CD4015 holds two separate 4-bit serial-in, parallel-out registers. Register A is used here; RESET is active-HIGH. The unused register B has its inputs tied to VSS, because CMOS inputs must never float.'}),
  chipExp({id:'c4094',group:GS,title:'CMOS shift-and-store register (CD4094)',chip:'4094',ins:[['STR',1],['DATA',2]],vcc:[15],clk:[3],
    outs:[...[1,2,3,4,5,6,7,8].map(k=>['Q'+k,[4,5,6,7,14,13,12,11][k-1]]),['QS',9]],
    seq:SQ([[[0,1],8],[[1,1]],[[0,0],3],[[1,0]],[[1,1],2],[[0,0],8],[[1,0]]]),
    model:(s,i,n)=>{s.sr=s.sr||Array(8).fill(0);s.st=s.st||Array(8).fill(0);for(let k=0;k<n;k++)s.sr=[i.DATA,...s.sr.slice(0,7)];if(i.STR)s.st=s.sr.slice();
      return{...Object.fromEntries(s.st.map((v,k)=>['Q'+(k+1),v])),QS:s.sr[7]};},
    expr:'CLOCK shifts DATA in;  STROBE = 1 passes the shift register to Q1–Q8',objective:'Shift data into the CD4094 and release it to the outputs with STROBE.',
    theory:'Data shifts in on each rising clock edge. The Q outputs come from a storage latch: while STROBE is HIGH it follows the shift register; when STROBE is LOW it holds, so you can shift new data in without the LEDs flickering. OUTPUT ENABLE is tied HIGH. QS is the serial output.'}),
  chipExp({id:'c4014',group:GS,title:'CMOS parallel-in serial-out register (CD4014)',chip:'4014',ins:[['P/S',9],...[1,2,3,4,5,6,7,8].map(k=>['P'+k,[7,6,5,4,13,14,15,1][k-1]])],gnd:[11],clk:[10],
    outs:[['Q6',2],['Q7',12],['Q8',3]],
    seq:SQ([[[1,1,0,1,1,0,1,0,0],1],...Array(7).fill([[0,1,0,1,1,0,1,0,0],1]),[[1,0,1,0,0,1,0,1,1],1],...Array(7).fill([[0,0,1,0,0,1,0,1,1],1])]),
    model:(s,i,n)=>{s.q=s.q||Array(8).fill(0);for(let k=0;k<n;k++)s.q=i['P/S']?[1,2,3,4,5,6,7,8].map(j=>i['P'+j]):[0,...s.q.slice(0,7)];return{Q6:s.q[5],Q7:s.q[6],Q8:s.q[7]};},
    expr:'P/S = 1: load P1–P8 on the clock edge;  P/S = 0: shift towards Q8',objective:'Load a byte into the CD4014 and shift it out at Q8.',
    theory:'Unlike the 74165, the CD4014 loads synchronously: with P/S = 1 nothing happens until the rising clock edge. With P/S = 0 each pulse shifts the data one stage towards Q8, and SER (tied LOW) fills in behind. Only stages 6, 7 and 8 have outputs.'}),

  chipExp({id:'cnt90',group:GK,title:'Decade counter (7490)',chip:'7490',ins:[['R9',[6,7]],['R0',[2,3]]],clk:[14],links:[[12,1]],outs:[['QD',11],['QC',8],['QB',9],['QA',12]],
    seq:SQ([[[0,1]],[[0,0],1],[[0,0],1],[[0,0],7],[[0,0],1],[[0,0],5],[[1,0]],[[0,0],1],[[0,1]]]),
    model:(s,i,n)=>{s.n=s.n||0;if(i.R9)s.n=9;else if(i.R0)s.n=0;else s.n=(s.n+n)%10;return outBits(s.n,['QD','QC','QB','QA']);},
    expr:'QD QC QB QA counts 0000 → 1001 → 0000 (BCD)',objective:'Use the 7490 as a BCD (mod-10) counter.',
    theory:'The 7490 is a divide-by-2 stage (CKA → QA) plus a divide-by-5 stage (CKB → QB, QC, QD). Feeding QA into CKB gives a decade counter that counts 0–9 on falling clock edges. R0 (both pins HIGH) resets to 0; R9 sets 9. Watch the power pins: VCC is pin 5 and GND pin 10.'}),
  chipExp({id:'cnt92',group:GK,title:'Divide-by-12 counter (7492)',chip:'7492',ins:[['R0',[6,7]]],clk:[14],links:[[12,1]],outs:[['QD',8],['QC',9],['QB',11],['QA',12]],
    seq:SQ([[[1]],[[0],1],[[0],4],[[0],1],[[0],5],[[0],1],[[0],3],[[1]]]),
    model:(s,i,n)=>{s.n=s.n||0;s.n=i.R0?0:(s.n+n)%12;return outBits([0,1,2,3,4,5,8,9,10,11,12,13][s.n],['QD','QC','QB','QA']);},
    expr:'Counts 0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, then back to 0',objective:'Divide the clock by 12 with the 7492.',
    theory:'The 7492 is a divide-by-2 stage followed by a divide-by-6 stage (÷3 then ÷2). Its count is not plain binary: the outputs jump from 0101 to 1000. QD changes at one twelfth of the clock rate, which is why it is used in clocks (12 hours) and frequency dividers.'}),
  chipExp({id:'cnt93',group:GK,title:'4-bit binary counter (7493)',chip:'7493',ins:[['R0',[2,3]]],clk:[14],links:[[12,1]],outs:[['QD',11],['QC',8],['QB',9],['QA',12]],
    seq:SQ([[[1]],[[0],1],[[0],1],[[0],5],[[0],8],[[0],1],[[0],3],[[1]]]),
    model:(s,i,n)=>{s.n=s.n||0;s.n=i.R0?0:(s.n+n)%16;return outBits(s.n,['QD','QC','QB','QA']);},
    expr:'QD QC QB QA counts 0000 → 1111 → 0000',objective:'Count 0–15 with the 7493 ripple counter.',
    theory:'A divide-by-2 stage feeds a divide-by-8 stage, giving a 4-bit ripple counter. Each output is half the frequency of the one before. R0(1) and R0(2) both HIGH reset it.'}),
  chipExp({id:'cnt93m10',group:GK,title:'MOD-10 counter from a 7493',chip:'7493',ins:[],clk:[14],links:[[12,1],[9,2],[11,3]],outs:[['QD',11],['QC',8],['QB',9],['QA',12]],
    seq:SQ([[[],1],[[],1],[[],2],[[],1],[[],1],[[],1],[[],2],[[],1],[[],13]]),
    model:(s,i,n)=>{s.n=((s.n||0)+n)%10;return outBits(s.n,['QD','QC','QB','QA']);},
    expr:'Reset when QD = QB = 1 (count 10) → counts 0–9',objective:'Make a counter with any modulus by resetting a binary counter early.',
    theory:'Connect QB to R0(1) and QD to R0(2). The moment the count reaches 1010 (ten), both reset inputs go HIGH and the counter clears itself to 0000, so you never see 10. To count modulo N, reset on the outputs that are 1 in N.'}),
  ...[['74160',true,true],['74161',false,true],['74162',true,false],['74163',false,false]].map(([chip,dec,asy])=>chipExp({id:'cnt'+chip.slice(2),group:GK,
    title:`Synchronous ${dec?'decade':'binary'} counter (${chip})`,chip,ins:[['CLR',1],['LOAD',9],['EN',[7,10]],['D',6],['C',5],['B',4],['A',3]],clk:[2],
    outs:[['RCO',15],['QD',11],['QC',12],['QB',13],['QA',14]],
    seq:SQ([[[1,1,1,0,0,0,0],3],[[0,1,1,0,0,0,0]],[[0,1,1,0,0,0,0],1],[[1,1,1,0,0,0,0],9],[[1,1,1,0,0,0,0],1],[[1,0,1,0,1,1,1]],[[1,0,1,0,1,1,1],1],[[1,1,0,0,1,1,1],3],[[1,1,1,0,1,1,1],8],[[1,1,1,0,1,1,1],1],[[1,0,1,1,0,0,0],1],[[1,1,1,1,0,0,0],1]]),
    model:(s,i,n)=>{const max=dec?9:15;s.n=s.n||0;if(asy&&!i.CLR)s.n=0;
      for(let k=0;k<n;k++)s.n=!i.CLR?0:!i.LOAD?8*i.D+4*i.C+2*i.B+i.A:i.EN?(s.n===max?0:(s.n+1)%16):s.n;
      return{RCO:b01(i.EN&&s.n===max),...outBits(s.n,['QD','QC','QB','QA'])};},
    expr:`Counts ${dec?'0–9':'0–15'};  CLR ${asy?'acts at once':'waits for the clock'};  LOAD waits for the clock`,
    objective:`Explore the synchronous ${dec?'decade':'4-bit binary'} counter ${chipName(chip)}: count, enable, load and clear.`,
    theory:`All four flip-flops are clocked together, so the outputs change at the same instant (no ripple). With EN (ENP and ENT) HIGH it counts on each rising edge, wrapping after ${dec?9:15}; RCO goes HIGH at ${dec?9:15} to enable the next counter in a chain. LOAD = 0 copies D C B A in on the next clock edge. The ${chip} has ${asy?'a direct (asynchronous) clear: CLR = 0 empties it at once, without a clock':'a synchronous clear: with CLR = 0 it clears on the next clock edge, not before'}.`})),
  ...[['74190',true],['74191',false]].map(([chip,dec])=>chipExp({id:'cnt'+chip.slice(2),group:GK,title:`Up/down ${dec?'decade':'binary'} counter (${chip})`,chip,
    ins:[['LOAD',11],['D/U',5],['CTEN',4],['D',9],['C',10],['B',1],['A',15]],clk:[14],outs:[['RCO',13],['MAX/MIN',12],['QD',7],['QC',6],['QB',2],['QA',3]],
    seq:SQ([[[0,0,0,0,0,0,0]],[[1,0,0,0,0,0,0],3],[[1,1,0,0,0,0,0],1],[[1,1,0,0,0,0,0],2],[[1,1,0,0,0,0,0],1],[[1,0,0,0,0,0,0]],[[0,0,0,0,1,1,0]],[[1,0,1,0,1,1,0],2],[[1,0,0,0,1,1,0],2],[[1,0,0,0,1,1,0],dec?2:8]]),
    model:(s,i,n)=>{const max=dec?9:15;s.n=s.n||0;if(!i.LOAD)s.n=8*i.D+4*i.C+2*i.B+i.A;else if(!i.CTEN)for(let k=0;k<n;k++)s.n=i['D/U']?(s.n===0?max:s.n-1):(s.n>=max?0:s.n+1);
      const mm=i['D/U']?s.n===0:s.n===max;return{RCO:b01(!(mm&&!i.CTEN)),'MAX/MIN':b01(mm),...outBits(s.n,['QD','QC','QB','QA'])};},
    expr:'D/U = 0 counts up, D/U = 1 counts down;  LOAD = 0 presets D C B A at once',objective:`Count up and down with the ${chipName(chip)} and preset it with LOAD.`,
    theory:`One clock input and a direction control D/U. CTEN (active-LOW) enables counting. MAX/MIN goes HIGH at ${dec?9:15} when counting up, or at 0 when counting down; RCO then goes LOW while the clock is LOW, so it can clock the next counter in a chain. LOAD is asynchronous: it presets the count at once.`})),
  ...[['74192',true],['74193',false]].map(([chip,dec])=>{const max=dec?9:15,base=[0,1,0,0,0,0];
    const rows=[[[1,1,0,0,0,0,1,1]],[[0,1,0,0,0,0,1,1]]],up=(k)=>{for(let j=0;j<k;j++)rows.push([[...base,0,1]],[[...base,1,1]]);},dn=(k)=>{for(let j=0;j<k;j++)rows.push([[...base,1,0]],[[...base,1,1]]);};
    up(3);up(max-3);rows.push([[...base,0,1]]);rows.push([[...base,1,1]]);dn(1);rows.push([[...base,1,0]]);rows.push([[...base,1,1]]);rows.push([[0,0,0,1,1,1,1,1]]);rows.push([[0,1,0,1,1,1,1,1]]);dn(2);rows.push([[1,1,0,1,1,1,1,1]]);rows.push([[0,0,1,0,0,0,1,1]]);rows.push([[0,1,1,0,0,0,1,1]]);up(1);
    return chipExp({id:'cnt'+chip.slice(2),group:GK,title:`Dual-clock up/down ${dec?'decade':'binary'} counter (${chip})`,chip,
      ins:[['CLR',14],['LOAD',11],['D',9],['C',10],['B',1],['A',15],['UP',5],['DOWN',4]],outs:[['CO',12],['BO',13],['QD',7],['QC',6],['QB',2],['QA',3]],seq:SQ(rows),
      model:(s,i)=>{s.n=s.n||0;s.u=s.u??1;s.d=s.d??1;if(i.CLR)s.n=0;else if(!i.LOAD)s.n=8*i.D+4*i.C+2*i.B+i.A;else if(i.UP&&!s.u&&i.DOWN)s.n=s.n>=max?0:s.n+1;else if(i.DOWN&&!s.d&&i.UP)s.n=s.n===0?max:s.n-1;
        s.u=i.UP;s.d=i.DOWN;return{CO:b01(!(s.n===max&&!i.UP)),BO:b01(!(s.n===0&&!i.DOWN)),...outBits(s.n,['QD','QC','QB','QA'])};},
      expr:'UP 0 → 1 counts up, DOWN 0 → 1 counts down (the other clock held HIGH)',objective:`Count up and down with the two clock inputs of the ${chipName(chip)}.`,
      theory:`There are separate clocks for up and down. Keep both switches at 1; flipping UP to 0 and back to 1 counts up one step, flipping DOWN does the same downwards (the count changes on the 0 → 1 edge). CO goes LOW at ${max} while UP is LOW and BO goes LOW at 0 while DOWN is LOW — they clock the next counter in a chain. CLR (active-HIGH) and LOAD (active-LOW) act at once.`});}),
  chipExp({id:'c4017',group:GK,title:'CMOS decade counter / divider (CD4017)',chip:'4017',ins:[['RST',15]],gnd:[13],clk:[14],
    outs:[['CO',12],...[9,8,7,6,5,4,3,2,1,0].map(k=>['Q'+k,[3,2,4,7,10,1,5,6,9,11][k]])],
    seq:SQ([[[1]],...Array(10).fill([[0],1]),[[0],3],[[1]]]),
    model:(s,i,n)=>{s.n=s.n||0;s.n=i.RST?0:(s.n+n)%10;const o={CO:b01(s.n<5)};for(let k=0;k<10;k++)o['Q'+k]=b01(s.n===k);return o;},
    expr:'One output HIGH at a time: Q0 → Q1 → … → Q9 → Q0',objective:'Step a single lit LED along ten outputs with the CD4017 (Johnson counter).',
    theory:'Each rising clock edge moves the single HIGH output on by one place — perfect for running lights and sequencers. CARRY OUT is HIGH for counts 0–4 and LOW for 5–9, a square wave at one tenth of the clock. CLOCK INHIBIT is tied LOW; RESET (active-HIGH) returns to Q0.'}),
  ...[['4020','Q14 Q13 Q12 Q11 Q10 Q9 Q8 Q7 Q6 Q5 Q4 Q1',[3,2,1,15,14,12,13,6,4,5,7,9],10,11,14,'Q2 and Q3 are not brought out, so Q4 is the next output after Q1.'],
     ['4040','Q12 Q11 Q10 Q9 Q8 Q7 Q6 Q5 Q4 Q3 Q2 Q1',[1,15,14,12,13,4,2,3,5,6,7,9],10,11,12,'All twelve stages have outputs.'],
     ['4060','Q14 Q13 Q12 Q10 Q9 Q8 Q7 Q6 Q5 Q4',[3,2,1,15,13,14,6,4,5,7],11,12,14,'Only Q4–Q10 and Q12–Q14 are brought out. On a real board an RC network or crystal on pins 9–11 makes its own clock; here the trainer clocks φI (pin 11).']]
    .map(([chip,qs,pins,ck,rst,stages,extra])=>{const names=qs.split(' ');return chipExp({id:'c'+chip,group:GK,title:`CMOS ${stages}-stage binary counter (CD${chip})`,chip,ins:[['RST',rst]],clk:[ck],
      outs:names.map((nm,k)=>[nm,pins[k]]),
      seq:SQ([[[1]],[[0],1],[[0],7],[[0],100],[[0],900],...(stages===12?[[[0],2064],[[0],1023]]:[[[0],6160],[[0],1032]]),[[1]],[[0],3]]),
      model:(s,i,n)=>{s.n=s.n||0;s.n=i.RST?0:(s.n+n)%(1<<stages);return Object.fromEntries(names.map(nm=>[nm,s.n>>(+nm.slice(1)-1)&1]));},
      expr:`Output Qn = clock ÷ 2^n  (counts 0 to ${(1<<stages)-1})`,objective:`Divide a clock by large powers of two with the CD${chip}.`,
      theory:`A chain of ${stages} toggle flip-flops: each stage changes on the falling edge of the one before, so output Qn runs at the clock frequency divided by 2^n. That is how a 32 768 Hz watch crystal becomes a 1 Hz tick. RESET is active-HIGH. ${extra} The Check button sends thousands of pulses for you.`});}),
];
EXPS.push(...NEW_EXPS);
// Display order of the experiment groups in the sidebar.
const GROUP_ORDER=[G1,GM,GCM,G2N,G3N,G4,G5,G6,GA,'Encoder','Decoder','Multiplexer','Demultiplexer','Comparator',GF,GS,GK];
EXPS.sort((a,b)=>GROUP_ORDER.indexOf(a.group)-GROUP_ORDER.indexOf(b.group));

function expRows(e){return e.seq?e.seq.map(s=>s.in):e.rows||rowsAll(e.ins.length);}
function buildSolution(e){const st=freshState();e.solve(makeApi(st));return st;}
// Expected outputs of a sequential experiment, step by step.
function seqExpected(e){const s={};return e.seq.map(step=>{const inp=Object.fromEntries(e.ins.map(([n],k)=>[n,step.in[k]]));return e.model(s,inp,step.clk);});}
function checkExp(st,e){
  const C=compile(st),out=[];
  if(e.seq){const mem=new Map(),sw=Array(NSW).fill(0),want=seqExpected(e);
    e.seq.forEach((step,i)=>{e.ins.forEach(([n,s],k)=>{sw[+s.slice(1)]=step.in[k];});
      let R=run(C,sw,true,mem,0);for(let p=0;p<step.clk;p++){run(C,sw,true,mem,1);R=run(C,sw,true,mem,0);}
      const got=e.outs.map(([n,s])=>readOut(C,R,s)),exp=e.outs.map(([n])=>want[i][n]?1:0);
      out.push({r:step.in,clk:step.clk,step:i+1,exp,got,ok:exp.every((v,k)=>v===got[k])});});
    return out;}
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

// ================= Generated procedure text =================
// Experiments without hand-written steps get them from their reference solution, so the
// procedure always matches the guide and the checker.
const SEQFINAL='Work down the sequence table: set the switches shown for each step, press the CLOCK button (or Space) as many times as the CLK column says, and compare the LEDs. Check my circuit replays the whole sequence for you.';
function autoSteps(e){
  const s=buildSolution(e),steps=guideSteps(e),cnt={};for(const ic of s.ics)cnt[ic.type]=(cnt[ic.type]||0)+1;
  const types=Object.keys(cnt),multi=s.ics.length>1;
  const pt=ep=>(multi?chipName(ep.type)+(cnt[ep.type]>1?' #'+(ep.ord+1):'')+' ':'')+'pin '+ep.p+' ('+CHIPS[ep.type].names[ep.p-1]+')';
  const lines=[types.length===1&&cnt[types[0]]===1?placeStep(types[0]):'Add '+types.map(t=>(cnt[t]>1?cnt[t]+' × ':'a ')+chipName(t)).join(', ').replace(/, ([^,]*)$/,' and $1')+'.'];
  const pw=[],tie=[],inp=[],link=[],outp=[];
  for(const{a,b}of steps.slice(1)){
    if(b.k==='vcc'||b.k==='gnd'){const ch=CHIPS[a.type],lvl=b.k==='vcc'?'+5 V':'GND';(a.p===(b.k==='vcc'?ch.vcc:ch.gnd)?pw:tie).push(pt(a)+' → '+lvl);}
    else if(b.k==='sock')(b.id[0]==='L'?outp:inp).push(b.id[0]==='L'?pt(a)+' → '+b.id:b.id+' → '+pt(a));
    else if(a.k==='sock')inp.push(a.id+' → '+pt(b));
    else link.push(pt(a)+' → '+pt(b));}
  if(pw.length)lines.push('Power: '+pw.join(', ')+'. Tip: first wire the trainer’s +5 V terminal to the red + rail and GND to the blue − rail.');
  if(tie.length)lines.push('Tie to a fixed level: '+tie.join(', ')+'.');
  if(inp.length)lines.push('Inputs: '+inp.join(', ')+'.');
  if(link.length)lines.push('Connect: '+link.join(', ')+'.');
  if(outp.length)lines.push('Outputs: '+outp.join(', ')+'.');
  lines.push(e.seq?SEQFINAL:FINAL);
  return lines;
}
for(const e of EXPS)if(!e.steps)e.steps=autoSteps(e);
