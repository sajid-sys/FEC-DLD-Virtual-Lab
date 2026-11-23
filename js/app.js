// FEC DLD Virtual Lab — user interface: board drawing, wiring, sidebar, guide, checker.
// Developed and maintained by Shahriar Hossen Sajid.
const $=s=>document.querySelector(s);
const svgEl=$('#bench'),vpEl=$('#vp');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let st,C,R,undo=[],redo=[],sel=null,pending=null,curExp=null,checkRes=null,showExp=false,vp={x:0,y:0,k:1},probe=null,guideOn=false,sigView=false,lastDone=-1;
const LS='dldlab.v2';
function save(){try{localStorage.setItem(LS,JSON.stringify({st,exp:curExp&&curExp.id,guideOn,sigView}));}catch(e){}}
function load(){try{const d=JSON.parse(localStorage.getItem(LS));if(d&&d.st&&validState(d.st))return d;}catch(e){}return null;}
function validState(s){return s&&Array.isArray(s.ics)&&Array.isArray(s.wires)&&s.ics.every(i=>CHIPS[i.type]&&Number.isInteger(i.col))&&s.wires.every(w=>NODES.has(w.a)&&NODES.has(w.b));}
const snap=()=>JSON.stringify({ics:st.ics,wires:st.wires,nextId:st.nextId});
function mutate(fn){undo.push(snap());if(undo.length>150)undo.shift();redo=[];fn();afterChange();}
function restore(s){Object.assign(st,JSON.parse(s));sel=null;afterChange();}
function afterChange(){C=compile(st);checkRes=null;lastRes=null;refresh();save();updateUndo();}
function refresh(){R=run(C,st.sw,st.power);renderDyn();renderLive();}
function updateUndo(){$('#undoB').disabled=!undo.length;$('#redoB').disabled=!redo.length;}
function toast(m,ms=2600){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),ms);}

// ---------- gate symbols (shared by schematics and icons) ----------
function gateShape(t,x,y){
  const orP=x0=>`M${x0} ${y-20}q30 0 52 20q-22 20 -52 20q12 -20 0 -40z`;let d,extra=null,out;
  if(t==='and'||t==='nand'){d=`M${x} ${y-20}h26a20 20 0 0 1 0 40h-26z`;out=x+46;}
  else if(t==='or'||t==='nor'){d=orP(x);out=x+52;}
  else if(t==='xor'||t==='xnor'){d=orP(x+7);extra=`M${x} ${y-20}q12 20 0 40`;out=x+59;}
  else{d=`M${x} ${y-16}L${x+34} ${y}L${x} ${y+16}z`;out=x+34;}
  let bub=null;if(t==='not'||t==='nand'||t==='nor'||t==='xnor'){bub=[out+4.5,y];out+=9;}
  return{d,extra,bub,out};
}
function gateIn(g,i){if(g.t==='not')return[g.x,g.y];const off=g.t==='or'||g.t==='nor'?5:g.t==='xor'||g.t==='xnor'?11:0;return[g.x+off,g.y+(i?10:-10)];}
function expIcon(e){
  const sv=b=>`<svg class="ico" viewBox="0 0 90 54" aria-hidden="true">${b}</svg>`;
  if(['and','or','not','nand','nor','xor','xnor'].includes(e.sym)){const g=gateShape(e.sym,24,27),one=e.sym==='not',ix=e.sym==='or'||e.sym==='nor'?29:e.sym==='xor'||e.sym==='xnor'?35:24;
    return sv((one?`<path class="l" d="M6 27H24"/>`:`<path class="l" d="M6 17H${ix}M6 37H${ix}"/>`)+`<path class="l" d="M${g.out} 27H84"/><path class="s" d="${g.d}"/>`+(g.extra?`<path class="l" d="${g.extra}"/>`:'')+(g.bub?`<circle class="s" cx="${g.bub[0]}" cy="27" r="4.5"/>`:''));}
  const T={ENC:['M26 6L64 16V38L26 48Z','ENC'],DEC:['M26 16L64 6V48L26 38Z','DEC'],MUX:['M26 6L64 16V38L26 48Z','MUX'],DMX:['M26 16L64 6V48L26 38Z','DMX'],SUM:['M24 8H66V46H24Z','Σ'],CMP:['M24 8H66V46H24Z','A:B']};
  if(e.sym==='KMAP'){let s='';for(let r=0;r<2;r++)for(let c=0;c<4;c++)s+=`<rect class="s" x="${17+c*14}" y="${11+r*16}" width="14" height="16"/>`;return sv(s+`<rect x="31" y="9" width="30" height="36" rx="6" fill="none" stroke="#F59E0B" stroke-width="2.5"/>`);}
  const[d,t]=T[e.sym];const ins=e.sym==='ENC'||e.sym==='MUX'?[14,22,32,40]:[27],outs=e.sym==='DEC'||e.sym==='DMX'?[14,22,32,40]:[27];
  return sv(ins.map(y=>`<path class="l" d="M8 ${y}H26"/>`).join('')+outs.map(y=>`<path class="l" d="M64 ${y}H82"/>`).join('')+`<path class="s" d="${d}"/><text x="45" y="${t==='Σ'?33:31}" style="font-size:${t==='Σ'?20:11}px">${t}</text>`);
}

// ---------- schematic diagrams ----------
const one=(t,n)=>n===1?{W:330,H:120,ins:[['A',40,70]],gates:[['g',t,150,70]],taps:[['A','g',0]],outs:[['g','Y']]}
  :{W:330,H:130,ins:[['A',30,70],['B',50,92]],gates:[['g',t,150,80]],taps:[['A','g',0],['B','g',1]],outs:[['g','Y']]};
