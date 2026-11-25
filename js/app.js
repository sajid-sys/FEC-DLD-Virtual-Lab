// FEC DLD Virtual Lab — user interface: board drawing, wiring, sidebar, guide, checker.
// Developed and maintained by Shahriar Hossen Sajid.
// Copyright (C) 2026 Shahriar Hossen Sajid. SPDX-License-Identifier: GPL-3.0-only
// Licensed under the GNU GPL v3.0 with additional terms (keep the author credit visible; the name and
// logos are not licensed) — see LICENSE and ADDITIONAL-TERMS.md.
const $=s=>document.querySelector(s);
const svgEl=$('#bench'),vpEl=$('#vp');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let st,C,R,undo=[],redo=[],sel=null,pending=null,curExp=null,checkRes=null,showExp=false,vp={x:0,y:0,k:1},probe=null,guideOn=false,sigView=false,lastDone=-1;
const LS='dldlab.v2';
function save(){try{localStorage.setItem(LS,JSON.stringify({st,exp:curExp&&curExp.id,guideOn,sigView}));}catch(e){}}
function load(){try{const d=JSON.parse(localStorage.getItem(LS));if(d&&d.st&&validState(d.st))return d;}catch(e){}return null;}
const snap=()=>JSON.stringify({ics:st.ics,wires:st.wires,nextId:st.nextId});
function mutate(fn){if(sweep)endSweep(false);undo.push(snap());if(undo.length>150)undo.shift();redo=[];fn();afterChange();}
function restore(s){Object.assign(st,JSON.parse(s));sel=null;afterChange();}
function afterChange(){if(sweep)endSweep(false);C=compile(st);checkRes=null;lastRes=null;refresh();save();updateUndo();}
// MEM holds every chip's stored state (flip-flops, counters, registers) between runs; clkLevel is the
// trainer's CLOCK output, HIGH only while a pulse is being sent.
const MEM=new Map();let clkLevel=0,pulseBusy=false;
function refresh(){R=run(C,st.sw,st.power,MEM,clkLevel);renderDyn();renderLive();}
function pulse(){if(sweep)endSweep(true);if(pulseBusy)return;if(!st.power){toast('The trainer is switched off. Press Power first.');return;}
  pulseBusy=true;clkLevel=1;refresh();setTimeout(()=>{clkLevel=0;refresh();pulseBusy=false;},160);}
function updateUndo(){$('#undoB').disabled=!undo.length;$('#redoB').disabled=!redo.length;}
function toast(m,ms=2600){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),ms);}

document.documentElement.classList.add('boot');
// ---------- motion ----------
// Animations respect prefers-reduced-motion and the "Reduce animations" option in Help (class rm on <html>).
// renderDyn rebuilds the SVG layers on every change, so looping animations take a negative delay from the
// clock (they continue seamlessly), and one-off animations run only on elements that are new or changed.
let rmPref=false;try{rmPref=localStorage.getItem('dldlab.rm')==='1';}catch(e){}
const rmMQ=matchMedia('(prefers-reduced-motion: reduce)');
const motionOK=()=>!rmPref&&!rmMQ.matches;
function applyMotionPref(){document.documentElement.classList.toggle('rm',!motionOK());}
if(rmMQ.addEventListener)rmMQ.addEventListener('change',applyMotionPref);applyMotionPref();
const phaseVar=(el,name,ms)=>el.style.setProperty(name,`-${Math.round(performance.now()%ms)}ms`);
function anim(el,kf,opt){if(!el||!el.animate||!motionOK())return null;try{return el.animate(kf,opt);}catch(e){return null;}}
// Replace a container's markup, but if it shows the same structure as before (same key and the same
// elements), copy the changed attributes and texts onto the existing elements so CSS transitions can run.
function patchHTML(box,html,key){const t=document.createElement('template');t.innerHTML=html;
  if(box.dataset.k===key&&box.firstElementChild){const a=box.querySelectorAll('*'),b=t.content.querySelectorAll('*');
    if(a.length===b.length&&[...a].every((x,i)=>x.tagName===b[i].tagName)){a.forEach((x,i)=>{const y=b[i];
      for(const at of[...x.attributes])if(!y.hasAttribute(at.name))x.removeAttribute(at.name);
      for(const at of[...y.attributes])if(x.getAttribute(at.name)!==at.value)x.setAttribute(at.name,at.value);
      if(!y.children.length&&x.textContent!==y.textContent)x.textContent=y.textContent;});return;}}
  box.replaceChildren(t.content);box.dataset.k=key;}
document.addEventListener('visibilitychange',()=>document.documentElement.classList.toggle('hid',document.hidden));
// Signal flow: for each wire, which end is nearer a driver (switch, CLOCK, +5 V or an IC output), found by a
// breadth-first search over strips joined by wires. Dots run from that end towards the inputs.
let flowOn=true;try{flowOn=localStorage.getItem('dldlab.flow')!=='0';}catch(e){}
function flowDist(){if(C._fd)return C._fd;const adj=new Map(),add=(a,b)=>{if(!adj.has(a))adj.set(a,[]);adj.get(a).push(b);};
  for(const w of st.wires){const a=NODES.get(w.a).strip,b=NODES.get(w.b).strip;add(a,b);add(b,a);}
  const d=new Map(),q=[],src=k=>{if(!d.has(k)){d.set(k,0);q.push(k);}};
  for(let i=0;i<NSW;i++)src('S'+i);src('CLK');src('VCC');
  for(const x of C.ics)x.ch.role.forEach((r,p)=>{if(r==='out')src(NODES.get(pinNode(x.ic,p+1)).strip);});
  for(let h=0;h<q.length;h++){const k=q[h];for(const m of adj.get(k)||[])if(!d.has(m)){d.set(m,d.get(k)+1);q.push(m);}}
  return C._fd=d;}
let flowSig=null;
// Moving dots on HIGH signal wires (not the +5 V supply wiring). Rebuilt only when the set changes.
function renderFlow(){const L=$('#flowL');let sig='',s='';
  if(flowOn&&st.power){const d=flowDist();
    for(const w of st.wires){const n=C.net(w.a);if(R.val[n]!==1||n===C.vcc)continue;
      const da=d.get(NODES.get(w.a).strip)??1e9,db=d.get(NODES.get(w.b).strip)??1e9,[p,q]=db<da?[w.b,w.a]:[w.a,w.b];
      sig+=w.id+':'+p+'>'+q+',';s+=`<path d="${wirePath(p,q)}" class="fdot"/>`;}}
  if(sig===flowSig)return;flowSig=sig;phaseVar(L,'--fph',600);L.innerHTML=s;}
// Effects layer (#fxL) is never rebuilt by renderDyn; each effect removes itself when done.
function fx(svg,ms){if(!motionOK())return;const g=document.createElementNS('http://www.w3.org/2000/svg','g');g.innerHTML=svg;$('#fxL').appendChild(g);setTimeout(()=>g.remove(),ms);}
function stripBox(id){const n=NODES.get(id);
  if(n.kind==='hole'){const ys=[...NODES.values()].filter(m=>m.strip===n.strip).map(m=>m.y);return[n.x-9,Math.min(...ys)-9,18,Math.max(...ys)-Math.min(...ys)+18];}
  return n.kind==='rail'?[n.x-9,n.y-9,18,18]:[n.x-11,n.y-11,22,22];}
