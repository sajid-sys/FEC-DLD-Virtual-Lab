// Checks every experiment: its built-in solution must pass the whole truth table,
// an empty breadboard must fail, and the guided-build steps must match the solution.
// Run with:  node tests/run-tests.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'core.js'), 'utf8');
const T = new Function(src + '; return {EXPS, buildSolution, checkExp, freshState, compile, guideSteps, guideStatus};')();
let failed = 0;
for (const e of T.EXPS) {
  const st = T.buildSolution(e);
  const rows = T.checkExp(st, e), bad = rows.filter(r => !r.ok).length;
  const emptyFails = T.checkExp(T.freshState(), e).some(r => !r.ok);
  const steps = T.guideSteps(e);
  const guideOk = T.guideStatus(st, T.compile(st), steps).every(Boolean);
  const ok = !bad && emptyFails && guideOk;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${e.id.padEnd(9)} ${rows.length} rows, ${steps.length} guide steps`);
}
console.log(failed ? `\n${failed} experiment(s) failed` : `\nAll ${T.EXPS.length} experiments passed`);
process.exit(failed ? 1 : 0);