const SCH={
  and:one('and',2),or:one('or',2),not:one('not',1),nand:one('nand',2),nor:one('nor',2),xor:one('xor',2),
  xnor:{W:380,H:130,ins:[['A',30,70],['B',50,92]],gates:[['x','xor',130,80],['n','not',240,80]],taps:[['A','x',0],['B','x',1]],links:[['x','n',0]],outs:[['n','Y']]},
  'nand-not':{W:330,H:120,ins:[['A',40,70]],gates:[['g','nand',150,75]],taps:[['A','g',0],['A','g',1]],outs:[['g','Y']]},
  'nor-not':{W:330,H:120,ins:[['A',40,70]],gates:[['g','nor',150,75]],taps:[['A','g',0],['A','g',1]],outs:[['g','Y']]},
  'nand-and':{W:390,H:130,ins:[['A',30,70],['B',50,92]],gates:[['n1','nand',140,80],['n2','nand',260,80]],taps:[['A','n1',0],['B','n1',1]],links:[['n1','n2',0],['n1','n2',1]],outs:[['n2','Y']]},
  'nor-or':{W:390,H:130,ins:[['A',30,70],['B',50,92]],gates:[['n1','nor',140,80],['n2','nor',260,80]],taps:[['A','n1',0],['B','n1',1]],links:[['n1','n2',0],['n1','n2',1]],outs:[['n2','Y']]},
  'nand-or':{W:390,H:200,ins:[['A',30,70],['B',50,92]],gates:[['n1','nand',140,70],['n2','nand',140,150],['n3','nand',260,110]],taps:[['A','n1',0],['A','n1',1],['B','n2',0],['B','n2',1]],links:[['n1','n3',0],['n2','n3',1]],outs:[['n3','Y']]},
  'nor-and':{W:390,H:200,ins:[['A',30,70],['B',50,92]],gates:[['n1','nor',140,70],['n2','nor',140,150],['n3','nor',260,110]],taps:[['A','n1',0],['A','n1',1],['B','n2',0],['B','n2',1]],links:[['n1','n3',0],['n2','n3',1]],outs:[['n3','Y']]},
  simp:{W:420,H:190,ins:[['A',24,60],['B',44,80],['C',64,100]],gates:[['a','and',170,110],['o','or',290,140]],taps:[['A','a',0],['B','a',1],['C','o',1]],links:[['a','o',0]],outs:[['o','F']]},
  half:{W:390,H:190,ins:[['A',30,70],['B',50,95]],gates:[['x','xor',170,70],['a','and',170,140]],taps:[['A','x',0],['B','x',1],['A','a',0],['B','a',1]],outs:[['x','S'],['a','C']]},
  full:{W:500,H:260,ins:[['A',24,60],['B',44,80],['Cin',64,100]],gates:[['x1','xor',150,90],['a1','and',150,170],['x2','xor',290,110],['a2','and',240,220],['o','or',370,190]],
    taps:[['A','x1',0],['B','x1',1],['A','a1',0],['B','a1',1],['Cin','x2',1],['Cin','a2',1]],links:[['x1','x2',0],['x1','a2',0],['a1','o',0],['a2','o',1]],outs:[['x2','S'],['o','Cout']]},
  enc42:{W:380,H:230,ins:[['D3',24,60],['D2',44,80],['D1',64,100],['D0',84,120]],gates:[['o0','or',220,120],['o1','or',220,190]],taps:[['D1','o0',0],['D3','o0',1],['D2','o1',0],['D3','o1',1]],outs:[['o0','Y0'],['o1','Y1']]},
  dec24:{W:440,H:290,ins:[['A',24,60],['B',44,80]],gates:[['nA','not',110,70],['nB','not',110,110],['g0','and',260,70],['g1','and',260,130],['g2','and',260,190],['g3','and',260,250]],
    buses:[["A'",'nA',190],["B'",'nB',210]],taps:[['A','nA',0],['B','nB',0],["A'",'g0',0],["B'",'g0',1],["A'",'g1',0],['B','g1',1],['A','g2',0],["B'",'g2',1],['A','g3',0],['B','g3',1]],outs:[['g0','Y0'],['g1','Y1'],['g2','Y2'],['g3','Y3']]},
  mux21:{W:440,H:250,ins:[['Sel',24,60],['I1',44,80],['I0',64,100]],gates:[['n','not',130,150],['a0','and',240,110],['a1','and',240,200],['o','or',340,155]],
    buses:[["Sel'",'n',195]],taps:[['Sel','n',0],['I0','a0',0],["Sel'",'a0',1],['I1','a1',0],['Sel','a1',1]],links:[['a0','o',0],['a1','o',1]],outs:[['o','Y']]},
  demux12:{W:400,H:210,ins:[['D',24,60],['Sel',44,80]],gates:[['n','not',115,72],['a0','and',230,110],['a1','and',230,170]],
    buses:[["Sel'",'n',185]],taps:[['Sel','n',0],['D','a0',0],["Sel'",'a0',1],['D','a1',0],['Sel','a1',1]],outs:[['a0','Y0'],['a1','Y1']]},
  cmp1:{W:460,H:250,ins:[['A',24,60],['B',44,80]],gates:[['nA','not',105,90],['nB','not',105,170],['g','and',250,60],['l','and',250,130],['x','xor',230,210],['nx','not',320,210]],
    buses:[["A'",'nA',185],["B'",'nB',205]],taps:[['A','nA',0],['B','nB',0],['A','g',0],["B'",'g',1],["A'",'l',0],['B','l',1],['A','x',0],['B','x',1]],links:[['x','nx',0]],outs:[['g','A>B'],['l','A<B'],['nx','A=B']]},
};
const LV=v=>v===1?'#DC2626':v===0?'var(--low)':'#94A3B8';
const OPS={and:a=>a[0]&a[1],or:a=>a[0]|a[1],not:a=>1-a[0],nand:a=>1-(a[0]&a[1]),nor:a=>1-(a[0]|a[1]),xor:a=>a[0]^a[1],xnor:a=>1-(a[0]^a[1])};
function pill(x,y,label,v,sock){return`<g class="tog" data-tog="${sock}" role="button" aria-label="Toggle ${esc(label)}"><rect x="${x}" y="${y-9}" width="50" height="18" rx="9" fill="${v?'#DC2626':'#475569'}"/><text x="${x+25}" y="${y+4}" fill="#fff" font-size="11" font-weight="700" text-anchor="middle">${esc(label)}=${v}</text></g>`;}
function ledDot(x,y,v){return`<circle cx="${x}" cy="${y}" r="8" fill="${v?'#EF4444':'#4A1D1D'}" stroke="${v?'#FCA5A5':'#7F1D1D'}" stroke-width="1.5"${v?' filter="url(#sglow)"':''}/>`;}
const SDEFS='<defs><filter id="sglow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
function schSVG(e,s,inV,outV){
  const G={},val={},bus={...inV};
  for(const[id,t,x,y]of s.gates)G[id]={t,x,y,...gateShape(t,x,y)};
  for(let pass=0;pass<6;pass++){for(const[b,g]of s.buses||[])bus[b]=val[g];
    for(const id in G){const a=[];for(const[bn,g,i]of s.taps)if(g===id)a[i]=bus[bn];for(const[f,g,i]of s.links||[])if(g===id)a[i]=val[f];
      if(a[0]===undefined||(G[id].t!=='not'&&a[1]===undefined))continue;val[id]=OPS[G[id].t](a);}}
  const busX={},span={},sp=(n,y)=>{const q=span[n]||(span[n]=[y,y]);q[0]=Math.min(q[0],y);q[1]=Math.max(q[1],y);};
  for(const[n,y,bx]of s.ins){busX[n]=bx;sp(n,y);}for(const[n,g,bx]of s.buses||[]){busX[n]=bx;sp(n,G[g].y);}
  for(const[bn,g,i]of s.taps)sp(bn,gateIn(G[g],i)[1]);
  let w='',dots='';const ln=(pts,v)=>{w+=`<polyline points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${LV(v)}" stroke-width="${v===1?3:2}" stroke-linejoin="round"/>`;};
  for(const[n,y,bx]of s.ins)ln([[54,y],[bx,y]],bus[n]);
  for(const[n,g,bx]of s.buses||[])ln([[G[g].out,G[g].y],[bx,G[g].y]],bus[n]);
  for(const n in span){const[a,b]=span[n];if(b>a)ln([[busX[n],a],[busX[n],b]],bus[n]);}
  for(const[bn,g,i]of s.taps){const p=gateIn(G[g],i);ln([[busX[bn],p[1]],p],bus[bn]);dots+=`<circle cx="${busX[bn]}" cy="${p[1]}" r="3.2" fill="${LV(bus[bn])}"/>`;}
  for(const[f,g,i]of s.links||[]){const a=[G[f].out,G[f].y],b=gateIn(G[g],i),mx=Math.round((a[0]+b[0])/2);ln([a,[mx,a[1]],[mx,b[1]],b],val[f]);}
  for(const[g]of s.outs)ln([[G[g].out,G[g].y],[s.W-58,G[g].y]],val[g]);
  let gs='';for(const id in G){const g=G[id];gs+=`<path d="${g.d}" class="gbody"/>`+(g.extra?`<path d="${g.extra}" class="garc"/>`:'')+(g.bub?`<circle cx="${g.bub[0]}" cy="${g.bub[1]}" r="4.5" class="gbody"/>`:'');}
  for(const[n,g]of s.buses||[])gs+=`<text x="${busX[n]+4}" y="${G[g].y-5}" font-size="11" font-weight="700" class="gmut">${esc(n)}</text>`;
  let lb='';for(const[n,y]of s.ins)lb+=pill(2,y,n,inV[n],e.ins.find(x=>x[0]===n)[1]);
  for(const[g,n]of s.outs){const y=G[g].y;lb+=ledDot(s.W-48,y,outV[n])+`<text x="${s.W-36}" y="${y+4}" font-size="13" font-weight="700" class="gtxt">${esc(n)}</text>`;}
  return`<svg viewBox="0 0 ${s.W} ${s.H}" role="img" aria-label="Logic diagram">${SDEFS}${w}${dots}${gs}${lb}</svg>`;
}
function blockSVG(e,inV,outV){
  const ch=CHIPS[e.chips[0]],n=Math.max(e.ins.length,e.outs.length),H=n*26+30,W=430,cx0=150,cx1=290;
  const yAt=(k,cnt)=>15+(k+.5)*(H-30)/cnt;
  let s=`<rect x="${cx0}" y="8" width="${cx1-cx0}" height="${H-16}" rx="8" class="chipbody"/><text x="${(cx0+cx1)/2}" y="${H/2+5}" fill="#E5E7EB" font-size="14" font-weight="700" text-anchor="middle">${chipName(ch.num)}</text>`;
  const pinOf=nm=>{const map={D:'G2A'};const i=ch.names.indexOf(map[nm]&&e.id==='demux138'?map[nm]:nm);return i>=0?i+1:'';};
  e.ins.forEach(([nm,sk],k)=>{const y=yAt(k,e.ins.length),v=inV[nm];s+=`<polyline points="54,${y} ${cx0},${y}" fill="none" stroke="${LV(v)}" stroke-width="${v?3:2}"/><text x="${cx0-6}" y="${y-5}" font-size="10" text-anchor="end" class="gmut">${sk} · pin ${pinOf(nm)}</text><text x="${cx0+6}" y="${y+4}" font-size="11" fill="#CBD5E1">${esc(e.id==='demux138'&&nm==='D'?'G2A':nm)}</text>`+pill(2,y,nm,v,sk);});
  e.outs.forEach(([nm,sk],k)=>{const y=yAt(k,e.outs.length),v=outV[nm];s+=`<polyline points="${cx1},${y} ${W-58},${y}" fill="none" stroke="${LV(v)}" stroke-width="${v?3:2}"/><text x="${cx1+6}" y="${y-5}" font-size="10" class="gmut">pin ${pinOf(nm)} · ${sk}</text><text x="${cx1-6}" y="${y+4}" font-size="11" fill="#CBD5E1" text-anchor="end">${esc(nm)}</text>`+ledDot(W-48,y,v)+`<text x="${W-36}" y="${y+4}" font-size="12" font-weight="700" class="gtxt">${esc(nm)}</text>`;});
  return`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Block diagram">${SDEFS}${s}</svg>`;
}