function fxPulse(id){const[x,y,w,h]=stripBox(id);fx(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" class="fx-pulse"/>`,650);}
function fxTick(x,y){fx(`<g transform="translate(${x} ${y})"><g class="fx-tick"><circle r="11"/><path d="M-5 0l3.5 3.5 6-7"/></g></g>`,1150);}
function fxShort(w){const n=NODES.get(w.a);fx(`<path d="${wirePath(w.a,w.b)}" class="fx-short"/><g transform="translate(${n.x} ${n.y})"><g class="fx-spark"><path d="M0-13V-6M0 6V13M-13 0H-6M6 0H13M-9-9l4 4M5 5l4 4M9-9l-4 4M-5 5l-4 4"/></g></g>`,750);}

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
  const T={ENC:['M26 6L64 16V38L26 48Z','ENC'],DEC:['M26 16L64 6V48L26 38Z','DEC'],MUX:['M26 6L64 16V38L26 48Z','MUX'],DMX:['M26 16L64 6V48L26 38Z','DMX'],SUM:['M24 8H66V46H24Z','Σ'],CMP:['M24 8H66V46H24Z','A:B'],
    ALU:['M24 6L66 16V24L58 27L66 30V38L24 48Z','ALU'],FF:['M24 8H66V46H24Z','FF'],REG:['M18 8H72V46H18Z','SHIFT'],CNT:['M24 8H66V46H24Z','CTR']};
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
// Which chip pins each trainer socket (switch, LED, CLK) is wired to in the reference solution.
function sockPins(e){if(e._pins)return e._pins;const m={};
  for(const s of guideSteps(e).slice(1)){const{a,b}=s,so=a.k==='sock'?a:b.k==='sock'?b:null,pn=a.k==='pin'?a:b.k==='pin'?b:null;if(so&&pn)(m[so.id]=m[so.id]||[]).push(pn);}
  return e._pins=m;}
function blockSVG(e,inV,outV){
  const ch=CHIPS[e.chips[0]],ins=e.clk?[...e.ins,['CLK','CLK']]:e.ins,n=Math.max(ins.length,e.outs.length,2),H=n*26+50,W=440,cx0=142,cx1=302,pm=sockPins(e),one=new Set(e.chips).size===1;
  const yAt=(k,cnt)=>38+(k+.5)*(H-48)/cnt;
  const pinTxt=sk=>{const l=pm[sk]||[];return l.length?(l.length>1?'pins ':'pin ')+l.map(p=>p.p).join(', '):'';};
  const inner=(sk,nm)=>{const l=pm[sk]||[];return one&&l.length?[...new Set(l.map(p=>CHIPS[p.type].names[p.p-1]))].join('/'):nm;};
  let s=`<rect x="${cx0}" y="8" width="${cx1-cx0}" height="${H-16}" rx="8" class="chipbody"/><text x="${(cx0+cx1)/2}" y="28" fill="#E5E7EB" font-size="14" font-weight="700" text-anchor="middle">${chipName(ch.num)}${one?'':' + '+[...new Set(e.chips.slice(1))].map(chipName).join(' + ')}</text>`;
  ins.forEach(([nm,sk],k)=>{const y=yAt(k,ins.length),v=sk==='CLK'?clkLevel:inV[nm];s+=`<polyline points="54,${y} ${cx0},${y}" fill="none" stroke="${LV(v)}" stroke-width="${v?3:2}"/><text x="${cx0-6}" y="${y-5}" font-size="10" text-anchor="end" class="gmut">${sk} · ${pinTxt(sk)}</text><text x="${cx0+6}" y="${y+4}" font-size="11" fill="#CBD5E1">${esc(inner(sk,nm))}</text>`+pill(2,y,nm,v,sk);});
  e.outs.forEach(([nm,sk],k)=>{const y=yAt(k,e.outs.length),v=outV[nm];s+=`<polyline points="${cx1},${y} ${W-58},${y}" fill="none" stroke="${LV(v)}" stroke-width="${v?3:2}"/><text x="${cx1+6}" y="${y-5}" font-size="10" class="gmut">${pinTxt(sk)} · ${sk}</text><text x="${cx1-6}" y="${y+4}" font-size="11" fill="#CBD5E1" text-anchor="end">${esc(inner(sk,nm))}</text>`+ledDot(W-48,y,v)+`<text x="${W-36}" y="${y+4}" font-size="12" font-weight="700" class="gtxt">${esc(nm)}</text>`;});
  return`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Block diagram">${SDEFS}${s}</svg>`;
}

// ---------- static board ----------
function sock(id){const n=NODES.get(id);return`<circle cx="${n.x}" cy="${n.y}" r="7.5" class="sock-ring"/><circle cx="${n.x}" cy="${n.y}" r="3.2" class="sock-hole"/>`;}
function buildBoard(){
  let s=`<rect x="0" y="0" width="${PW}" height="${PH}" rx="20" class="panel"/>`;
  for(const[x,y]of[[16,16],[PW-16,16],[16,PH-16],[PW-16,PH-16]])s+=`<circle cx="${x}" cy="${y}" r="7" class="screw"/><path d="M${x-4} ${y}h8" stroke="#5B6776" stroke-width="1.5"/>`;
  s+=`<rect x="22" y="26" width="180" height="160" rx="10" class="inset"/><image href="assets/logo.png" x="40" y="44" width="58" height="58"/><text x="152" y="66" class="silk big">FEC</text><text x="152" y="84" class="silk big">DLD LAB</text><text x="112" y="132" class="silk">DIGITAL LOGIC TRAINER</text><text x="112" y="150" class="silk n">74LS &amp; CMOS · 16 LEDs · 16 switches</text><text x="112" y="172" class="silk n" style="font-size:9.5px">Faridpur Engineering College</text>`;
  s+=`<rect x="262" y="26" width="636" height="160" rx="10" class="inset"/><text x="580" y="46" class="silk">OUTPUT LEDs — light up when the input is HIGH (1)</text>`;
  for(let i=0;i<NLED;i++){const x=ledX(i);s+=`<circle cx="${x}" cy="76" r="15" class="led-bez"/><circle id="led-L${i}" cx="${x}" cy="76" r="11" class="led-lens"/><circle id="ledg-L${i}" cx="${x}" cy="76" r="11" class="led-glow"/><text x="${x}" y="110" class="silk">L${i}</text>`+sock('L'+i);}
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
  s+=`<rect x="262" y="636" width="906" height="176" rx="10" class="inset"/><text x="650" y="802" class="silk">INPUT SWITCHES — click to flip (up = 1)</text>`;
  for(let i=0;i<NSW;i++){const x=swX(i);s+=sock('S'+i)+`<g data-act="sw" data-i="${i}"><rect x="${x-13}" y="686" width="26" height="62" rx="6" class="sw-slot"/><rect id="swl-${i}" x="${x-10}" y="718" width="20" height="27" rx="4" class="sw-lever"/><rect x="${x-24}" y="678" width="48" height="78" class="sw-hit"/></g><text x="${x}" y="768" class="silk">S${i}</text><text id="swt-${i}" x="${x}" y="785" class="silk" style="fill:#F59E0B;font-size:13px">0</text>`;}
  s+=`<line x1="${CLKX-54}" y1="652" x2="${CLKX-54}" y2="790" stroke="#2C4F78"/>`+sock('CLK')+`<g data-act="clk" role="button" aria-label="CLOCK: send one pulse"><circle cx="${CLKX}" cy="717" r="25" class="sw-slot"/><circle id="clk-cap" cx="${CLKX}" cy="717" r="18" class="clk-cap"/><rect x="${CLKX-34}" y="680" width="68" height="76" class="sw-hit"/></g><text x="${CLKX}" y="768" class="silk">CLOCK</text><text x="${CLKX}" y="785" class="silk n" style="font-size:10px">press = 1 pulse</text>`;
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
    const dot=stt==='ok'?'#22C55E':stt==='rev'?'#EF4444':'#6B7280',blink=stt==='off'&&st.power?`<circle cx="${x1-7}" cy="${(y0+y1)/2}" r="3" class="dot-blink"/>`:'';
    s+=`<g class="ic-g${sel&&sel.kind==='ic'&&sel.id===ic.id?' ic-sel':''}" data-act="ic" data-id="${ic.id}">${legs}<rect x="${x0}" y="${y0}" width="${x1-x0}" height="${y1-y0}" rx="3" class="ic-body"/><path d="M${x0} ${(y0+y1)/2-7}a7 7 0 0 1 0 14z" fill="#3A3A40"/>${nums}
      <text x="${cx}" y="${(y0+y1)/2+4}" class="ic-txt">${chipName(ch.num)}</text><text x="${x0+11}" y="${(y0+y1)/2+4}" class="ic-ref">${esc(ic.ref)}</text><circle cx="${x1-7}" cy="${(y0+y1)/2}" r="3" fill="${dot}"/>${blink}
      ${stt==='rev'?`<circle cx="${cx}" cy="${y0-8}" r="14" fill="#9CA3AF" filter="url(#smoke)" class="smoke"/>`:''}</g>`;}
  const icL=$('#icL');phaseVar(icL,'--sph',1800);phaseVar(icL,'--bph',1600);icL.innerHTML=s;
  // New IC: drops in and settles. Moved IC (dragged to another column): slides from its old place.
  const icNow=new Map(st.ics.map(i=>[i.id,i.col]));
  if(prevIcCol)for(const ic of st.ics){const was=prevIcCol.get(ic.id),g=()=>icL.querySelector(`[data-id="${ic.id}"]`);
    if(was===undefined)queueFx(()=>anim(g(),[{transform:'translateY(-12px)',opacity:.4},{transform:'translateY(1.5px)',opacity:1,offset:.7},{transform:'none'}],{duration:260,easing:'ease-out'}));
    else if(was!==ic.col){const dx=(was-ic.col)*P;queueFx(()=>anim(g(),[{transform:`translateX(${dx}px)`},{transform:'none'}],{duration:120,easing:'ease-out'}));}}
  prevIcCol=icNow;
  s='';const wireL=$('#wireL');phaseVar(wireL,'--wph',700);
  for(const w of st.wires){const d=wirePath(w.a,w.b),p=NODES.get(w.a),q=NODES.get(w.b),issel=sel&&sel.kind==='wire'&&sel.id===w.id;
    const lv=st.power?R.val[C.net(w.a)]:2,col=esc(sigView?LVC[lv]:w.color),cls=sigView?(lv===1?' flow':lv===2?' fz':''):'';
    s+=`<g data-act="wire" data-id="${w.id}">${issel?`<path d="${d}" class="wire-sel"/>`:''}<path d="${d}" class="wire-sh"/><path d="${d}" class="wire${cls}" stroke="${col}"/><circle cx="${p.x}" cy="${p.y}" r="4" fill="${col}" class="wire-end"/><circle cx="${q.x}" cy="${q.y}" r="4" fill="${col}" class="wire-end"/><path d="${d}" class="wire-hit"/></g>`;}
  wireL.innerHTML=s;
  // New wire: draws itself from the first point to the second, then the strips it joins pulse once.
  const wNow=new Set(st.wires.map(w=>w.id));
  if(prevWires){const fresh=st.wires.filter(w=>!prevWires.has(w.id));
    for(const w of fresh)queueFx(()=>{const g=wireL.querySelector(`[data-id="${w.id}"]`);if(!g)return;
      for(const p of g.querySelectorAll('.wire,.wire-sh')){const L=Math.ceil(p.getTotalLength())+1;anim(p,[{strokeDasharray:`${L} ${L}`,strokeDashoffset:L},{strokeDasharray:`${L} ${L}`,strokeDashoffset:0}],{duration:220,easing:'ease-out'});}
      const ends=g.querySelectorAll('.wire-end');if(ends[1])anim(ends[1],[{opacity:0},{opacity:0,offset:.75},{opacity:1}],{duration:240});});
    if(fresh.length&&fresh.length<=2)setTimeout(()=>{for(const w of fresh)for(const e of[w.a,w.b])if(NODES.get(e).kind==='hole')fxPulse(e);},220);}
  prevWires=wNow;
  // Short circuit: the wires of a newly shorted net flash red twice, with a spark at the strip.
  const shortNow=new Set(st.power?st.wires.filter(w=>R.val[C.net(w.a)]===3).map(w=>w.id):[]);
  st.wires.filter(w=>shortNow.has(w.id)&&!prevShorts.has(w.id)).slice(0,8).forEach(fxShort);prevShorts=shortNow;
  for(let i=0;i<NLED;i++){const on=R.read('L'+i)===1;$('#led-L'+i).classList.toggle('on',on);$('#ledg-L'+i).classList.toggle('on',on);}
  for(let i=0;i<NSW;i++){$('#swl-'+i).classList.toggle('up',!!st.sw[i]);$('#swt-'+i).textContent=st.sw[i];}
  $('#clk-cap').classList.toggle('on',!!clkLevel&&st.power);
  $('#pwr-led').classList.toggle('on',st.power);$('#pwr-knob').setAttribute('cx',st.power?135:89);
  $('#tPwr').setAttribute('aria-pressed',st.power);$('#tSig').setAttribute('aria-pressed',sigView);$('#tGuide').setAttribute('aria-pressed',guideOn&&!!curExp);$('#tFlow').setAttribute('aria-pressed',flowOn);
  renderFlow();renderTags();renderWarn();renderSelCard();renderProbe();renderCoach();renderRotHint();
}
// What the last render showed, so only new or changed things animate (null until the first render).
let prevIcCol=null,prevWires=null,prevShorts=new Set(),fxQueue=[];
// One-off animations wait for the next frame, after every synchronous re-render of this change.
function queueFx(f){if(!fxQueue.length)requestAnimationFrame(()=>{const q=fxQueue;fxQueue=[];q.forEach(g=>g());});fxQueue.push(f);}
function renderTags(){let s='';if(curExp){const tag=(sk,t,dy)=>{const n=NODES.get(sk),w=Math.max(24,t.length*7+12);s+=`<g class="tag"><rect x="${n.x-w/2}" y="${n.y+dy}" width="${w}" height="17" rx="4"/><text x="${n.x}" y="${n.y+dy+12.5}">${esc(t)}</text></g>`;};
  curExp.ins.forEach(([nm,sk])=>tag(sk,nm,-40));curExp.outs.forEach(([nm,sk])=>tag(sk,nm,15));if(curExp.clk)tag('CLK','CLK',-40);}
  $('#tagL').innerHTML=s;}
const ICON_W='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18v.5"/></svg>';
// Input pins of a chip that nothing drives.
function floatingInputs(x){const r=[];for(let p=1;p<=x.ch.pins;p++)if(x.ch.role[p-1]==='in'&&R.val[x.pn[p]]===2)r.push(p);return r;}
function renderWarn(){
  const m=[];
  if(!st.power)m.push(['err','The trainer is switched OFF. Press the Power button to turn it on.']);
  const shorts=[];for(let n=0;n<C.N;n++)if(R.val[n]===3)shorts.push(n);
  if(shorts.includes(C.vcc))m.push(['err','Power short: +5 V is connected straight to GND or to a LOW output. On a real board this blows the fuse or burns a chip.']);
  for(const n of shorts){if(n===C.vcc)continue;m.push(['err',`Short circuit: two outputs are connected together (${C.members[n].slice(0,3).join(', ')}). Never join two outputs.`]);if(m.length>4)break;}
  C.ics.forEach((x,k)=>{const s=R.status[k];if(s==='rev')m.push(['err',`${x.ic.ref} (${chipName(x.ch.num)}) has its power reversed! A real chip would be destroyed. Pin ${x.ch.vcc} must go to +5 V and pin ${x.ch.gnd} to GND.`]);
    else if(s==='off'&&st.power)m.push(['',`${x.ic.ref} (${chipName(x.ch.num)}) has no power yet: pin ${x.ch.vcc} → +5 V, pin ${x.ch.gnd} → GND.`]);
    else if(s==='ok'&&x.ch.cmos){const fl=floatingInputs(x);if(fl.length)m.push(['',`${x.ic.ref} (${chipName(x.ch.num)}) has floating inputs on pin${fl.length>1?'s':''} ${fl.join(', ')}. CMOS inputs must be tied to VDD or VSS, even unused ones.`]);}});
  if(R.osc)m.push(['err','The circuit is oscillating — an output feeds back into its own input. Check for loops.']);
  $('#warn').innerHTML=(guideOn&&curExp?m.filter(x=>x[0]==='err'):m).slice(0,3).map(([c,t])=>`<div class="wmsg ${c}">${ICON_W}<span>${esc(t)}</span></div>`).join('');
}
function renderSelCard(){const el=$('#selCard');if(!sel){el.style.display='none';return;}let d='';
  if(sel.kind==='ic'){const ic=st.ics.find(i=>i.id===sel.id);if(!ic){sel=null;el.style.display='none';return;}const ch=CHIPS[ic.type],s=icStatusOf(ic.id);
    d=`<div class="d"><b>${esc(ic.ref)} · ${chipName(ch.num)}</b> — ${esc(ch.kind)}<br><span style="color:${s==='ok'?'var(--ok)':'var(--danger)'}">${s==='ok'?'Powered':s==='rev'?'Power reversed':'Not powered'}</span> · drag to move</div><button class="btn sm" data-pin="${ch.num}">Pinout</button>`;}
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
  if(ep.k==='sock')return ep.id==='CLK'?'the CLOCK output':ep.id[0]==='S'?'switch '+ep.id:'LED '+ep.id;
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
  if(!guideOn||!curExp){el.style.display='none';L.innerHTML='';coachPct=null;guideIdx=null;return;}
  const steps=gSteps(),done=guideStatus(st,C,steps),idx=done.indexOf(false),n=steps.length,cnt=done.filter(Boolean).length;
  if(lastDone>=0&&cnt>lastDone){if(idx>=0)toast('Done! The next connection is glowing on the board.',1800);
    // green tick at the connection just made (the newest wire's second end, or the newest IC)
    const w=st.wires[st.wires.length-1],ic=st.ics[st.ics.length-1],newest=w&&(!ic||w.id>ic.id);
    if(newest){const q=NODES.get(w.b);fxTick(q.x,q.y-20);}else if(ic){const h=CHIPS[ic.type].pins/2;fxTick((colX(ic.col)+colX(ic.col+h-1))/2,ROWY.E-14);}}
  lastDone=cnt;
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
  // progress bar: rendered at its previous fill, then grows to the new one (transform transition)
  const pct=cnt/n,from=coachPct??pct;coachPct=pct;
  el.innerHTML=`<div class="k">Guided build · ${cnt} of ${n} steps done</div><div class="prog"><i class="sx" style="transform:scaleX(${from})"></i></div><div class="m">${esc(msg)}</div><div class="h">${esc(hint)}</div><div class="row">${btns}<button class="btn sm" data-g="off">Hide guide</button></div>`;
  if(from!==pct){const bar=el.querySelector('.prog i');requestAnimationFrame(()=>{bar.style.transform=`scaleX(${pct})`;});}
  el.style.display='block';phaseVar(L,'--gph',1100);phaseVar(L,'--glph',800);L.innerHTML=g;
  // a new target fades in (the pulse itself keeps its phase across re-renders)
  if(idx!==guideIdx){if(guideIdx!==null)anim(L,[{opacity:0},{opacity:1}],{duration:220,easing:'ease-out'});guideIdx=idx;}
}
let coachPct=null,guideIdx=null;
$('#coach').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.g==='add')addIC(b.dataset.t,true);else if(b.dataset.g==='off'){guideOn=false;renderDyn();renderSheetGuideBtn();save();}
  else if(b.dataset.g==='check'){showSide();doCheck();}});
