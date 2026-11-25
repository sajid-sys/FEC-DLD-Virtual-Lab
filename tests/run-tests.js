// Checks every experiment: its built-in solution must pass the whole truth table (or clock sequence),
// an empty breadboard must fail, the guided-build steps must match the solution, and the solution
// must pass the circuit-code validator. Then checks that the validator rejects unsafe or broken codes.
// Run with:  node tests/run-tests.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'core.js'), 'utf8');
const T = new Function(src + '; return {EXPS, buildSolution, checkExp, freshState, compile, guideSteps, guideStatus, validState, cleanState};')();
let failed = 0;
for (const e of T.EXPS) {
  const st = T.buildSolution(e);
  const rows = T.checkExp(st, e), bad = rows.filter(r => !r.ok).length;
  const emptyFails = T.checkExp(T.freshState(), e).some(r => !r.ok);
  const steps = T.guideSteps(e);
  const guideOk = T.guideStatus(st, T.compile(st), steps).every(Boolean);
  const loadable = T.validState(JSON.parse(JSON.stringify(st)));
  const ok = !bad && emptyFails && guideOk && loadable;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${e.id.padEnd(9)} ${rows.length} ${e.seq ? 'steps' : 'rows'}, ${steps.length} guide steps${loadable ? '' : ', solution rejected by validState'}`);
}

// ---- circuit-code validation (shared codes and localStorage go through validState) ----
console.log('\nCircuit-code validation');
const good = () => JSON.parse(JSON.stringify(T.buildSolution(T.EXPS.find(e => e.id === 'and'))));
const cases = [
  ['accepts a normal circuit', s => s, true],
  ['rejects ref <img src=x onerror=alert(1)>', s => { s.ics[0].ref = '<img src=x onerror=alert(1)>'; return s; }, false],
  ['rejects color red" onmouseover="x', s => { s.wires[0].color = 'red" onmouseover="x'; return s; }, false],
  ['rejects a 16-pin IC at column 60 (off the breadboard)', s => { s.ics.push({ id: s.nextId++, ref: 'U9', type: '74138', col: 60 }); return s; }, false],
  ['rejects overlapping ICs', s => { s.ics.push({ id: s.nextId++, ref: 'U9', type: '7400', col: s.ics[0].col + 3 }); return s; }, false],
  ['rejects an unknown chip type', s => { s.ics[0].type = '__proto__'; return s; }, false],
  ['rejects a non-integer column', s => { s.ics[0].col = 10.5; return s; }, false],
  ['rejects a wire to an unknown hole', s => { s.wires[0].b = 'Z99'; return s; }, false],
  ['rejects a non-integer wire id', s => { s.wires[0].id = '7'; return s; }, false],
  ['rejects duplicate ids', s => { s.wires[1].id = s.wires[0].id; return s; }, false],
  ['rejects nextId not above every id', s => { s.nextId = 1; return s; }, false],
  ['rejects a non-object', () => 'hello', false],
];
for (const [name, mutate, want] of cases) {
  const got = T.validState(mutate(good()));
  const ok = got === want; if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
const cleaned = T.cleanState(Object.assign(good(), { extra: 1 }));
const cleanOk = !('extra' in cleaned) && cleaned.ics.every(i => Object.keys(i).join() === 'id,ref,type,col');
if (!cleanOk) failed++;
console.log(`${cleanOk ? 'PASS' : 'FAIL'}  cleanState keeps only the known fields`);

console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${T.EXPS.length} experiments and all validation checks passed`);
process.exit(failed ? 1 : 0);