// ---------- static board ----------
function sock(id){const n=NODES.get(id);return`<circle cx="${n.x}" cy="${n.y}" r="7.5" class="sock-ring"/><circle cx="${n.x}" cy="${n.y}" r="3.2" class="sock-hole"/>`;}
function buildBoard(){
  let s=`<rect x="0" y="0" width="${PW}" height="${PH}" rx="20" class="panel"/>`;
  for(const[x,y]of[[16,16],[PW-16,16],[16,PH-16],[PW-16,PH-16]])s+=`<circle cx="${x}" cy="${y}" r="7" class="screw"/><path d="M${x-4} ${y}h8" stroke="#5B6776" stroke-width="1.5"/>`;
  s+=`<rect x="22" y="26" width="180" height="160" rx="10" class="inset"/><image href="assets/logo.png" x="40" y="44" width="58" height="58"/><text x="152" y="66" class="silk big">FEC</text><text x="152" y="84" class="silk big">DLD LAB</text><text x="112" y="132" class="silk">DIGITAL LOGIC TRAINER</text><text x="112" y="150" class="silk n">TTL 74LS · 8 LEDs · 12 switches</text><text x="112" y="172" class="silk n" style="font-size:9.5px">Faridpur Engineering College</text>`;
  s+=`<rect x="262" y="26" width="636" height="160" rx="10" class="inset"/><text x="580" y="46" class="silk">OUTPUT LEDs — light up when the input is HIGH (1)</text>`;
  for(let i=0;i<NLED;i++){const x=ledX(i);s+=`<circle cx="${x}" cy="76" r="15" class="led-bez"/><circle id="led-L${i}" cx="${x}" cy="76" r="11" class="led-lens"/><text x="${x}" y="110" class="silk">L${i}</text>`+sock('L'+i);}
  s+=`<rect x="930" y="26" width="564" height="160" rx="10" class="inset"/><text x="1212" y="46" class="silk">LOGIC PROBE — point at any hole or pin</text>`;
  [['HI','HIGH','#DC2626',990],['LO','LOW','#16A34A',1065],['FLT','FLOAT','#D97706',1140]].forEach(([t,l,c,x])=>{s+=`<circle cx="${x}" cy="98" r="19" class="led-bez"/><circle id="probe-${t}" cx="${x}" cy="98" r="14" fill="#0E1E31" data-c="${c}"/><text x="${x}" y="140" class="silk">${l}</text>`;});
  s+=`<rect x="1190" y="64" width="284" height="80" rx="8" fill="#0B1A2B" stroke="#2C4F78"/><text id="probe-t1" x="1206" y="96" class="silk l" style="font-size:14px">—</text><text id="probe-t2" x="1206" y="122" class="silk l n" style="font-size:12px"></text>`;
  s+=`<rect x="22" y="226" width="180" height="390" rx="10" class="inset"/><text x="112" y="250" class="silk big">POWER SUPPLY</text>`;
  s+=`<g class="pwr" data-act="power"><rect x="72" y="266" width="80" height="34" rx="17" fill="#0E1E31" stroke="#3F5E84"/><circle id="pwr-knob" cx="135" cy="283" r="13" fill="#E5E7EB"/><rect x="60" y="262" width="104" height="42" fill="transparent"/></g><circle id="pwr-led" cx="52" cy="283" r="7" class="led-lens"/><text x="112" y="320" class="silk">ON / OFF</text>`;
  for(let k=0;k<4;k++)s+=sock('VCC'+k)+sock('GND'+k);
  s+=`<text x="112" y="390" class="silk" style="fill:#FCA5A5;font-size:13px">+5 V</text><text x="112" y="480" class="silk" style="fill:#93C5FD;font-size:13px">GND (0 V)</text>`;
  s+=`<line x1="40" y1="505" x2="184" y2="505" stroke="#2C4F78"/><text x="112" y="530" class="silk n">Start here: wire +5 V</text><text x="112" y="548" class="silk n">to the red + rail and</text><text x="112" y="566" class="silk n">GND to the blue − rail</text><path d="M178 548h16l-6-6M194 548l-6 6" stroke="#F59E0B" stroke-width="2" fill="none"/>`;
  const bx=colX(1)-26,bw=colX(COLS)-colX(1)+52;
  s+=`<rect x="${bx}" y="226" width="${bw}" height="390" rx="8" class="bb"/><rect x="${bx+6}" y="${ROWY.E+16}" width="${bw-12}" height="28" rx="3" class="bbch"/>`;
  for(const[cls,y]of[['rail-p',ROWY.TP-12],['rail-n',ROWY.TN+12],['rail-n',ROWY.BN-12],['rail-p',ROWY.BP+12]])s+=`<line x1="${colX(1)-6}" x2="${colX(COLS)+6}" y1="${y}" y2="${y}" class="${cls}"/>`;
  for(const[r,y]of[['+',ROWY.TP],['−',ROWY.TN],['−',ROWY.BN],['+',ROWY.BP]]){const c=r==='+'?'#DC2626':'#2563EB';s+=`<text x="${bx+12}" y="${y+5}" style="fill:${c};font:700 15px var(--ui);text-anchor:middle">${r}</text><text x="${bx+bw-12}" y="${y+5}" style="fill:${c};font:700 15px var(--ui);text-anchor:middle">${r}</text>`;}
  let holes='';for(const n of NODES.values())if(n.kind!=='sock')holes+=`M${n.x-4} ${n.y-4}h8v8h-8z`;
  s+=`<path d="${holes}" class="hole"/>`;
  for(const r of[...TOPR,...BOTR])s+=`<text x="${bx+12}" y="${ROWY[r]+3}" class="bbtxt">${r}</text><text x="${bx+bw-12}" y="${ROWY[r]+3}" class="bbtxt">${r}</text>`;
  for(let c=1;c<=COLS;c++)if(c===1||c%5===0)s+=`<text x="${colX(c)}" y="${ROWY.A-11}" class="bbtxt">${c}</text><text x="${colX(c)}" y="${ROWY.J+17}" class="bbtxt">${c}</text>`;
  s+=`<rect x="262" y="636" width="906" height="176" rx="10" class="inset"/><text x="715" y="802" class="silk">INPUT SWITCHES — click to flip (up = 1)</text>`;
  for(let i=0;i<NSW;i++){const x=swX(i);s+=sock('S'+i)+`<g data-act="sw" data-i="${i}"><rect x="${x-13}" y="686" width="26" height="62" rx="6" class="sw-slot"/><rect id="swl-${i}" x="${x-10}" y="718" width="20" height="27" rx="4" class="sw-lever"/><rect x="${x-30}" y="678" width="60" height="78" class="sw-hit"/></g><text x="${x}" y="768" class="silk">S${i}</text><text id="swt-${i}" x="${x}" y="785" class="silk" style="fill:#F59E0B;font-size:13px">0</text>`;}
  s+=`<rect x="1200" y="636" width="294" height="176" rx="10" class="inset"/><text x="1347" y="662" class="silk big">WIRE COLOURS</text>`;
  [['#DC2626','+5 V (power)'],['#111827','GND (ground)'],['#2563EB','Signals — any other colour']].forEach(([c,t],k)=>{const y=698+k*32;s+=`<path d="M1222 ${y}q20 -14 40 0" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round"/><text x="1276" y="${y+4}" class="silk l n" style="font-size:13px">${t}</text>`;});
  $('#board').innerHTML=s;
}

// ---------- dynamic ----------
function wirePath(a,b){const p=NODES.get(a),q=NODES.get(b);return curve(p.x,p.y,q.x,q.y);}
function curve(x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy)||1,off=Math.min(70,8+L*.16);let nx=-dy/L,ny=dx/L;if(ny>0||(ny===0&&nx>0)){nx=-nx;ny=-ny;}
  return`M${x1} ${y1}Q${(x1+x2)/2+nx*off} ${(y1+y2)/2+ny*off} ${x2} ${y2}`;}
function icStatusOf(id){const k=C.ics.findIndex(x=>x.ic.id===id);return k<0?'off':R.status[k];}
const LVC={1:'#EF4444',0:'#22C55E',2:'#F59E0B',3:'#A855F7'};
function renderDyn(){
  let s='';
  for(const ic of st.ics){const ch=CHIPS[ic.type],h=ch.pins/2,x0=colX(ic.col)-13,x1=colX(ic.col+h-1)+13,y0=ROWY.E+7,y1=ROWY.F-7,stt=icStatusOf(ic.id),cx=(x0+x1)/2;
    let legs='',nums='';for(let p=1;p<=ch.pins;p++){const n=NODES.get(pinNode(ic,p));
      legs+=p<=h?`<rect x="${n.x-3.5}" y="${y1-2}" width="7" height="${n.y-y1+5}" rx="1" class="ic-leg"/>`:`<rect x="${n.x-3.5}" y="${n.y-3}" width="7" height="${y0-n.y+5}" rx="1" class="ic-leg"/>`;
      nums+=`<text x="${n.x}" y="${p<=h?y1-3:y0+9}" class="ic-pn">${p}</text>`;}
    const dot=stt==='ok'?'#22C55E':stt==='rev'?'#EF4444':'#6B7280';
    s+=`<g class="ic-g${sel&&sel.kind==='ic'&&sel.id===ic.id?' ic-sel':''}" data-act="ic" data-id="${ic.id}">${legs}<rect x="${x0}" y="${y0}" width="${x1-x0}" height="${y1-y0}" rx="3" class="ic-body"/><path d="M${x0} ${(y0+y1)/2-7}a7 7 0 0 1 0 14z" fill="#3A3A40"/>${nums}
      <text x="${cx}" y="${(y0+y1)/2+4}" class="ic-txt">${chipName(ch.num)}</text><text x="${x0+11}" y="${(y0+y1)/2+4}" class="ic-ref">${ic.ref}</text><circle cx="${x1-7}" cy="${(y0+y1)/2}" r="3" fill="${dot}"/>
      ${stt==='rev'?`<circle cx="${cx}" cy="${y0-8}" r="14" fill="#9CA3AF" opacity=".6" filter="url(#smoke)"/>`:''}</g>`;}
  $('#icL').innerHTML=s;
  s='';
  for(const w of st.wires){const d=wirePath(w.a,w.b),p=NODES.get(w.a),q=NODES.get(w.b),issel=sel&&sel.kind==='wire'&&sel.id===w.id;
    const lv=st.power?R.val[C.net(w.a)]:2,col=sigView?LVC[lv]:w.color,cls=sigView?(lv===1?' flow':lv===2?' fz':''):'';
    s+=`<g data-act="wire" data-id="${w.id}">${issel?`<path d="${d}" class="wire-sel"/>`:''}<path d="${d}" class="wire-sh"/><path d="${d}" class="wire${cls}" stroke="${col}"/><circle cx="${p.x}" cy="${p.y}" r="4" fill="${col}" class="wire-end"/><circle cx="${q.x}" cy="${q.y}" r="4" fill="${col}" class="wire-end"/><path d="${d}" class="wire-hit"/></g>`;}
  $('#wireL').innerHTML=s;
  for(let i=0;i<NLED;i++)$('#led-L'+i).classList.toggle('on',R.read('L'+i)===1);
  for(let i=0;i<NSW;i++){$('#swl-'+i).setAttribute('y',st.sw[i]?692:718);$('#swt-'+i).textContent=st.sw[i];}
  $('#pwr-led').classList.toggle('on',st.power);$('#pwr-knob').setAttribute('cx',st.power?135:89);
  $('#tPwr').setAttribute('aria-pressed',st.power);$('#tSig').setAttribute('aria-pressed',sigView);$('#tGuide').setAttribute('aria-pressed',guideOn&&!!curExp);
  renderTags();renderWarn();renderSelCard();renderProbe();renderCoach();renderRotHint();
}
function renderTags(){let s='';if(curExp){const tag=(sk,t,dy)=>{const n=NODES.get(sk),w=Math.max(24,t.length*7+12);s+=`<g class="tag"><rect x="${n.x-w/2}" y="${n.y+dy}" width="${w}" height="17" rx="4"/><text x="${n.x}" y="${n.y+dy+12.5}">${esc(t)}</text></g>`;};
  curExp.ins.forEach(([nm,sk])=>tag(sk,nm,-40));curExp.outs.forEach(([nm,sk])=>tag(sk,nm,15));}
  $('#tagL').innerHTML=s;}