function setGuide(on){if(on&&!curExp){toast('Pick an experiment first — the guide shows its connections on the board.');selectTab('exp');showSide();return;}
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
let lastHl='',touchTip=false;
function hideTip(){touchTip=false;$('#tip').classList.remove('show');$('#hlL').innerHTML='';lastHl='';}
function hover(e){
  const pt=world(e),id=nearNode(pt,11),tip=$('#tip');let hl='';
  if(id){const n=NODES.get(id),strip=[...NODES.values()].filter(m=>m.strip===n.strip);
    if(n.kind==='hole'){const ys=strip.map(m=>m.y);hl+=`<rect x="${n.x-9}" y="${Math.min(...ys)-9}" width="18" height="${Math.max(...ys)-Math.min(...ys)+18}" rx="5" class="hl-strip"/>`;}
    else if(n.kind==='rail'){const xs=strip.map(m=>m.x);hl+=`<rect x="${Math.min(...xs)-9}" y="${n.y-9}" width="${Math.max(...xs)-Math.min(...xs)+18}" height="18" rx="5" class="hl-strip"/>`;}
    else hl+=`<circle cx="${n.x}" cy="${n.y}" r="11" class="hl-strip"/>`;
    for(const m of C.members[C.net(id)]){const q=NODES.get(m);if(q.strip!==n.strip)hl+=`<circle cx="${q.x}" cy="${q.y}" r="7" class="hl-net"/>`;}
    const v=st.power?R.read(id):2,[vt,vc]=VTXT[v],pi=pinInfo(id);
    let h=pi?`<b>${esc(pi.ic.ref)} ${chipName(pi.ch.num)} · pin ${pi.p}</b><br>${esc(pi.name)} (${{in:'input',out:'output',vcc:'power +5 V',gnd:'ground',nc:'not connected'}[pi.role]})`:`<b>${esc(n.label)}</b>`;
    if(n.kind==='hole')h+=`<br><span style="opacity:.8">Column ${n.strip.slice(1)}: holes ${n.strip[0]==='U'?'A–E':'F–J'} are joined</span>`;
    h+=`<br>Level <span class="v ${vc}">${vt}</span>`;
    if(v===2&&pi&&pi.role==='in')h+=pi.ch.cmos?'<br><span style="opacity:.8">A floating CMOS input is undefined — tie it to VDD or VSS (the lab reads it as LOW)</span>':'<br><span style="opacity:.8">A floating TTL input reads as HIGH</span>';
    tip.innerHTML=h;const l=local(e),r=svgEl.getBoundingClientRect();tip.classList.add('show');
    tip.style.left=Math.min(l.x+16,r.width-tip.offsetWidth-8)+'px';tip.style.top=Math.max(8,l.y-tip.offsetHeight-12)+'px';probe=id;}
  else if(!touchTip)tip.classList.remove('show');
  if(hl!==lastHl){$('#hlL').innerHTML=hl;lastHl=hl;}renderProbe();
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
// Touch: there is no hover, so a long press (about 500 ms without moving) on a hole or pin shows its
// tooltip and level on the logic probe instead of starting a wire. The tip stays until the next tap.
let lp=null;
function clearLongPress(){if(lp){clearTimeout(lp.t);lp=null;}}
function startLongPress(e){clearLongPress();const at={clientX:e.clientX,clientY:e.clientY};
  lp={id:e.pointerId,x:e.clientX,y:e.clientY,fired:false,t:setTimeout(()=>{if(!lp||!nearNode(world(at),11))return;lp.fired=true;
    cancelPending();if(drag&&drag.type==='ic'){const ic=st.ics.find(i=>i.id===drag.id);if(ic&&ic.col===drag.col0)drag=null;}
    touchTip=true;hover(at);try{navigator.vibrate&&navigator.vibrate(12);}catch(x){}},500)};}
svgEl.addEventListener('pointerdown',e=>{
  if(touchTip)hideTip();
  svgEl.setPointerCapture(e.pointerId);pointers.set(e.pointerId,local(e));
  if(e.pointerType!=='mouse'&&pointers.size===1)startLongPress(e);else clearLongPress();
  if(pointers.size===2){const[p,q]=[...pointers.values()];pinch={d:Math.hypot(p.x-q.x,p.y-q.y)};drag=null;cancelPending();return;}
  if(e.button===1||e.button===2){drag={type:'pan',sx:e.clientX,sy:e.clientY,vx:vp.x,vy:vp.y};return;}
  const pt=world(e),t=e.target.closest('[data-act]'),act=t&&t.dataset.act;
  if(pending){const n=nearNode(pt,12);if(n&&n!==pending.a)finishPending(n);else if(!n)cancelPending();return;}
  if(act==='sw'){toggleSw(+t.dataset.i);return;}
  if(act==='clk'){pulse();return;}
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
  if(lp&&!lp.fired&&lp.id===e.pointerId&&Math.hypot(e.clientX-lp.x,e.clientY-lp.y)>8)clearLongPress();
  if(lp&&lp.fired)return;
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
  if(lp&&lp.fired){clearLongPress();drag=null;return;}clearLongPress();
  if(drag&&drag.type==='ic'){const ic=st.ics.find(i=>i.id===drag.id);if(ic&&ic.col!==drag.col0){undo.push(drag.snap);redo=[];afterChange();}}
  if(pending&&pending.moved){const n=nearNode(world(e),12);if(n&&n!==pending.a)finishPending(n);else cancelPending();}
  else if(pending)pending.downAt=null;
  drag=null;
}
svgEl.addEventListener('pointerup',endPointer);svgEl.addEventListener('pointercancel',endPointer);
svgEl.addEventListener('pointerleave',()=>{if(!touchTip)hideTip();});
document.addEventListener('pointerdown',e=>{if(touchTip&&!svgEl.contains(e.target))hideTip();},true);
svgEl.addEventListener('contextmenu',e=>e.preventDefault());
svgEl.addEventListener('wheel',e=>{e.preventDefault();const l=local(e);zoomAt(Math.exp(-e.deltaY*(e.ctrlKey?.01:.0015)),l.x,l.y);},{passive:false});
function toggleSw(i){if(sweep)endSweep(true);st.sw[i]^=1;refresh();save();}
function setPower(on){if(sweep)endSweep(true);st.power=on;refresh();save();}
function delSel(){if(!sel)return;const s=sel;sel=null;mutate(()=>{if(s.kind==='ic')st.ics=st.ics.filter(i=>i.id!==s.id);else st.wires=st.wires.filter(i=>i.id!==s.id);});}
$('#selCard').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='delSel')delSel();else if(b.dataset.pin)showPinout(b.dataset.pin);else if(b.dataset.col){const w=st.wires.find(x=>x.id===sel.id);mutate(()=>{w.color=b.dataset.col;});}});
document.addEventListener('keydown',e=>{
  if($('#modal').classList.contains('show')){if(e.key==='Escape')closeModal();return;}
  if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))return;
  if(e.key==='Escape'){cancelPending();sel=null;renderDyn();}
  else if((e.key==='Delete'||e.key==='Backspace')&&sel){e.preventDefault();delSel();}
  else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?doRedo():doUndo();}
  else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();doRedo();}
  else if(e.shiftKey&&/^Digit[0-5]$/.test(e.code)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();toggleSw(10+ +e.code.slice(5));}
  else if(/^[0-9]$/.test(e.key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey)toggleSw(+e.key);
  else if(e.key===' '&&!/^(BUTTON|A)$/.test(document.activeElement.tagName)){e.preventDefault();pulse();}
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
$('#tFlow').onclick=()=>{flowOn=!flowOn;try{localStorage.setItem('dldlab.flow',flowOn?'1':'0');}catch(e){}flowSig=null;renderDyn();if(flowOn)toast('Flow: moving dots show where a HIGH signal travels — from the switch or chip output towards the inputs.',3600);};
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
function openModal(h,kind){const d=$('#dlg');d.innerHTML=h;d.dataset.kind=kind||'';$('#modal').classList.add('show');const f=d.querySelector('button:not(.x),textarea');f&&f.focus();}
// Closing the welcome screen in any way (×, Explore on my own, Start, Esc, outside click) means it is not shown again.
const WELCOMED='dldlab.welcomed';
function closeModal(){if($('#dlg').dataset.kind==='welcome'){try{localStorage.setItem(WELCOMED,'1');}catch(e){}}$('#modal').classList.remove('show');}
function welcomeSeen(){try{return localStorage.getItem(WELCOMED)==='1';}catch(e){return false;}}
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
  openModal(`<button class="x" data-close aria-label="Close" title="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button><div style="display:flex;align-items:center;gap:14px;padding-right:30px"><img src="assets/logo.png" width="64" height="64" alt="Faridpur Engineering College logo"><div><h2 style="margin:0">Welcome to FEC DLD Virtual Lab</h2><p class="muted" style="margin:2px 0 0">Faridpur Engineering College · Digital Logic Design lab</p></div></div><p class="muted">A trainer board, breadboard and 74LS chips — wire them up just as you would in the real lab.</p>
  <div class="welcome"><div>${ill1}<b>1 · Pick an experiment</b>Gates, adders, ALU, encoders, decoders, MUX, DEMUX, comparators, flip-flops, shift registers and counters.</div><div>${ill2}<b>2 · Follow the glow</b>Guide mode lights up each hole to connect, one wire at a time.</div><div>${ill3}<b>3 · Check your circuit</b>The lab tests every row of the truth table for you.</div></div>
  <div class="actions"><button class="btn" data-close>Explore on my own</button><button class="btn pri" id="startB">Start with the AND gate</button></div><p class="muted small" style="text-align:center;margin:14px 0 0">Developed and maintained by <b>Shahriar Hossen Sajid</b></p>`,'welcome');
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
function openExp(id){endSweep(false);curExp=EXPS.find(x=>x.id===id);checkRes=null;lastRes=null;showExp=false;lastDone=-1;selectTab('exp');renderSheet();renderDyn();save();$('#pane-exp').scrollTop=0;
  anim($('#pane-exp'),[{transform:'translateX(28px)',opacity:0},{transform:'none',opacity:1}],{duration:200,easing:'ease-out'});}
function closeExp(){endSweep(false);const p=$('#pane-exp'),go=()=>{curExp=null;guideOn=false;renderExpList();renderDyn();save();
    anim(p,[{transform:'translateX(-16px)',opacity:0},{transform:'none',opacity:1}],{duration:180,easing:'ease-out'});};
  const a=anim(p,[{transform:'none',opacity:1},{transform:'translateX(28px)',opacity:0}],{duration:150,easing:'ease-in'});if(a)a.onfinish=go;else go();}
$('#pane-exp').addEventListener('click',e=>{
  const tg=e.target.closest('[data-tog]');if(tg){const t=tg.dataset.tog;if(t==='CLK')pulse();else toggleSw(+t.slice(1));return;}
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.exp)openExp(b.dataset.exp);
  else if(b.id==='backB')closeExp();
  else if(b.id==='checkB')doCheck();
  else if(b.id==='guideB')setGuide(!guideOn);
  else if(b.id==='solB')confirmBox('Show the solution?','This clears the breadboard and builds a working circuit for this experiment. Try it yourself first — you can undo afterwards.','Build solution',()=>{undo.push(snap());redo=[];const s=buildSolution(curExp);Object.assign(st,{ics:s.ics,wires:s.wires,nextId:s.nextId});sel=null;afterChange();closeSheetMobile();toast('Solution built. Point at any wire end to trace the connection.');});
  else if(b.id==='expB'){showExp=!showExp;renderSheet();}
  else if(b.id==='skipB')endSweep(true);
  else if(b.id==='resetB'){if(sweep)endSweep(true);for(const[,s]of curExp.ins)st.sw[+s.slice(1)]=0;refresh();save();}
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
  <h3>ICs needed</h3><div style="display:flex;flex-direction:column;gap:6px">${[...new Set(e.chips)].map(c=>`<div class="part"><span class="nm">${chipName(c)}</span><span class="ds">${esc(CHIPS[c].kind)}</span><span class="pbtns"><button class="btn sm" data-pin="${c}">Pinout</button><button class="btn sm pri" data-add="${c}">Add</button></span></div>`).join('')}</div>
  <h3>Trainer connections</h3><div class="map"><span>Inputs</span><span>${[...e.ins.map(([n,s])=>`${esc(n)} → ${s}`),...(e.clk?['clock → CLOCK button']:[])].join(', ')||'none'}</span><span>Outputs</span><span>${e.outs.map(([n,s])=>`${esc(n)} → ${s}`).join(', ')}</span></div>
  <p class="muted small">Use exactly these switches and LEDs — the checker reads them. Amber tags on the board mark them.</p>
  <h3>Procedure</h3><ol class="steps">${e.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>
  <h3>${e.seq?'Sequence table':'Truth table'}</h3><div id="ttBox"></div>
  <div class="actions"><button class="btn pri" id="checkB"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5 9-10"/></svg>Check my circuit</button><button class="btn" id="expB">${showExp?'Hide':'Show'} expected outputs</button><button class="btn" id="resetB">Inputs to 0</button><button class="btn" id="solB">Show solution</button></div>
  <div id="resBox"></div>`;
  $('#pane-exp').innerHTML=h;renderSheetGuideBtn();renderLive();renderResult();
}
function renderLive(){
  if(!curExp||!$('#ttBox'))return;const e=curExp,rows=expRows(e),cur=curInputs(),obs=e.outs.map(([n,s])=>readOut(C,R,s));
  const inV=Object.fromEntries(e.ins.map(([n],k)=>[n,cur[k]])),outV=Object.fromEntries(e.outs.map(([n],k)=>[n,st.power?obs[k]:0]));
  patchHTML($('#schBox'),SCH[e.id]?schSVG(e,SCH[e.id],inV,outV):blockSVG(e,inV,outV),e.id);
  if(e.seq){$('#ttBox').innerHTML=seqTable(e,cur,obs);return;}
  const big=rows.length>32,head=`<tr>${e.ins.map(([n])=>`<th>${esc(n)}</th>`).join('')}${e.outs.map(([n],k)=>`<th class="${k?'':'sp'}">${esc(n)}</th>`).join('')}</tr>`;
  const resMap=checkRes?new Map(checkRes.slice(0,sweep?sweep.shown:Infinity).map(x=>[x.r.join(''),x])):null,bit=v=>v===''?'':`<span class="bit b${v}">${v}</span>`;
  const rowHTML=(r,live)=>{const cr=resMap&&resMap.get(r.join('')),want=e.f(Object.fromEntries(e.ins.map(([n],k)=>[n,r[k]])));
    return`<tr class="${live?'live':''}">${r.map(v=>`<td>${v}</td>`).join('')}${e.outs.map(([n],k)=>{const ex=want[n]?1:0;let v,cls='';
      if(live){v=obs[k];if(showExp||cr)cls=v===ex?'good':'bad';}else if(cr){v=cr.got[k];cls=cr.got[k]===cr.exp[k]?'good':'bad';}else v=showExp?ex:'';
      return`<td class="${k?'':'sp'} ${cls}">${bit(v)}</td>`;}).join('')}</tr>`;};
  let h;
  if(!big)h=`<div class="ttwrap"><table class="tt"><thead>${head}</thead><tbody>${rows.map(r=>rowHTML(r,r.join('')===cur.join(''))).join('')}</tbody></table></div><p class="muted small">The highlighted row matches your switches and shows your LEDs. ${showExp?'Green = correct, red = wrong.':'Flip the switches to fill in the other rows, or press Check my circuit.'}</p>`;
  else h=`<p class="small">This table has ${rows.length} rows — too many to list. The live row shows your current switches and LEDs.</p><div class="ttwrap"><table class="tt"><thead>${head}</thead><tbody>${rowHTML(cur,true)}</tbody></table></div><p class="muted small">Turn on Show expected outputs to see whether the live row is right. Check my circuit tests every row.</p>`;
  $('#ttBox').innerHTML=h;
}
// Sequence table for clocked experiments: each step sets the switches, then sends CLK pulses.
// The outputs depend on everything before, so the steps run in order from step 1.
function seqTable(e,cur,obs){
  const want=e._want||(e._want=seqExpected(e)),bit=v=>v===''?'':`<span class="bit b${v}">${v}</span>`;
  const head=`<tr><th>Step</th>${e.ins.map(([n])=>`<th>${esc(n)}</th>`).join('')}${e.clk?'<th>CLK</th>':''}${e.outs.map(([n],k)=>`<th class="${k?'':'sp'}">${esc(n)}</th>`).join('')}</tr>`;
  const live=`<tr class="live"><td>now</td>${cur.map(v=>`<td>${v}</td>`).join('')}${e.clk?'<td></td>':''}${e.outs.map((o,k)=>`<td class="${k?'':'sp'}">${bit(st.power?obs[k]:0)}</td>`).join('')}</tr>`;
  const rows=e.seq.map((s,i)=>{const cr=checkRes&&(!sweep||i<sweep.shown)&&checkRes[i];
    return`<tr><td>${i+1}</td>${s.in.map(v=>`<td>${v}</td>`).join('')}${e.clk?`<td>${s.clk?s.clk+'×':'–'}</td>`:''}${e.outs.map(([n],k)=>{const ex=want[i][n]?1:0;
      let v='',cls='';if(cr){v=cr.got[k];cls=v===ex?'good':'bad';}else if(showExp)v=ex;return`<td class="${k?'':'sp'} ${cls}">${bit(v)}</td>`;}).join('')}</tr>`;}).join('');
  return`<div class="ttwrap"><table class="tt"><thead>${head}</thead><tbody>${live}${rows}</tbody></table></div>
  <p class="muted small">Start at step 1 and go down: set the switches shown, ${e.clk?'press the CLOCK button (or Space) as many times as the CLK column says, ':''}then compare your LEDs (top row) with the expected outputs. Each step continues from the one before. ${showExp?'':'Press Show expected outputs to fill in the table.'}</p>`;
}
function doCheck(){
  endSweep(false);const e=curExp;if(!e)return;
  if(!st.ics.length){checkRes=null;setResult('bad','The breadboard is empty.',['Start with the ICs: press Add next to each chip in "ICs needed", or use Guide me on the board.']);return;}
  if(!st.power){setResult('bad','The trainer is switched off.',['Press the Power button on the left of the board.']);return;}
  const hints=[];
  if(e.only){const bad=st.ics.filter(i=>!e.only.includes(i.type));if(bad.length)hints.push(`This experiment allows only the ${e.only.map(chipName).join(', ')}. Remove ${bad.map(i=>i.ref).join(', ')}.`);}
  C.ics.forEach((x,k)=>{if(R.status[k]!=='ok')hints.push(`${x.ic.ref} (${chipName(x.ch.num)}) is not powered: pin ${x.ch.vcc} → +5 V, pin ${x.ch.gnd} → GND.`);
    else if(x.ch.cmos){const fl=floatingInputs(x);if(fl.length)hints.push(`${x.ic.ref} (${chipName(x.ch.num)}): pin${fl.length>1?'s':''} ${fl.join(', ')} ${fl.length>1?'are':'is'} floating. Tie every unused CMOS input to VDD or VSS.`);}});
  for(const[n,s]of e.outs)if(C.members[C.net(s)].length===1)hints.push(`Output ${n} is not connected — nothing is wired to ${s}.`);
  for(const[n,s]of e.ins)if(C.members[C.net(s)].length===1)hints.push(`Input ${n} (switch ${s}) is not wired to anything.`);
  if(e.clk&&C.members[C.net('CLK')].length===1)hints.push('The CLOCK output (CLK socket, right of the switches) is not wired to anything.');
  checkRes=checkExp(st,e);const bad=checkRes.filter(r=>!r.ok),unit=e.seq?'steps':'rows';
  const finish=()=>{
  if(!bad.length&&!(e.only&&hints.length)){const first=!passed.has(e.id);passed.add(e.id);try{localStorage.setItem('dldlab.passed2',JSON.stringify([...passed]));}catch(x){}
    setResult('ok',`All ${checkRes.length} ${unit} are correct. Experiment complete!`,hints.filter(h=>/floating/.test(h)).map(h=>'Good practice: '+h));confetti();toast(`Experiment complete! Every ${e.seq?'step of the sequence':'row of the truth table'} is correct.`,3200);}
  else{const ex=bad.slice(0,4).map(r=>{const set=e.ins.map(([n],k)=>n+'='+r.r[k]).join(', ');
      const when=e.seq?`At step ${r.step} (${set||'no switches'}${r.clk?`, then ${r.clk} CLOCK pulse${r.clk>1?'s':''}`:''})`:`When ${set}`;
      return`${when}: expected ${e.outs.map(([n],k)=>n+'='+r.exp[k]).join(' ')}, your LEDs show ${e.outs.map(([n],k)=>n+'='+r.got[k]).join(' ')}`;});
    setResult('bad',`${bad.length} of ${checkRes.length} ${unit} are wrong.`,[...hints,...ex,...(guideOn?[]:['Tip: press Guide me on the board to see which connections are missing.'])]);}
  if(lastRes)lastRes.fresh=true;renderResult();renderLive();
  // wrong rows shake once
  if(bad.length)document.querySelectorAll('#ttBox tbody tr').forEach(tr=>{if(tr.querySelector('td.bad'))anim(tr,[{transform:'none'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(-4px)'},{transform:'translateX(3px)'},{transform:'none'}],{duration:300,easing:'ease-out'});});
  const rb=$('#resBox');rb&&rb.scrollIntoView({behavior:motionOK()?'smooth':'auto',block:'nearest'});};
  if(motionOK()&&checkRes.length)startSweep(e,finish,unit);else finish();
}
// ---------- truth-table sweep ----------
// Purely visual replay of the check: set the switches of each row (or step) in turn so the board responds,
// and colour that table row, about 250 ms per row, for at most 16 rows. Afterwards the student's switches
// and the chips' stored state are put back. Any other action ends it.
let sweep=null;
function startSweep(e,finish,unit){
  const n=Math.min(16,checkRes.length);
  sweep={e,finish,unit,n,i:0,shown:0,timer:null,sw:st.sw.slice(),mem:JSON.stringify([...MEM])};
  if(e.seq)MEM.clear();
  const step=()=>{if(!sweep)return;if(sweep.i>=n){endSweep(true);return;}
    const i=sweep.i,row=e.seq?e.seq[i].in:checkRes[i].r;e.ins.forEach(([nm,sk],k)=>{st.sw[+sk.slice(1)]=row[k];});
    if(e.seq){run(C,st.sw,true,MEM,0);for(let p=0;p<e.seq[i].clk;p++){run(C,st.sw,true,MEM,1);run(C,st.sw,true,MEM,0);}}
    sweep.shown=i+1;sweep.i++;refresh();renderSweepBar();
    const cur=document.querySelectorAll('#ttBox tbody tr')[e.seq?i+1:-1]||document.querySelector('#ttBox tr.live');if(cur)cur.scrollIntoView({block:'nearest'});
    sweep.timer=setTimeout(step,250);};
  step();}
function renderSweepBar(){const b=$('#resBox');if(!b||!sweep)return;const N=checkRes.length;
  b.innerHTML=`<div class="sweep"><span>Checking ${sweep.unit==='steps'?'step':'row'} ${sweep.shown} of ${N}${N>sweep.n?` (showing the first ${sweep.n})`:''}…</span><button class="btn sm" id="skipB">Skip</button></div>`;}
// showResult false: just stop (e.g. the student opened another experiment).
function endSweep(showResult){if(!sweep)return;const w=sweep;sweep=null;clearTimeout(w.timer);
  st.sw=w.sw;MEM.clear();for(const[k,v]of JSON.parse(w.mem))MEM.set(k,v);refresh();
  if(showResult)w.finish();else{const b=$('#resBox');if(b)b.innerHTML='';}}
let lastRes=null;function setResult(k,t,list){lastRes={k,t,list};renderResult();}
function renderResult(){const b=$('#resBox');if(!b)return;if(sweep){renderSweepBar();return;}if(!lastRes){b.innerHTML='';return;}
  b.innerHTML=`<div class="result ${lastRes.k}">${esc(lastRes.t)}${lastRes.list.length?`<ul>${lastRes.list.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</div>`;
  // a new result pulses once (re-renders of the sheet do not replay it)
  if(lastRes.fresh){lastRes.fresh=false;anim(b.firstElementChild,[{transform:'scale(.97)',opacity:.5},{transform:'scale(1.02)',opacity:1,offset:.6},{transform:'none'}],{duration:320,easing:'ease-out'});}}
function confetti(){if(!motionOK())return;const cs=['#F59E0B','#EF4444','#22C55E','#2563EB','#A855F7'];
  for(let i=0;i<70;i++){const d=document.createElement('div');d.className='confetti';d.style.left=Math.random()*100+'vw';d.style.background=cs[i%5];d.style.animationDuration=(1.6+Math.random()*1.6)+'s';d.style.animationDelay=Math.random()*.4+'s';document.body.appendChild(d);setTimeout(()=>d.remove(),4000);}}
function renderParts(){
  const card=n=>{const c=CHIPS[n],ic=expIcon({sym:c.sym});
    return`<div class="part" data-q="${esc((n+' '+chipName(n)+' '+c.kind).toLowerCase())}">${ic.replace('class="ico"','class="ico" width="54" height="34"')}<span class="ds"><b style="color:var(--ink)">${chipName(n)}</b><br>${esc(c.kind)}</span><span class="pbtns"><button class="btn sm" data-pin="${n}">Pinout</button><button class="btn sm pri" data-add="${n}">Add</button></span></div>`;};
  $('#pane-parts').innerHTML=`<p class="muted" style="margin-top:0">${CHIP_ORDER.length} chips. Press Add to drop one across the centre gap, then drag it sideways to move it.</p>
  <input id="chipQ" class="search" type="search" placeholder="Find a chip — e.g. 7474, counter, CD4017" aria-label="Find a chip">
  ${CATS.map(([cat,label])=>{const list=CHIP_ORDER.filter(n=>CHIPS[n].cat===cat);return list.length?`<div class="grp" data-cat>${label}</div><div class="parts">${list.map(card).join('')}</div>`:'';}).join('')}
  <p class="muted small" id="chipNone" hidden>No chip matches.</p>
  <div class="grp">Your bench</div><div class="actions" style="margin-top:4px"><button class="btn" id="saveB">Save circuit code</button><button class="btn" id="loadB">Load circuit code</button><button class="btn" id="clearB" style="color:var(--danger)">Clear breadboard</button></div>`;
}
// Chip search: hide cards (and empty category headings) that do not match.
$('#pane-parts').addEventListener('input',e=>{if(e.target.id!=='chipQ')return;const q=e.target.value.trim().toLowerCase();let any=false;
  document.querySelectorAll('#pane-parts .parts').forEach(g=>{let n=0;g.querySelectorAll('.part').forEach(p=>{const ok=!q||p.dataset.q.includes(q);p.hidden=!ok;if(ok)n++;});
    g.hidden=!n;g.previousElementSibling.hidden=!n;if(n)any=true;});$('#chipNone').hidden=any;});
$('#pane-parts').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.add)addIC(b.dataset.add);else if(b.dataset.pin)showPinout(b.dataset.pin);
  else if(b.id==='clearB')confirmBox('Clear the breadboard?','This removes every IC and wire. You can undo it.','Clear',()=>mutate(()=>{st.ics=[];st.wires=[];}));
  else if(b.id==='saveB'){const code=btoa(unescape(encodeURIComponent(snap())));openModal(`<h2>Circuit code</h2><p>Copy this code to keep your circuit or share it with a classmate. Load it back with Load circuit code.</p><textarea readonly id="codeT">${code}</textarea><div class="actions"><button class="btn" data-close>Close</button><button class="btn pri" id="copyB">Copy</button></div>`);
    $('#copyB').onclick=async()=>{try{await navigator.clipboard.writeText(code);toast('Copied');}catch(x){$('#codeT').select();toast('Select the code and copy it with Ctrl+C');}};}
  else if(b.id==='loadB'){openModal(`<h2>Load circuit code</h2><p>Paste a circuit code. It replaces what is on the breadboard now (you can undo).</p><textarea id="codeT" placeholder="Paste the code here"></textarea><div class="actions"><button class="btn" data-close>Cancel</button><button class="btn pri" id="doLoad">Load</button></div>`);
    $('#doLoad').onclick=()=>{try{const d=JSON.parse(decodeURIComponent(escape(atob($('#codeT').value.trim()))));if(!validState(d))throw 0;const c=cleanState(d);closeModal();mutate(()=>{st.ics=c.ics;st.wires=c.wires;st.nextId=c.nextId;});toast('Circuit loaded');}catch(x){toast('That code is not valid. Copy the whole code and try again.');}};}
});
function renderGuide(){
  $('#pane-guide').innerHTML=`<h2>How this lab works</h2>
  <div class="actions"><button class="btn pri" id="tourB">Show the welcome screen</button></div>
  <h3>The breadboard</h3><ul class="guide"><li>Each column of 5 holes (A–E, or F–J) is joined inside. Point at any hole and its column lights up green.</li><li>The long rails along the top and bottom edges run the whole length: red + for +5 V, blue − for GND. They are dead until you wire them to the trainer's +5 V and GND terminals.</li><li>ICs sit across the centre gap so every pin gets its own column.</li></ul>
  <h3>Wiring</h3><ul class="guide"><li>Click a hole, then click another hole or a gold trainer socket. You can also drag from one to the other.</li><li>One wire per hole, like a real breadboard. Trainer sockets accept several wires.</li><li>Click a wire to change its colour or delete it (<kbd>Delete</kbd>). <kbd>Esc</kbd> cancels a wire.</li></ul>
  <h3>ICs</h3><ul class="guide"><li>The notch is on the left, so pin 1 is bottom-left. Pins count anticlockwise: along the bottom to the right, then back along the top. Pin numbers are printed on every chip.</li><li>Every IC needs power: pin 14 → +5 V and pin 7 → GND on 14-pin chips, pin 16 and pin 8 on 16-pin chips.</li><li>The dot on each chip is green when powered and red if the power is reversed.</li><li>An unconnected TTL input floats HIGH. In the real lab, tie unused inputs to +5 V or GND.</li></ul>
  <h3>Board tools</h3><ul class="guide"><li><b>Guide</b> lights up the next connection to make and ticks it off when you make it.</li><li><b>Signals</b> colours every wire by its level: red HIGH, green LOW, dashed amber floating.</li><li><b>Flow</b> sends moving dots along wires that are HIGH, from the switch or chip output towards the inputs, so you can trace a signal.</li><li>The <b>logic probe</b> (top right of the board) shows the level of whatever you point at. On a phone, press and hold a hole or pin.</li><li>The <b>CLOCK</b> button (right of the switches, or <kbd>Space</kbd>) sends one pulse to flip-flops, registers and counters.</li></ul>
  <h3>Animations</h3><label class="chk"><input type="checkbox" id="rmChk"${rmPref?" checked":""}> Reduce animations</label><p class="muted small">Turns off moving and fading effects (the checker then shows results at once). Your device's "reduce motion" setting does the same.</p>
  <h3>Shortcuts</h3><ul class="guide"><li><kbd>0</kbd>–<kbd>9</kbd> flip switches S0–S9</li><li><kbd>Shift</kbd>+<kbd>0</kbd>–<kbd>5</kbd> flip switches S10–S15</li><li><kbd>Space</kbd> sends one CLOCK pulse</li><li><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo, <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo</li><li>Mouse wheel or pinch to zoom; drag the empty bench to move around</li></ul>
  <p class="muted small" style="margin-top:20px">Your work is saved in this browser automatically.</p><h3>About</h3><p><b>FEC DLD Virtual Lab</b> for the Digital Logic Design lab (CSE 1202 &amp; CSE 1212), Faridpur Engineering College.</p><p>Developed and maintained by <b>Shahriar Hossen Sajid</b>.</p><p class="small">Copyright © 2026 Shahriar Hossen Sajid. Free software under the <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener">GNU GPL v3.0</a> with <a href="https://github.com/sajid-sys/FEC-DLD-Virtual-Lab/blob/main/ADDITIONAL-TERMS.md" target="_blank" rel="noopener">additional terms</a>, without any warranty. Source code and contributions: <a href="https://github.com/sajid-sys/FEC-DLD-Virtual-Lab" target="_blank" rel="noopener">github.com/sajid-sys/FEC-DLD-Virtual-Lab</a>.</p>`;
  $('#tourB').onclick=welcome;
  $('#rmChk').onchange=e=>{rmPref=e.target.checked;try{localStorage.setItem('dldlab.rm',rmPref?'1':'0');}catch(x){}applyMotionPref();flowSig=null;renderDyn();};
}

// ---------- side panel: resize + collapse (desktop; phones keep the bottom sheet) ----------
const SIDE_MIN=280,SIDE_DEF=400,SIDE_HIDE_AT=160,sideMax=()=>Math.max(SIDE_MIN,Math.round(innerWidth*.55));
let side={w:SIDE_DEF,collapsed:false};try{const d=JSON.parse(localStorage.getItem('dldlab.side'));if(d)side={w:+d.w||SIDE_DEF,collapsed:!!d.collapsed};}catch(e){}
const mainEl=$('main'),grip=$('#sideGrip'),isDesk=()=>innerWidth>900;
const clampW=w=>Math.max(SIDE_MIN,Math.min(sideMax(),Math.round(w)));
function applySide(){const w=clampW(side.w);mainEl.style.setProperty('--sideW',w+'px');mainEl.classList.toggle('collapsed',side.collapsed);
  grip.setAttribute('aria-valuenow',w);grip.setAttribute('aria-valuemin',SIDE_MIN);grip.setAttribute('aria-valuemax',sideMax());
  $('#sideHide').setAttribute('aria-expanded',!side.collapsed);$('#sideShow').setAttribute('aria-expanded',!side.collapsed);}
function saveSide(){try{localStorage.setItem('dldlab.side',JSON.stringify(side));}catch(e){}}
function setSideW(w){side.w=clampW(w);applySide();fit();saveSide();}
function setCollapsed(c,focus){side.collapsed=c;applySide();saveSide();
  requestAnimationFrame(()=>{fit();if(focus)(c?$('#sideShow'):$('#sideHide')).focus({preventScroll:true});});}