const ICON_W='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18v.5"/></svg>';
function renderWarn(){
  const m=[];
  if(!st.power)m.push(['err','The trainer is switched OFF. Press the Power button to turn it on.']);
  const shorts=[];for(let n=0;n<C.N;n++)if(R.val[n]===3)shorts.push(n);
  if(shorts.includes(C.vcc))m.push(['err','Power short: +5 V is connected straight to GND or to a LOW output. On a real board this blows the fuse or burns a chip.']);
  for(const n of shorts){if(n===C.vcc)continue;m.push(['err',`Short circuit: two outputs are connected together (${C.members[n].slice(0,3).join(', ')}). Never join two outputs.`]);if(m.length>4)break;}
  C.ics.forEach((x,k)=>{const s=R.status[k];if(s==='rev')m.push(['err',`${x.ic.ref} (${chipName(x.ch.num)}) has its power reversed! A real chip would be destroyed. Pin ${x.ch.vcc} must go to +5 V and pin ${x.ch.gnd} to GND.`]);
    else if(s==='off'&&st.power)m.push(['',`${x.ic.ref} (${chipName(x.ch.num)}) has no power yet: pin ${x.ch.vcc} → +5 V, pin ${x.ch.gnd} → GND.`]);});
  if(R.osc)m.push(['err','The circuit is oscillating — an output feeds back into its own input. Check for loops.']);
  $('#warn').innerHTML=(guideOn&&curExp?m.filter(x=>x[0]==='err'):m).slice(0,3).map(([c,t])=>`<div class="wmsg ${c}">${ICON_W}<span>${esc(t)}</span></div>`).join('');
}
function renderSelCard(){const el=$('#selCard');if(!sel){el.style.display='none';return;}let d='';
  if(sel.kind==='ic'){const ic=st.ics.find(i=>i.id===sel.id);if(!ic){sel=null;el.style.display='none';return;}const ch=CHIPS[ic.type],s=icStatusOf(ic.id);
    d=`<div class="d"><b>${ic.ref} · ${chipName(ch.num)}</b> — ${esc(ch.kind)}<br><span style="color:${s==='ok'?'var(--ok)':'var(--danger)'}">${s==='ok'?'Powered':s==='rev'?'Power reversed':'Not powered'}</span> · drag to move</div><button class="btn sm" data-pin="${ch.num}">Pinout</button>`;}
  else{const w=st.wires.find(x=>x.id===sel.id);if(!w){sel=null;el.style.display='none';return;}d=`<div class="d"><b>Wire</b> ${esc(w.a)} → ${esc(w.b)}</div>`+['#DC2626','#1F2937','#2563EB','#16A34A','#EAB308','#EA580C','#7C3AED','#F8FAFC'].map(c=>`<button aria-label="Colour ${c}" data-col="${c}" style="width:24px;height:24px;border-radius:50%;border:2px solid var(--line);background:${c}"></button>`).join('');}
  el.innerHTML=d+`<button class="btn sm" id="delSel" style="color:var(--danger)">Delete</button>`;el.style.display='flex';}
const VTXT={0:['LOW','v0'],1:['HIGH','v1'],2:['FLOATING','vz'],3:['CONFLICT','vx']};
function renderProbe(){const v=probe&&st.power?R.read(probe):null;
  for(const[t,want]of[['HI',1],['LO',0],['FLT',2]]){const e=$('#probe-'+t),on=v===want||(t==='HI'&&v===3);e.setAttribute('fill',on?e.dataset.c:'#0E1E31');e.setAttribute('filter',on?'url(#glow)':'');}
  const pi=probe&&pinInfo(probe);$('#probe-t1').textContent=probe?(pi?`${pi.ic.ref} pin ${pi.p} (${pi.name})`:NODES.get(probe).label.replace('Hole on the ','')).slice(0,34):'—';
  $('#probe-t2').textContent=probe?(v==null?'Power is off':VTXT[v][0]+(v===2?' — nothing is driving it':'')):'Point at any hole or pin';}

// ---------- guided build ----------
let gCache={};
function gSteps(){return gCache[curExp.id]||(gCache[curExp.id]=guideSteps(curExp));}
function epText(ep){if(ep.k==='vcc')return'+5 V';if(ep.k==='gnd')return'GND';
  if(ep.k==='sock')return ep.id[0]==='S'?'switch '+ep.id:'LED '+ep.id;
  const ic=studentIC(st,ep.type,ep.ord);return`${ic?ic.ref:chipName(ep.type)} pin ${ep.p} (${CHIPS[ep.type].names[ep.p-1]})`;}
const railPow=r=>C.net(r+'1')===(r[1]==='P'?C.vcc:C.gnd);
function epGeom(ep,near){
  if(ep.k==='sock'){const n=NODES.get(ep.id);return{svg:`<circle cx="${n.x}" cy="${n.y}" r="14" class="gpulse"/>`,pt:[n.x,n.y]};}
  if(ep.k==='pin'){const ic=studentIC(st,ep.type,ep.ord),pn=pinNode(ic,ep.p),n=NODES.get(pn),top=pn[0]==='E',occ=occupied(st);
    const y0=top?ROWY.A:ROWY.F,y1=top?ROWY.E:ROWY.J,free=stripHoles(pn).find(h=>!occ.has(h))||pn,f=NODES.get(free),by=top?y0-30:y1+12;
    return{svg:`<rect x="${n.x-11}" y="${y0-11}" width="22" height="${y1-y0+22}" rx="6" class="gfill"/><g class="gbub"><rect x="${n.x-24}" y="${by}" width="48" height="18" rx="5"/><text x="${n.x}" y="${by+13}">pin ${ep.p}</text></g>`,pt:[f.x,f.y],top,col:+pn.slice(1)};}
  const pos=ep.k==='vcc',socks=[0,1,2,3].map(k=>NODES.get((pos?'VCC':'GND')+k));
  let svg=socks.map(n=>`<circle cx="${n.x}" cy="${n.y}" r="13" class="gpulse"/>`).join(''),pt=[socks[0].x,socks[0].y];
  const rail=near&&near.top!==undefined?(pos?(near.top?'TP':'BP'):(near.top?'TN':'BN')):null;
  if(rail&&railPow(rail)){const y=ROWY[rail];svg+=`<rect x="${colX(1)-10}" y="${y-10}" width="${colX(COLS)-colX(1)+20}" height="20" rx="6" class="gfill"/>`;
    const occ=occupied(st);for(let k=0;k<COLS;k++){let done=false;for(const c of[near.col+k,near.col-k])if(c>=1&&c<=COLS&&railHas(c)&&!occ.has(rail+c)){const h=NODES.get(rail+c);pt=[h.x,h.y];done=true;break;}if(done)break;}}
  return{svg,pt};
}
function renderCoach(){
  const el=$('#coach'),L=$('#guideL');
  if(!guideOn||!curExp){el.style.display='none';L.innerHTML='';return;}
  const steps=gSteps(),done=guideStatus(st,C,steps),idx=done.indexOf(false),n=steps.length,cnt=done.filter(Boolean).length;
  if(lastDone>=0&&cnt>lastDone&&idx>=0)toast('Done! The next connection is glowing on the board.',1800);lastDone=cnt;
  let g='',msg,hint='',btns='';
  if(idx<0){msg='Every connection is in place!';hint='Now flip the input switches to test each row, then press Check my circuit.';btns=`<button class="btn sm amb" data-g="check">Check my circuit</button>`;}
  else{const s=steps[idx];
    if(s.k==='place'){const miss=Object.entries(s.need).filter(([t,k])=>st.ics.filter(x=>x.type===t).length<k).map(([t])=>t);
      msg=`Place the ${miss.map(chipName).join(' and ')} on the breadboard`;hint='ICs sit across the glowing centre gap. Press the button and the chip drops in; drag it sideways to move it.';
      btns=miss.map(t=>`<button class="btn sm amb" data-g="add" data-t="${t}">Add ${chipName(t)}</button>`).join('');
      g=`<rect x="${colX(1)-10}" y="${ROWY.E+12}" width="${colX(COLS)-colX(1)+20}" height="36" rx="8" class="gfill"/>`;}
    else{const A=epGeom(s.a,null),B=epGeom(s.b,A);g=A.svg+B.svg+`<path d="${curve(A.pt[0],A.pt[1],B.pt[0],B.pt[1])}" class="gline"/>`;
      msg=`Connect ${epText(s.a)} → ${epText(s.b)}`;
      const pr=s.b.k==='vcc'||s.b.k==='gnd',rail=pr&&A.top!==undefined?(s.b.k==='vcc'?(A.top?'TP':'BP'):(A.top?'TN':'BN')):null;
      hint=rail&&!railPow(rail)?`First wire the ${s.b.k==='vcc'?'+5 V terminal to the red + rail':'GND terminal to the blue − rail'} on the ${A.top?'top':'bottom'} edge of the breadboard, then connect the glowing strip to that rail.`
        :s.a.k==='pin'||s.b.k==='pin'?'Click any free hole in the glowing strip (all 5 holes are joined), then click the other glowing spot.':'Click one glowing spot, then the other.';}}
  el.innerHTML=`<div class="k">Guided build · ${cnt} of ${n} steps done</div><div class="prog"><i style="width:${cnt/n*100}%"></i></div><div class="m">${esc(msg)}</div><div class="h">${esc(hint)}</div><div class="row">${btns}<button class="btn sm" data-g="off">Hide guide</button></div>`;
  el.style.display='block';L.innerHTML=g;
}
$('#coach').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.g==='add')addIC(b.dataset.t,true);else if(b.dataset.g==='off'){guideOn=false;renderDyn();renderSheetGuideBtn();save();}
  else if(b.dataset.g==='check'){$('#side').classList.add('open');doCheck();}});