// Bring the panel into view: expand it on desktop, slide the sheet up on phones.
function showSide(){if(isDesk()){if(side.collapsed)setCollapsed(false);}else $('#side').classList.add('open');}
let sDrag=null;
grip.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();grip.setPointerCapture(e.pointerId);
  sDrag={x0:mainEl.getBoundingClientRect().left,w0:clampW(side.w)};document.body.classList.add('side-resizing');});
grip.addEventListener('pointermove',e=>{if(!sDrag)return;const x=e.clientX-sDrag.x0;
  $('#side').classList.toggle('will-collapse',x<SIDE_HIDE_AT);side.w=clampW(x);applySide();fit();});
function endSideDrag(e){if(!sDrag)return;const x=e.clientX-sDrag.x0,w0=sDrag.w0;sDrag=null;
  document.body.classList.remove('side-resizing');$('#side').classList.remove('will-collapse');
  if(e.type==='pointerup'&&x<SIDE_HIDE_AT){side.w=w0;setCollapsed(true);}else saveSide();}
grip.addEventListener('pointerup',endSideDrag);grip.addEventListener('pointercancel',endSideDrag);
grip.addEventListener('dblclick',()=>setSideW(SIDE_DEF));
grip.addEventListener('keydown',e=>{const w=clampW(side.w),st=e.shiftKey?60:20;
  const nw={ArrowLeft:w-st,ArrowRight:w+st,Home:SIDE_MIN,End:sideMax()}[e.key];
  if(nw!==undefined){e.preventDefault();setSideW(nw);}else if(e.key==='Enter'){e.preventDefault();setCollapsed(true,true);}});
$('#sideHide').onclick=()=>setCollapsed(true,true);
$('#sideShow').onclick=()=>setCollapsed(false,true);
addEventListener('resize',applySide);
applySide();

// ---------- init ----------
try{if(localStorage.getItem('dldlab.theme')==='dark')document.documentElement.dataset.theme='dark';}catch(e){}
(function init(){
  const d=load();st=freshState();
  if(d){Object.assign(st,cleanState(d.st));st.sw=Array.isArray(d.st.sw)&&d.st.sw.length===NSW?d.st.sw.map(v=>v===1?1:0):Array(NSW).fill(0);st.power=d.st.power!==false;curExp=EXPS.find(x=>x.id===d.exp)||null;guideOn=!!d.guideOn;sigView=!!d.sigView;}
  buildBoard();C=compile(st);R=run(C,st.sw,st.power);
  renderExpList();renderParts();renderGuide();if(curExp)renderSheet();
  renderDyn();updateUndo();requestAnimationFrame(fit);requestAnimationFrame(()=>requestAnimationFrame(()=>document.documentElement.classList.remove("boot")));
  let rt,lw=0;new ResizeObserver(()=>{const w=$('#benchWrap').clientWidth;if(Math.abs(w-lw)<2&&lw)return;lw=w;clearTimeout(rt);rt=setTimeout(fit,80);}).observe($('#benchWrap'));
  if(!d&&!welcomeSeen())setTimeout(welcome,300);
})();