function setGuide(on){if(on&&!curExp){toast('Pick an experiment first — the guide shows its connections on the board.');selectTab('exp');$('#side').classList.add('open');return;}
  guideOn=on;lastDone=-1;renderDyn();renderSheetGuideBtn();save();if(on){closeSheetMobile();requestAnimationFrame(fitIfCoachCovers);}}
function fitIfCoachCovers(){const c=$('#coach');if(c.style.display==='none')return;const a=c.getBoundingClientRect(),b=$('#board').getBoundingClientRect();
  if(a.bottom>b.top&&a.top<b.bottom&&a.right>b.left&&a.left<b.right){const r=svgEl.getBoundingClientRect();if(guidePadT(r,(r.width-(innerWidth>900?84:70)-10)/PW)>10)fit();}}
// Portrait phones: suggest landscape (the board is wide). Dismissal is remembered.
let rotOff=false;try{rotOff=localStorage.getItem('dldlab.rotHint')==='off';}catch(e){}
const portraitMQ=matchMedia('(orientation: portrait) and (max-width: 700px)');
function renderRotHint(){$('#rotHint').style.display=!rotOff&&!(guideOn&&curExp)&&portraitMQ.matches?'flex':'none';}
portraitMQ.addEventListener('change',renderRotHint);
$('#rotX').onclick=()=>{rotOff=true;try{localStorage.setItem('dldlab.rotHint','off');}catch(e){}renderRotHint();};

// ---------- coordinates & hit ----------
function applyVP(){vpEl.setAttribute('transform',`translate(${vp.x} ${vp.y}) scale(${vp.k})`);}
// With the guide open, place the board below the coach panel so the glowing targets are never hidden,
// as long as that costs at most 30% of the board's size; otherwise use the normal fit.
function guidePadT(r,kw){if(!(guideOn&&curExp))return 10;const want=$('#coach').offsetHeight+22,kFull=Math.min(kw,(r.height-20)/PH),kClear=Math.min(kw,(r.height-want-10)/PH);
  return kClear>=kFull*.7?want:10;}
function fit(){const r=svgEl.getBoundingClientRect(),padL=innerWidth>900?84:70,kw=(r.width-padL-10)/PW,padT=guidePadT(r,kw);
  const k=Math.min(kw,(r.height-padT-10)/PH);vp.k=k;vp.x=padL+(r.width-padL-PW*k)/2;vp.y=Math.max(padT,(r.height-PH*k)/2);applyVP();}
function zoomAt(f,cx,cy){const k=Math.max(.25,Math.min(4,vp.k*f));vp.x=cx-(cx-vp.x)*k/vp.k;vp.y=cy-(cy-vp.y)*k/vp.k;vp.k=k;applyVP();}
function local(e){const r=svgEl.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function world(e){const l=local(e);return{x:(l.x-vp.x)/vp.k,y:(l.y-vp.y)/vp.k};}
function nearNode(pt,rad=10){let best=null,bd=rad*rad;for(const n of NODES.values()){const d=(n.x-pt.x)**2+(n.y-pt.y)**2;if(d<bd){bd=d;best=n.id;}}return best;}
function pinInfo(id){for(const ic of st.ics){const k=pinsOf(ic).indexOf(id);if(k>=0){const ch=CHIPS[ic.type];return{ic,ch,p:k+1,name:ch.names[k],role:ch.role[k]};}}return null;}
function hover(e){
  const pt=world(e),id=nearNode(pt,11),tip=$('#tip');let hl='';
  if(id){const n=NODES.get(id),strip=[...NODES.values()].filter(m=>m.strip===n.strip);
    if(n.kind==='hole'){const ys=strip.map(m=>m.y);hl+=`<rect x="${n.x-9}" y="${Math.min(...ys)-9}" width="18" height="${Math.max(...ys)-Math.min(...ys)+18}" rx="5" class="hl-strip"/>`;}
    else if(n.kind==='rail'){const xs=strip.map(m=>m.x);hl+=`<rect x="${Math.min(...xs)-9}" y="${n.y-9}" width="${Math.max(...xs)-Math.min(...xs)+18}" height="18" rx="5" class="hl-strip"/>`;}
    else hl+=`<circle cx="${n.x}" cy="${n.y}" r="11" class="hl-strip"/>`;
    for(const m of C.members[C.net(id)]){const q=NODES.get(m);if(q.strip!==n.strip)hl+=`<circle cx="${q.x}" cy="${q.y}" r="7" class="hl-net"/>`;}
    const v=st.power?R.read(id):2,[vt,vc]=VTXT[v],pi=pinInfo(id);
    let h=pi?`<b>${pi.ic.ref} ${chipName(pi.ch.num)} · pin ${pi.p}</b><br>${esc(pi.name)} (${{in:'input',out:'output',vcc:'power +5 V',gnd:'ground',nc:'not connected'}[pi.role]})`:`<b>${esc(n.label)}</b>`;
    if(n.kind==='hole')h+=`<br><span style="opacity:.8">Column ${n.strip.slice(1)}: holes ${n.strip[0]==='U'?'A–E':'F–J'} are joined</span>`;
    h+=`<br>Level <span class="v ${vc}">${vt}</span>`;
    if(v===2&&pi&&pi.role==='in')h+='<br><span style="opacity:.8">A floating TTL input reads as HIGH</span>';
    tip.innerHTML=h;const l=local(e),r=svgEl.getBoundingClientRect();tip.style.display='block';
    tip.style.left=Math.min(l.x+16,r.width-tip.offsetWidth-8)+'px';tip.style.top=Math.max(8,l.y-tip.offsetHeight-12)+'px';probe=id;}
  else tip.style.display='none';
  $('#hlL').innerHTML=hl;renderProbe();
}

// ---------- interactions ----------
const pointers=new Map();let drag=null,pinch=null,colI=0;
const WC=['#2563EB','#16A34A','#EAB308','#EA580C','#7C3AED','#0EA5E9','#DB2777'];
function canUse(id){return NODES.get(id).kind==='sock'||!occupied(st).has(id);}
function cancelPending(){pending=null;$('#pendL').innerHTML='';}
function finishPending(id){
  const a=pending.a;if(id===a)return;
  if(!canUse(id)){toast('That hole is already used. Any free hole in the same column strip works — they are all joined.');return;}
  if(NODES.get(a).strip===NODES.get(id).strip)toast('Both ends are in the same strip — that wire does nothing.');
  pending=null;$('#pendL').innerHTML='';
  mutate(()=>st.wires.push({id:st.nextId++,a,b:id,color:autoColor(a,id)||WC[colI++%WC.length]}));
}
svgEl.addEventListener('pointerdown',e=>{
  svgEl.setPointerCapture(e.pointerId);pointers.set(e.pointerId,local(e));
  if(pointers.size===2){const[p,q]=[...pointers.values()];pinch={d:Math.hypot(p.x-q.x,p.y-q.y)};drag=null;cancelPending();return;}
  if(e.button===1||e.button===2){drag={type:'pan',sx:e.clientX,sy:e.clientY,vx:vp.x,vy:vp.y};return;}
  const pt=world(e),t=e.target.closest('[data-act]'),act=t&&t.dataset.act;
  if(pending){const n=nearNode(pt,12);if(n&&n!==pending.a)finishPending(n);else if(!n)cancelPending();return;}
  if(act==='sw'){toggleSw(+t.dataset.i);return;}
  if(act==='power'){setPower(!st.power);return;}
  const near=nearNode(pt,7);
  if(!(near&&act==='wire'&&canUse(near))){
    if(act==='ic'){const id=+t.dataset.id,ic=st.ics.find(i=>i.id===id);sel={kind:'ic',id};drag={type:'ic',id,col0:ic.col,dx:pt.x-colX(ic.col),snap:snap()};renderDyn();return;}
    if(act==='wire'){sel={kind:'wire',id:+t.dataset.id};renderDyn();return;}
  }
  const n=nearNode(pt,10);
  if(n){if(!canUse(n)){const o=occupied(st).get(n);toast(o.kind==='ic'?'That hole holds an IC pin. Plug the wire into another hole of the same column.':'That hole is already used. Pick another hole in the same column.');return;}
    pending={a:n,downAt:local(e),moved:false};sel=null;renderDyn();return;}
  sel=null;renderDyn();drag={type:'pan',sx:e.clientX,sy:e.clientY,vx:vp.x,vy:vp.y};
});
svgEl.addEventListener('pointermove',e=>{
  if(pointers.has(e.pointerId))pointers.set(e.pointerId,local(e));
  if(pinch&&pointers.size===2){const[p,q]=[...pointers.values()],d=Math.hypot(p.x-q.x,p.y-q.y);zoomAt(d/pinch.d,(p.x+q.x)/2,(p.y+q.y)/2);pinch.d=d;return;}
  if(drag&&drag.type==='pan'){vp.x=drag.vx+e.clientX-drag.sx;vp.y=drag.vy+e.clientY-drag.sy;applyVP();return;}
  if(drag&&drag.type==='ic'){const pt=world(e),ic=st.ics.find(i=>i.id===drag.id),col=Math.round((pt.x-drag.dx-BBX)/P)+1;
    if(col!==ic.col&&icFits(st,ic.type,col,ic.id)){ic.col=col;C=compile(st);refresh();}return;}
  if(pending){const a=NODES.get(pending.a),pt=world(e),n=nearNode(pt,12),b=n?NODES.get(n):pt;
    if(pending.downAt){const l=local(e);if(Math.hypot(l.x-pending.downAt.x,l.y-pending.downAt.y)>6)pending.moved=true;}
    $('#pendL').innerHTML=`<path d="${curve(a.x,a.y,b.x,b.y)}" class="pend"/>`;}
  hover(e);
});
function endPointer(e){
  pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;
  if(drag&&drag.type==='ic'){const ic=st.ics.find(i=>i.id===drag.id);if(ic&&ic.col!==drag.col0){undo.push(drag.snap);redo=[];afterChange();}}
  if(pending&&pending.moved){const n=nearNode(world(e),12);if(n&&n!==pending.a)finishPending(n);else cancelPending();}
  else if(pending)pending.downAt=null;
  drag=null;
}
svgEl.addEventListener('pointerup',endPointer);svgEl.addEventListener('pointercancel',endPointer);
svgEl.addEventListener('pointerleave',()=>{$('#tip').style.display='none';$('#hlL').innerHTML='';});
svgEl.addEventListener('contextmenu',e=>e.preventDefault());
svgEl.addEventListener('wheel',e=>{e.preventDefault();const l=local(e);zoomAt(Math.exp(-e.deltaY*(e.ctrlKey?.01:.0015)),l.x,l.y);},{passive:false});
function toggleSw(i){st.sw[i]^=1;refresh();save();}
function setPower(on){st.power=on;refresh();save();}
function delSel(){if(!sel)return;const s=sel;sel=null;mutate(()=>{if(s.kind==='ic')st.ics=st.ics.filter(i=>i.id!==s.id);else st.wires=st.wires.filter(i=>i.id!==s.id);});}
$('#selCard').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='delSel')delSel();else if(b.dataset.pin)showPinout(b.dataset.pin);else if(b.dataset.col){const w=st.wires.find(x=>x.id===sel.id);mutate(()=>{w.color=b.dataset.col;});}});
document.addEventListener('keydown',e=>{
  if($('#modal').classList.contains('show')){if(e.key==='Escape')closeModal();return;}
  if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))return;
  if(e.key==='Escape'){cancelPending();sel=null;renderDyn();}
  else if((e.key==='Delete'||e.key==='Backspace')&&sel){e.preventDefault();delSel();}
  else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?doRedo():doUndo();}
  else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();doRedo();}
  else if(/^[0-9]$/.test(e.key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey)toggleSw(+e.key);
});
function doUndo(){if(!undo.length)return;redo.push(snap());restore(undo.pop());}
function doRedo(){if(!redo.length)return;undo.push(snap());restore(redo.pop());}
$('#undoB').onclick=doUndo;$('#redoB').onclick=doRedo;$('#fitB').onclick=fit;
$('#ziB').onclick=()=>{const r=svgEl.getBoundingClientRect();zoomAt(1.25,r.width/2,r.height/2);};
$('#zoB').onclick=()=>{const r=svgEl.getBoundingClientRect();zoomAt(.8,r.width/2,r.height/2);};
$('#themeB').onclick=()=>{const d=document.documentElement,dark=d.dataset.theme!=='dark';d.dataset.theme=dark?'dark':'';try{localStorage.setItem('dldlab.theme',dark?'dark':'');}catch(e){}};
$('#sheetBtn').onclick=()=>$('#side').classList.toggle('open');
$('#helpB').onclick=welcome;
$('#tGuide').onclick=()=>setGuide(!(guideOn&&curExp));
$('#tSig').onclick=()=>{sigView=!sigView;renderDyn();save();if(sigView)toast('Signal view: red = HIGH, green = LOW, dashed amber = floating (not connected).',3600);};
$('#tPwr').onclick=()=>setPower(!st.power);

function addIC(type,quiet){
  let col=null;for(let c=4;c<=COLS;c++)if(icFits(st,type,c)){col=c;break;}
  if(col===null){toast('No free space across the centre gap. Delete or move an IC first.');return;}
  let id;mutate(()=>{id=st.nextId++;st.ics.push({id,ref:nextRef(st),type,col});});sel={kind:'ic',id};renderDyn();
  if(!quiet)toast(`${chipName(type)} placed. Drag it sideways to move it. It needs power on pins ${CHIPS[type].vcc} (+5 V) and ${CHIPS[type].gnd} (GND).`,3600);closeSheetMobile();
}
function closeSheetMobile(){$('#side').classList.remove('open');}

// ---------- modal ----------
function openModal(h){$('#dlg').innerHTML=h;$('#modal').classList.add('show');const f=$('#dlg').querySelector('.pri,button,textarea');f&&f.focus();}
function closeModal(){$('#modal').classList.remove('show');}
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal'||e.target.closest('[data-close]'))closeModal();});
function confirmBox(title,text,okLabel,fn){openModal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="actions"><button class="btn" data-close>Cancel</button><button class="btn pri" id="okB">${esc(okLabel)}</button></div>`);$('#okB').onclick=()=>{closeModal();fn();};}
function pinoutSVG(num){const ch=CHIPS[num],h=ch.pins/2,ph=26,H=h*ph+24,W=360,bx=130,bw=100;
  const col=r=>({in:'#2563EB',out:'#15803D',vcc:'#DC2626',gnd:'var(--ink)',nc:'#94A3B8'}[r]);
  let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:400px;display:block;margin:auto" role="img" aria-label="Pinout of ${chipName(num)}"><rect x="${bx}" y="8" width="${bw}" height="${H-16}" rx="6" fill="#1C1C1F"/><path d="M${bx+bw/2-10} 8a10 10 0 0 0 20 0z" fill="#3A3A40"/><text x="${bx+bw/2}" y="${H/2}" fill="#E5E7EB" font-size="13" font-weight="700" text-anchor="middle" transform="rotate(-90 ${bx+bw/2} ${H/2})">${chipName(num)}</text>`;
  for(let i=0;i<h;i++){const y=20+i*ph+ph/2-4;for(const[p,left]of[[i+1,true],[ch.pins-i,false]]){const r=ch.role[p-1],x=left?bx:bx+bw;
    s+=`<rect x="${left?x-14:x}" y="${y-5}" width="14" height="10" fill="#C7CCD3"/><text x="${left?x+12:x-12}" y="${y+4}" font-size="11" fill="#E5E7EB" text-anchor="${left?'start':'end'}">${p}</text><text x="${left?x-20:x+20}" y="${y+4}" font-size="13" font-weight="700" fill="${col(r)}" text-anchor="${left?'end':'start'}">${esc(ch.names[p-1])}</text>`;}}
  return s+'</svg>';}
function showPinout(num){const ch=CHIPS[num];openModal(`<h2>${chipName(num)}</h2><p class="muted">${esc(ch.kind)} · ${ch.pins}-pin chip seen from above (notch at the top). On the breadboard the notch points left, so pin 1 is bottom-left.</p>${pinoutSVG(num)}<p class="small"><b style="color:#2563EB">Blue</b> inputs · <b style="color:#15803D">green</b> outputs · <b style="color:#DC2626">red</b> +5 V · <b>black</b> GND</p>${ch.note?`<p>${esc(ch.note)}</p>`:''}<div class="actions"><button class="btn" data-close>Close</button><button class="btn pri" id="addFromPin">Add to breadboard</button></div>`);
  $('#addFromPin').onclick=()=>{closeModal();addIC(num);};}
function welcome(){
  const ill1=`<svg viewBox="0 0 120 80"><rect x="12" y="10" width="44" height="28" rx="6" fill="#fff" stroke="#1E3A5F" stroke-width="2"/><rect x="64" y="10" width="44" height="28" rx="6" fill="#fff" stroke="#1E3A5F" stroke-width="2"/><rect x="12" y="44" width="44" height="28" rx="6" fill="#fff" stroke="#15803D" stroke-width="2.5"/><rect x="64" y="44" width="44" height="28" rx="6" fill="#fff" stroke="#1E3A5F" stroke-width="2"/><path d="M20 24h10a7 7 0 0 1 0 0" stroke="#1E3A5F" stroke-width="2"/><path d="M22 18h8a6 6 0 0 1 0 12h-8z" fill="#E9EEF5" stroke="#1E3A5F" stroke-width="1.6"/><path d="M73 18q10 0 16 6q-6 6 -16 6q4 -6 0 -12z" fill="#E9EEF5" stroke="#1E3A5F" stroke-width="1.6"/><circle cx="48" cy="52" r="5" fill="#15803D"/></svg>`;
  const ill2=`<svg viewBox="0 0 120 80"><rect x="8" y="14" width="104" height="54" rx="5" fill="#F1EFE9" stroke="#D2CCC0"/><rect x="36" y="34" width="44" height="14" rx="2" fill="#1C1C1F"/>${[0,1,2,3,4,5,6,7,8,9].map(i=>`<rect x="${14+i*10}" y="20" width="4" height="4" fill="#2F2F31"/><rect x="${14+i*10}" y="58" width="4" height="4" fill="#2F2F31"/>`).join('')}<rect x="80" y="16" width="12" height="50" rx="4" fill="rgba(245,158,11,.3)" stroke="#F59E0B" stroke-width="2"/><path d="M86 22Q70 2 30 8" stroke="#F59E0B" stroke-width="3" stroke-dasharray="5 4" fill="none"/></svg>`;
  const ill3=`<svg viewBox="0 0 120 80"><rect x="14" y="10" width="92" height="58" rx="6" fill="#fff" stroke="#CBD5E1"/>${[0,1,2,3].map(i=>`<line x1="14" x2="106" y1="${24+i*11}" y2="${24+i*11}" stroke="#E2E8F0"/>`).join('')}<circle cx="86" cy="30" r="4" fill="#EF4444"/><circle cx="86" cy="52" r="4" fill="#EF4444"/><circle cx="60" cy="44" r="20" fill="#15803D"/><path d="M50 44l7 7 13-14" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  openModal(`<div style="display:flex;align-items:center;gap:14px"><img src="assets/logo.png" width="64" height="64" alt="Faridpur Engineering College logo"><div><h2 style="margin:0">Welcome to FEC DLD Virtual Lab</h2><p class="muted" style="margin:2px 0 0">Faridpur Engineering College · Digital Logic Design lab</p></div></div><p class="muted">A trainer board, breadboard and 74LS chips — wire them up just as you would in the real lab.</p>
  <div class="welcome"><div>${ill1}<b>1 · Pick an experiment</b>Gates, adders, encoders, decoders, MUX, DEMUX and comparators.</div><div>${ill2}<b>2 · Follow the glow</b>Guide mode lights up each hole to connect, one wire at a time.</div><div>${ill3}<b>3 · Check your circuit</b>The lab tests every row of the truth table for you.</div></div>
  <div class="actions"><button class="btn" data-close>Explore on my own</button><button class="btn pri" id="startB">Start with the AND gate</button></div><p class="muted small" style="text-align:center;margin:14px 0 0">Developed and maintained by <b>Shahriar Hossen Sajid</b></p>`);
  $('#startB').onclick=()=>{closeModal();openExp('and');setGuide(true);};
}

// ---------- sidebar ----------
function selectTab(t){document.querySelectorAll('.tabs button').forEach(x=>x.setAttribute('aria-selected',x.dataset.tab===t));for(const p of['exp','parts','guide'])$('#pane-'+p).hidden=p!==t;}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>selectTab(b.dataset.tab));
let passed=new Set();try{passed=new Set(JSON.parse(localStorage.getItem('dldlab.passed2')||'[]'));}catch(e){}
function renderExpList(){
  const done=EXPS.filter(e=>passed.has(e.id)).length;
  let h=`<div style="display:flex;justify-content:space-between;font-weight:700"><span>Your progress</span><span>${done} of ${EXPS.length} done</span></div><div class="prog"><i style="width:${done/EXPS.length*100}%"></i></div>`,g='';
  const groups=[...new Set(EXPS.map(e=>e.group))];
  for(const gr of groups){const list=EXPS.filter(e=>e.group===gr),[a,b]=gr.split(' · ');
    h+=`<div class="grp">${b?`<span class="n">${esc(a)}</span>${esc(b)}`:esc(gr)}</div><div class="cards">`;
    for(const e of list)h+=`<button class="card${passed.has(e.id)?' done':''}" data-exp="${e.id}">${expIcon(e)}<span class="t">${esc(e.title)}</span><span class="c">${[...new Set(e.chips)].map(chipName).join(' + ')}</span>${passed.has(e.id)?'<span class="ok" aria-label="completed"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M5 12l5 5 9-10"/></svg></span>':''}</button>`;
    h+='</div>';}
  $('#pane-exp').innerHTML=h;
}
function openExp(id){curExp=EXPS.find(x=>x.id===id);checkRes=null;lastRes=null;showExp=false;lastDone=-1;selectTab('exp');renderSheet();renderDyn();save();$('#pane-exp').scrollTop=0;}
$('#pane-exp').addEventListener('click',e=>{
  const tg=e.target.closest('[data-tog]');if(tg){toggleSw(+tg.dataset.tog.slice(1));return;}
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.exp)openExp(b.dataset.exp);
  else if(b.id==='backB'){curExp=null;guideOn=false;renderExpList();renderDyn();save();}
  else if(b.id==='checkB')doCheck();
  else if(b.id==='guideB')setGuide(!guideOn);
  else if(b.id==='solB')confirmBox('Show the solution?','This clears the breadboard and builds a working circuit for this experiment. Try it yourself first — you can undo afterwards.','Build solution',()=>{undo.push(snap());redo=[];const s=buildSolution(curExp);Object.assign(st,{ics:s.ics,wires:s.wires,nextId:s.nextId});sel=null;afterChange();closeSheetMobile();toast('Solution built. Point at any wire end to trace the connection.');});
  else if(b.id==='expB'){showExp=!showExp;renderSheet();}
  else if(b.id==='resetB'){for(const[,s]of curExp.ins)st.sw[+s.slice(1)]=0;refresh();save();}
  else if(b.dataset.pin)showPinout(b.dataset.pin);
  else if(b.dataset.add)addIC(b.dataset.add);
});
function curInputs(){return curExp.ins.map(([n,s])=>st.sw[+s.slice(1)]);}
function renderSheetGuideBtn(){const b=$('#guideB');if(b){b.innerHTML=guideOn?'Hide the board guide':'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>Guide me on the board';b.className='btn big '+(guideOn?'':'amb');}}
function renderSheet(){
  const e=curExp;
  let h=`<button class="back" id="backB"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>All experiments</button>
  <div class="muted small" style="margin-top:6px">${esc(e.group)}</div><h2>${esc(e.title)}</h2><p>${esc(e.objective)}</p>
  <button id="guideB"></button>
  <h3>Circuit diagram</h3><div class="sch" id="schBox"></div><p class="muted small">Click an input to flip its switch. Wire colours show what the circuit <i>should</i> do (red = 1); the LEDs on the right show what your breadboard is doing.</p>
  <h3>Theory</h3><span class="formula">${esc(e.expr)}</span><p>${esc(e.theory)}</p>
  <h3>ICs needed</h3><div style="display:flex;flex-direction:column;gap:6px">${[...new Set(e.chips)].map(c=>`<div class="part"><span class="nm">${chipName(c)}</span><span class="ds">${esc(CHIPS[c].kind)}</span><button class="btn sm" data-pin="${c}">Pinout</button><button class="btn sm pri" data-add="${c}">Add</button></div>`).join('')}</div>
  <h3>Trainer connections</h3><div class="map"><span>Inputs</span><span>${e.ins.map(([n,s])=>`${esc(n)} → ${s}`).join(', ')}</span><span>Outputs</span><span>${e.outs.map(([n,s])=>`${esc(n)} → ${s}`).join(', ')}</span></div>
  <p class="muted small">Use exactly these switches and LEDs — the checker reads them. Amber tags on the board mark them.</p>
  <h3>Procedure</h3><ol class="steps">${e.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>
  <h3>Truth table</h3><div id="ttBox"></div>
  <div class="actions"><button class="btn pri" id="checkB"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5 9-10"/></svg>Check my circuit</button><button class="btn" id="expB">${showExp?'Hide':'Show'} expected outputs</button><button class="btn" id="resetB">Inputs to 0</button><button class="btn" id="solB">Show solution</button></div>
  <div id="resBox"></div>`;
  $('#pane-exp').innerHTML=h;renderSheetGuideBtn();renderLive();renderResult();
}
function renderLive(){
  if(!curExp||!$('#ttBox'))return;const e=curExp,rows=expRows(e),cur=curInputs(),obs=e.outs.map(([n,s])=>readOut(C,R,s));
  const inV=Object.fromEntries(e.ins.map(([n],k)=>[n,cur[k]])),outV=Object.fromEntries(e.outs.map(([n],k)=>[n,st.power?obs[k]:0]));
  $('#schBox').innerHTML=SCH[e.id]?schSVG(e,SCH[e.id],inV,outV):blockSVG(e,inV,outV);
  const big=rows.length>32,head=`<tr>${e.ins.map(([n])=>`<th>${esc(n)}</th>`).join('')}${e.outs.map(([n],k)=>`<th class="${k?'':'sp'}">${esc(n)}</th>`).join('')}</tr>`;
  const resMap=checkRes?new Map(checkRes.map(x=>[x.r.join(''),x])):null,bit=v=>v===''?'':`<span class="bit b${v}">${v}</span>`;
  const rowHTML=(r,live)=>{const cr=resMap&&resMap.get(r.join('')),want=e.f(Object.fromEntries(e.ins.map(([n],k)=>[n,r[k]])));
    return`<tr class="${live?'live':''}">${r.map(v=>`<td>${v}</td>`).join('')}${e.outs.map(([n],k)=>{const ex=want[n]?1:0;let v,cls='';
      if(live){v=obs[k];if(showExp||cr)cls=v===ex?'good':'bad';}else if(cr){v=cr.got[k];cls=cr.got[k]===cr.exp[k]?'good':'bad';}else v=showExp?ex:'';
      return`<td class="${k?'':'sp'} ${cls}">${bit(v)}</td>`;}).join('')}</tr>`;};
  let h;
  if(!big)h=`<div class="ttwrap"><table class="tt"><thead>${head}</thead><tbody>${rows.map(r=>rowHTML(r,r.join('')===cur.join(''))).join('')}</tbody></table></div><p class="muted small">The highlighted row matches your switches and shows your LEDs. ${showExp?'Green = correct, red = wrong.':'Flip the switches to fill in the other rows, or press Check my circuit.'}</p>`;
  else h=`<p class="small">This table has ${rows.length} rows — too many to list. The live row shows your current switches and LEDs.</p><div class="ttwrap"><table class="tt"><thead>${head}</thead><tbody>${rowHTML(cur,true)}</tbody></table></div><p class="muted small">Turn on Show expected outputs to see whether the live row is right. Check my circuit tests every row.</p>`;
  $('#ttBox').innerHTML=h;
}
function doCheck(){
  const e=curExp;if(!e)return;
  if(!st.ics.length){checkRes=null;setResult('bad','The breadboard is empty.',['Start with the ICs: press Add next to each chip in "ICs needed", or use Guide me on the board.']);return;}
  if(!st.power){setResult('bad','The trainer is switched off.',['Press the Power button on the left of the board.']);return;}
  const hints=[];
  if(e.only){const bad=st.ics.filter(i=>!e.only.includes(i.type));if(bad.length)hints.push(`This experiment allows only the ${e.only.map(chipName).join(', ')}. Remove ${bad.map(i=>i.ref).join(', ')}.`);}
  C.ics.forEach((x,k)=>{if(R.status[k]!=='ok')hints.push(`${x.ic.ref} (${chipName(x.ch.num)}) is not powered: pin ${x.ch.vcc} → +5 V, pin ${x.ch.gnd} → GND.`);});
  for(const[n,s]of e.outs)if(C.members[C.net(s)].length===1)hints.push(`Output ${n} is not connected — nothing is wired to ${s}.`);
  for(const[n,s]of e.ins)if(C.members[C.net(s)].length===1)hints.push(`Input ${n} (switch ${s}) is not wired to anything.`);
  checkRes=checkExp(st,e);const bad=checkRes.filter(r=>!r.ok);
  if(!bad.length&&!(e.only&&hints.length)){const first=!passed.has(e.id);passed.add(e.id);try{localStorage.setItem('dldlab.passed2',JSON.stringify([...passed]));}catch(x){}
    setResult('ok',`All ${checkRes.length} rows are correct. Experiment complete!`,[]);confetti();toast('Experiment complete! Every row of the truth table is correct.',3200);}
  else{const ex=bad.slice(0,4).map(r=>`When ${e.ins.map(([n],k)=>n+'='+r.r[k]).join(', ')}: expected ${e.outs.map(([n],k)=>n+'='+r.exp[k]).join(' ')}, your LEDs show ${e.outs.map(([n],k)=>n+'='+r.got[k]).join(' ')}`);
    setResult('bad',`${bad.length} of ${checkRes.length} rows are wrong.`,[...hints,...ex,...(guideOn?[]:['Tip: press Guide me on the board to see which connections are missing.'])]);}
  renderLive();const rb=$('#resBox');rb&&rb.scrollIntoView({behavior:'smooth',block:'nearest'});
}
let lastRes=null;function setResult(k,t,list){lastRes={k,t,list};renderResult();}
function renderResult(){const b=$('#resBox');if(!b)return;if(!lastRes){b.innerHTML='';return;}
  b.innerHTML=`<div class="result ${lastRes.k}">${esc(lastRes.t)}${lastRes.list.length?`<ul>${lastRes.list.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</div>`;}
function confetti(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;const cs=['#F59E0B','#EF4444','#22C55E','#2563EB','#A855F7'];
  for(let i=0;i<70;i++){const d=document.createElement('div');d.className='confetti';d.style.left=Math.random()*100+'vw';d.style.background=cs[i%5];d.style.animationDuration=(1.6+Math.random()*1.6)+'s';d.style.animationDelay=Math.random()*.4+'s';document.body.appendChild(d);setTimeout(()=>d.remove(),4000);}}
function renderParts(){
  const card=n=>{const c=CHIPS[n],ic=c.sym&&['and','or','not','nand','nor','xor'].includes(c.sym)?expIcon({sym:c.sym}):expIcon({sym:c.sym});
    return`<div class="part">${ic.replace('class="ico"','class="ico" width="54" height="34"')}<span class="ds"><b style="color:var(--ink)">${chipName(n)}</b><br>${esc(c.kind)}</span><button class="btn sm" data-pin="${n}">Pinout</button><button class="btn sm pri" data-add="${n}">Add</button></div>`;};
  $('#pane-parts').innerHTML=`<p class="muted" style="margin-top:0">These are the only chips your experiments need. Press Add to drop one across the centre gap, then drag it sideways to move it.</p>
  <div class="grp">Logic gate ICs</div><div class="parts">${CHIP_ORDER.slice(0,6).map(card).join('')}</div>
  <div class="grp">Encoder, decoder, MUX and comparator ICs</div><div class="parts">${CHIP_ORDER.slice(6).map(card).join('')}</div>
  <div class="grp">Your bench</div><div class="actions" style="margin-top:4px"><button class="btn" id="saveB">Save circuit code</button><button class="btn" id="loadB">Load circuit code</button><button class="btn" id="clearB" style="color:var(--danger)">Clear breadboard</button></div>`;
}
$('#pane-parts').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.add)addIC(b.dataset.add);else if(b.dataset.pin)showPinout(b.dataset.pin);
  else if(b.id==='clearB')confirmBox('Clear the breadboard?','This removes every IC and wire. You can undo it.','Clear',()=>mutate(()=>{st.ics=[];st.wires=[];}));
  else if(b.id==='saveB'){const code=btoa(unescape(encodeURIComponent(snap())));openModal(`<h2>Circuit code</h2><p>Copy this code to keep your circuit or share it with a classmate. Load it back with Load circuit code.</p><textarea readonly id="codeT">${code}</textarea><div class="actions"><button class="btn" data-close>Close</button><button class="btn pri" id="copyB">Copy</button></div>`);
    $('#copyB').onclick=async()=>{try{await navigator.clipboard.writeText(code);toast('Copied');}catch(x){$('#codeT').select();toast('Select the code and copy it with Ctrl+C');}};}
  else if(b.id==='loadB'){openModal(`<h2>Load circuit code</h2><p>Paste a circuit code. It replaces what is on the breadboard now (you can undo).</p><textarea id="codeT" placeholder="Paste the code here"></textarea><div class="actions"><button class="btn" data-close>Cancel</button><button class="btn pri" id="doLoad">Load</button></div>`);
    $('#doLoad').onclick=()=>{try{const d=JSON.parse(decodeURIComponent(escape(atob($('#codeT').value.trim()))));if(!validState(d))throw 0;closeModal();mutate(()=>{st.ics=d.ics;st.wires=d.wires;st.nextId=d.nextId;});toast('Circuit loaded');}catch(x){toast('That code is not valid. Copy the whole code and try again.');}};}
});
function renderGuide(){
  $('#pane-guide').innerHTML=`<h2>How this lab works</h2>
  <div class="actions"><button class="btn pri" id="tourB">Show the welcome screen</button></div>
  <h3>The breadboard</h3><ul class="guide"><li>Each column of 5 holes (A–E, or F–J) is joined inside. Point at any hole and its column lights up green.</li><li>The long rails along the top and bottom edges run the whole length: red + for +5 V, blue − for GND. They are dead until you wire them to the trainer's +5 V and GND terminals.</li><li>ICs sit across the centre gap so every pin gets its own column.</li></ul>
  <h3>Wiring</h3><ul class="guide"><li>Click a hole, then click another hole or a gold trainer socket. You can also drag from one to the other.</li><li>One wire per hole, like a real breadboard. Trainer sockets accept several wires.</li><li>Click a wire to change its colour or delete it (<kbd>Delete</kbd>). <kbd>Esc</kbd> cancels a wire.</li></ul>
  <h3>ICs</h3><ul class="guide"><li>The notch is on the left, so pin 1 is bottom-left. Pins count anticlockwise: along the bottom to the right, then back along the top. Pin numbers are printed on every chip.</li><li>Every IC needs power: pin 14 → +5 V and pin 7 → GND on 14-pin chips, pin 16 and pin 8 on 16-pin chips.</li><li>The dot on each chip is green when powered and red if the power is reversed.</li><li>An unconnected TTL input floats HIGH. In the real lab, tie unused inputs to +5 V or GND.</li></ul>
  <h3>Board tools</h3><ul class="guide"><li><b>Guide</b> lights up the next connection to make and ticks it off when you make it.</li><li><b>Signals</b> colours every wire by its level: red HIGH, green LOW, dashed amber floating.</li><li>The <b>logic probe</b> (top right of the board) shows the level of whatever you point at.</li></ul>
  <h3>Shortcuts</h3><ul class="guide"><li><kbd>0</kbd>–<kbd>9</kbd> flip switches S0–S9</li><li><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo, <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo</li><li>Mouse wheel or pinch to zoom; drag the empty bench to move around</li></ul>
  <p class="muted small" style="margin-top:20px">Your work is saved in this browser automatically.</p><h3>About</h3><p><b>FEC DLD Virtual Lab</b> for the Digital Logic Design lab (CSE 1202 &amp; CSE 1212), Faridpur Engineering College.</p><p>Developed and maintained by <b>Shahriar Hossen Sajid</b>.</p>`;
  $('#tourB').onclick=welcome;
}

// ---------- init ----------
try{if(localStorage.getItem('dldlab.theme')==='dark')document.documentElement.dataset.theme='dark';}catch(e){}
(function init(){
  const d=load();st=freshState();
  if(d){Object.assign(st,d.st);if(!Array.isArray(st.sw)||st.sw.length!==NSW)st.sw=Array(NSW).fill(0);curExp=EXPS.find(x=>x.id===d.exp)||null;guideOn=!!d.guideOn;sigView=!!d.sigView;}
  buildBoard();C=compile(st);R=run(C,st.sw,st.power);
  renderExpList();renderParts();renderGuide();if(curExp)renderSheet();
  renderDyn();updateUndo();requestAnimationFrame(fit);
  let rt,lw=0;new ResizeObserver(()=>{const w=$('#benchWrap').clientWidth;if(Math.abs(w-lw)<2&&lw)return;lw=w;clearTimeout(rt);rt=setTimeout(fit,80);}).observe($('#benchWrap'));
  if(!d)setTimeout(welcome,300);
})();
